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
import { buildCandidateBrief } from '../core/brief.js';
import { resolveCandidate } from '../core/checks.js';
import {
  MAX_POLISH_BODY_CHARS,
  buildPolishPrompt,
  cleanPolishedBody,
  compareFacts,
  describeFactDiff,
  hasBodyContent,
} from '../core/polish.js';

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

/**
 * 给子代理挑一个父代理。
 *
 * `subagents.startActivation()` 要求 `request.parent` 是一个**活着的 Agent 对象**，
 * 并且做的是引用相等校验（`agents.get(parent.id) !== parent` 就拒绝）。官方工具
 * （dsh-tool-subagent）从 `exec.agent` 拿；面板走的是 HTTP 路由，没有 `exec.agent`，
 * 只能从 agents 注册表里取。早期版本干脆没传，宿主的 `spec.request.parent.id` 当场
 * 抛 `Cannot read properties of undefined (reading 'id')` —— 面板写正文一直是坏的。
 *
 * 顺序：当前请求的发起者（在 agent 边界内调用时最准）→ 最近一个 running 的 root
 * 会话 → 最近一个 root → 注册表最后一个。取不到就返回 null，由调用方给可操作提示。
 *
 * @param {{ currentInitiator?: Function, roots?: Function, list?: Function } | null} agents
 */
export function pickParentAgent(agents) {
  if (!agents) return null;

  try {
    const initiating = typeof agents.currentInitiator === 'function' ? agents.currentInitiator() : null;
    if (initiating) return initiating;
  } catch {
    /* 没有 initiator 边界是常态，继续往下找 */
  }

  const read = (fn) => {
    try {
      const list = typeof fn === 'function' ? fn() : null;
      return Array.isArray(list) ? list.filter((agent) => agent && typeof agent === 'object') : [];
    } catch {
      return [];
    }
  };

  const roots = read(agents.roots);
  const running = roots.filter((agent) => agent.status === 'running');
  return running.at(-1) ?? roots.at(-1) ?? read(agents.list).at(-1) ?? null;
}

/** 润色是一次 completion，不联网、不发子代理：给 3 分钟已经足够，超时说明路由卡住了。 */
export const DEFAULT_POLISH_TIMEOUT_MS = 3 * 60 * 1000;

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
  getAgents,
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

    // 定位候选：优先读草稿里记下的 candidate.id（scaffold / registerSlug 会写），
    // 找不到再退回 slugHint / 标题。以前只用 slugify(标题) === slug 反查，中文标题
    // 或自定义 slug 都会 miss —— 于是提示词里连「这是哪条热点」都没有。
    const drafts = typeof target.listDrafts === 'function' ? await target.listDrafts() : [];
    const draft = (Array.isArray(drafts) ? drafts : []).find((entry) => entry && entry.slug === clean) ?? null;
    const draftTitle = String(draft?.title ?? '');

    let supplements = { entries: [], candidate: null };
    if (typeof target.readSupplements === 'function') {
      try {
        supplements = await target.readSupplements(clean);
      } catch {
        supplements = { entries: [], candidate: null };
      }
    }

    const canResolve = store && typeof store.loadDigest === 'function';
    const resolved = canResolve
      ? await resolveCandidate({ store, slug: clean, title: draftTitle, meta: supplements?.candidate ?? null })
      : { digest: null, candidate: null };
    const item = resolved.candidate ?? null;
    const raw = resolved.digest && typeof store.loadRaw === 'function' ? await store.loadRaw(resolved.digest.date) : [];
    const brief = buildCandidateBrief(item ?? { title: draftTitle || clean }, raw);
    const title = brief.title || draftTitle || clean;
    const url = brief.url || brief.sources[0]?.url || '';

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
      // 子代理必须挂在一个活着的父代理下面，且宿主做的是引用相等校验
      const parent = pickParentAgent(typeof getAgents === 'function' ? getAgents() : null);
      if (!parent) {
        throw new Error(
          '找不到活着的会话代理，无法起子代理：先在任意会话里发一条消息把 DSH 唤醒，再回来点一次；或者切到「只用手头证据」模式（不联网）',
        );
      }
      const provider = selection.provider || pickProvider(typeof service.list === 'function' ? service.list() : []);
      route = { provider, model: '' };

      const artifact = writerArtifactPath(absDirOf(projectRoot), clean);
      await mkdir(path.dirname(artifact), { recursive: true });
      await rm(artifact, { force: true }).catch(() => {});

      const prompt = buildWriterPrompt({
        title,
        url,
        sources: item?.sources ?? [],
        brief,
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
          request: { prompt: [{ type: 'text', text: prompt }], parent },
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

      // 「只用手头证据」模式直接用素材包里的原文，不再是「只有标题 + 链接」
      const prompt = buildDirectPrompt({
        title,
        url,
        sources: brief.sources,
        supplements: supplements?.entries ?? [],
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
      candidateId: brief.id,
      briefChars: brief.chars,
      briefSources: brief.withContent,
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

/**
 * 宿主侧的「正文润色」。
 *
 * 与 createWriter 的分工：写正文要联网、要落证据，走子代理；润色只在已有正文上改表达，
 * 走一次 completion 就够 —— 子代理反而可能顺手重写事实，也慢得多。
 * 落盘仍然走 target.writeBody，frontmatter 与标题由适配器保留。
 */
export function createPolisher({
  getLlm,
  digestDir = '.hotspot',
  timeoutMs = DEFAULT_POLISH_TIMEOUT_MS,
  log = () => {},
} = {}) {
  const dirOf = () => (typeof digestDir === 'function' ? digestDir() : digestDir);
  const absDirOf = (projectRoot) => {
    const dir = String(dirOf() || '.hotspot');
    return path.isAbsolute(dir) ? dir : path.join(projectRoot || '.', dir);
  };

  return async function polish({
    slug,
    target,
    projectRoot,
    instruction,
    provider: wantedProvider,
    model: wantedModel,
  }) {
    const clean = String(slug ?? '').trim();
    if (!clean) throw new Error('缺少 slug');
    if (!target) throw new Error('还没有绑定博客项目根目录');

    // 草稿定位交给适配器：它同时认识 draft/<slug>/index.md 与 draft/<slug>.md 两种布局。
    const drafts = typeof target.listDrafts === 'function' ? await target.listDrafts() : [];
    const item = (Array.isArray(drafts) ? drafts : []).find((d) => d && d.slug === clean) ?? null;
    if (!item) throw new Error(`找不到草稿：${clean}`);

    const article = await target.readArticle(item.file);
    const before = String(article?.body ?? '');
    if (!hasBodyContent(before)) throw new Error('正文还是空的，先补全正文再润色');
    if ([...before].length > MAX_POLISH_BODY_CHARS) {
      throw new Error(`正文 ${[...before].length} 字，超过单次润色上限 ${MAX_POLISH_BODY_CHARS} 字，请拆成几篇或手动分段润色`);
    }

    const llm = typeof getLlm === 'function' ? getLlm() : null;
    if (!llm || typeof llm.stream !== 'function') {
      throw new Error('宿主没有提供 llm 服务，无法润色正文');
    }
    const catalog = await listCatalog(llm);
    const stored = await readWriterSelection(absDirOf(projectRoot));
    const selection = normalizeWriterSelection({
      provider: wantedProvider || stored.provider,
      model: wantedModel || stored.model,
    });
    const route = resolveRoute(catalog, selection);
    if (!route) throw new Error('宿主没有可用的模型路由，请先在面板里选一个模型');

    const ask = String(instruction ?? '').trim();
    const prompt = buildPolishPrompt({
      title: String(article?.data?.title ?? item.title ?? clean),
      body: before,
      instruction: ask,
    });

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(`润色超时（${Math.round(timeoutMs / 1000)}s）`)),
      timeoutMs,
    );
    let text = '';
    try {
      text = await streamOnce(llm, route, {
        system: '你是中文技术博客编辑，只做表达层润色：不新增事实，也不丢已有的事实、数字与链接。',
        prompt,
        signal: controller.signal,
        maxTokens: 8192,
      });
    } finally {
      clearTimeout(timer);
    }

    const body = cleanPolishedBody(text);
    if (!body) throw new Error('模型没有返回润色后的正文');

    const facts = compareFacts(before, body);
    const written = await target.writeBody(clean, body);
    log(
      `润色完成 ${route.provider}/${route.model}：${[...before].length} → ${[...body].length} 字` +
        (facts.ok ? '' : `（事实差异：${describeFactDiff(facts)}）`),
    );

    return {
      slug: clean,
      file: written.file,
      title: written.title,
      mode: 'polish',
      instruction: ask,
      provider: route.provider,
      model: route.model || '',
      beforeChars: [...before].length,
      bodyChars: [...body].length,
      deltaChars: [...body].length - [...before].length,
      facts,
      factWarning: describeFactDiff(facts),
    };
  };
}
