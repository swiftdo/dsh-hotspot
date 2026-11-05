import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildWriterPrompt, parseWriterArtifact, stripH1, writerArtifactPath } from '../core/writer.js';
import {
  buildDirectPrompt,
  collectStreamText,
  normalizeCatalog,
  normalizeWriterSelection,
  pickModelEntry,
  pickProviderEntry,
  resolveRoute,
} from '../core/writer-route.js';
import { slugify } from '../core/normalize.js';

/**
 * 宿主侧的「让 agent 写正文」。
 *
 * 这里只做编排：起一个子代理 → 等它把产物写到磁盘 → 读回来 → 登记补料 → 写正文 → 交给校验。
 * 模型能看见什么、能调什么工具由宿主决定；写盘与闸门始终在本文件后面的确定性代码里。
 *
 * 为什么走 subagents 而不是 llm.stream：写一篇有出处的文章需要「搜 → 读 → 交叉核对」，
 * 那是 agent 的能力面（工具、多轮、失败重试），一次 completion 拿不到。
 */

export const DEFAULT_WRITER_TIMEOUT_MS = 8 * 60 * 1000;

function textOf(result) {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object') {
    if (typeof result.text === 'string') return result.text;
    if (Array.isArray(result.blocks)) {
      return result.blocks.map((b) => (b && b.type === 'text' ? String(b.text ?? '') : '')).join('');
    }
  }
  return '';
}

/** 宿主里 provider 名不止一个时，`spawn` 是默认的内置 provider，优先用它。 */
export function pickProvider(providers) {
  const list = Array.isArray(providers) ? providers.filter((p) => typeof p === 'string' && p) : [];
  if (list.includes('spawn')) return 'spawn';
  return list[0] ?? 'spawn';
}

/** 模型目录：`listProviders()` 与 `listModels()` 的形状由宿主决定，这里只做容忍式摊平。 */
export async function listCatalog(llm) {
  if (!llm || typeof llm.listProviders !== 'function') return [];
  let providers = [];
  try {
    providers = await llm.listProviders();
  } catch {
    return [];
  }
  const entries = (Array.isArray(providers) ? providers : []).map((entry) =>
    typeof entry === 'string' ? { provider: entry } : entry,
  );
  const catalog = [];
  for (const entry of entries) {
    const provider = pickProviderEntry(entry);
    if (!provider) continue;
    let models = [];
    try {
      const listed = typeof llm.listModels === 'function' ? await llm.listModels(provider.provider) : [];
      models = (Array.isArray(listed) ? listed : []).map((m) => (typeof m === 'string' ? { id: m } : m));
    } catch {
      models = [];
    }
    catalog.push({ ...provider, models: models.map(pickModelEntry).filter(Boolean) });
  }
  return normalizeCatalog(catalog);
}

export function writerSelectionPath(digestDir) {
  return path.join(String(digestDir || '.hotspot'), 'writer-config.json');
}

export async function readWriterSelection(digestDir) {
  try {
    const raw = await readFile(writerSelectionPath(digestDir), 'utf8');
    return normalizeWriterSelection(JSON.parse(raw));
  } catch {
    return normalizeWriterSelection(null);
  }
}

export async function saveWriterSelection(digestDir, selection) {
  const clean = normalizeWriterSelection(selection);
  const file = writerSelectionPath(digestDir);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(clean, null, 2)}\n`, 'utf8');
  return clean;
}

/** 一次 completion 的文本；message 形状优先用宿主自己的 createUserMessage，拿不到再退回朴素形状。 */
async function streamOnce(llm, route, { system, prompt, signal, maxTokens = 4096 }) {
  let createUserMessage = null;
  try {
    ({ createUserMessage } = await import('@deepseek-ai/dsh-llm'));
  } catch {
    createUserMessage = null;
  }
  const message =
    typeof createUserMessage === 'function'
      ? createUserMessage({
          content: [{ type: 'text', text: prompt }],
          source: { kind: 'plugin:dsh-hotspot' },
        })
      : { role: 'user', content: [{ type: 'text', text: prompt }] };

  const chunks = [];
  for await (const chunk of llm.stream({
    provider: route.provider,
    model: route.model,
    messages: [message],
    system,
    maxTokens,
    signal,
  })) {
    chunks.push(chunk);
  }
  return collectStreamText(chunks);
}

export function createWriter({
  getSubagents,
  getLlm,
  digestDir = '.hotspot',
  timeoutMs = DEFAULT_WRITER_TIMEOUT_MS,
  log = () => {},
} = {}) {
  const dirOf = () => (typeof digestDir === 'function' ? digestDir() : digestDir);
  /** 选择文件与产物都落在博客项目里的 digest 目录下：digestDir 可能是相对的，也可能已经是绝对路径。 */
  const absDirOf = (projectRoot) => {
    const dir = String(dirOf() || '.hotspot');
    return path.isAbsolute(dir) ? dir : path.join(projectRoot || '.', dir);
  };

  return async function write({ slug, store, target, projectRoot, provider: wantedProvider, model: wantedModel, mode: wantedMode }) {
    const clean = String(slug ?? '').trim();
    if (!clean) throw new Error('缺少 slug');
    if (!target) throw new Error('还没有绑定博客项目根目录');

    const digest = store && typeof store.loadDigest === 'function' ? await store.loadDigest('latest') : null;
    const item =
      (digest?.items ?? []).find((it) => slugify(it.title ?? '') === clean) ?? null;
    const title = String(item?.title ?? clean);
    const url = String(item?.sources?.[0]?.url ?? '');

    const stored = await readWriterSelection(absDirOf(projectRoot));
    const selection = normalizeWriterSelection({
      provider: wantedProvider || stored.provider,
      model: wantedModel || stored.model,
    });
    // 默认走子代理（能联网搜）；只有明确要「只用手头证据」时才走一次 completion。
    const mode = wantedMode === 'direct' || wantedMode === 'agent' ? wantedMode : stored.mode;

    let body = '';
    let sources = [];
    let route = { provider: selection.provider, model: selection.model };

    if (mode === 'agent') {
      const service = typeof getSubagents === 'function' ? getSubagents() : null;
      if (!service) throw new Error('宿主没有提供 subagents 服务，无法生成正文');
      const provider = selection.provider || pickProvider(typeof service.list === 'function' ? service.list() : []);
      route = { provider, model: '' };

      const artifact = writerArtifactPath(absDirOf(projectRoot), clean);
      await mkdir(path.dirname(artifact), { recursive: true });
      await rm(artifact, { force: true }).catch(() => {});

      const prompt = buildWriterPrompt({
        title,
        url,
        sources: item?.sources ?? [],
        artifactPath: artifact,
      });

      if (typeof service.startActivation !== 'function') {
        throw new Error('宿主的 subagents 服务没有 startActivation，无法生成正文');
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error(`生成超时（${Math.round(timeoutMs / 1000)}s）`)), timeoutMs);
      let run;
      let result;
      try {
        run = await service.startActivation({
          provider,
          label: 'hotspot-writer',
          request: { prompt: [{ type: 'text', text: prompt }] },
          signal: controller.signal,
          delivery: 'caller',
        });
        result = await run.result;
      } finally {
        clearTimeout(timer);
        try {
          await run?.dispose?.();
        } catch {
          /* 释放失败不影响已经拿到的结果 */
        }
      }
      log(`子代理 ${provider} 完成：${textOf(result).slice(0, 80)}`);

      let raw = null;
      try {
        raw = await readFile(artifact, 'utf8');
      } catch {
        raw = null;
      }
      if (raw === null) {
        // 子代理没写文件时，退一步看它的回复里是不是直接给了 JSON。
        raw = textOf(result);
      }
      const parsed = parseWriterArtifact(raw);
      if (!parsed.ok) throw new Error(`子代理没有交出可用产物：${parsed.error}`);
      body = parsed.body;
      sources = parsed.sources;
    } else {
      const llm = typeof getLlm === 'function' ? getLlm() : null;
      if (!llm || typeof llm.stream !== 'function') {
        throw new Error('宿主没有提供 llm 服务，无法用选中的模型生成正文');
      }
      const catalog = await listCatalog(llm);
      const resolved = resolveRoute(catalog, selection);
      if (!resolved) throw new Error('宿主没有可用的模型路由，请先在面板里选一个模型');
      route = resolved;

      let supplements = [];
      if (typeof target.readSupplements === 'function') {
        try {
          supplements = (await target.readSupplements(clean)).entries ?? [];
        } catch {
          supplements = [];
        }
      }
      const prompt = buildDirectPrompt({
        title,
        url,
        sources: item?.sources ?? [],
        supplements,
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error(`生成超时（${Math.round(timeoutMs / 1000)}s）`)), timeoutMs);
      try {
        const text = await streamOnce(llm, route, {
          system: '你是技术博客作者，只用给定材料写作，不编造事实。',
          prompt,
          signal: controller.signal,
        });
        body = stripH1(String(text ?? '').trim());
      } finally {
        clearTimeout(timer);
      }
      if (!body) throw new Error('模型没有返回正文');
      log(`模型 ${route.provider}/${route.model} 完成：${body.slice(0, 80)}`);
    }

    const registered = [];
    const failed = [];
    for (const source of sources) {
      if (!source.content) {
        failed.push({ url: source.url, reason: '没有原文，数字无法比对' });
        continue;
      }
      try {
        const added = await target.addSupplement(clean, {
          url: source.url,
          title: source.title,
          content: source.content,
          kind: 'web',
        });
        registered.push(added?.entry?.url ?? source.url);
      } catch (error) {
        failed.push({ url: source.url, reason: String(error?.message ?? error) });
      }
    }

    const written = await target.writeBody(clean, body);
    return {
      slug: clean,
      file: written.file,
      title: written.title,
      bodyChars: [...body].length,
      sources: sources.length,
      registered: registered.length,
      registerFailed: failed,
      mode,
      provider: route.provider,
      model: route.model || '',
      artifact: mode === 'agent' ? path.relative(projectRoot || '.', writerArtifactPath(absDirOf(projectRoot), clean)) : '',
    };
  };
}
