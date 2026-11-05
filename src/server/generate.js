import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { buildWriterPrompt, parseWriterArtifact, writerArtifactPath } from '../core/writer.js';
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

export function createWriter({
  getSubagents,
  digestDir = '.hotspot',
  timeoutMs = DEFAULT_WRITER_TIMEOUT_MS,
  log = () => {},
} = {}) {
  return async function write({ slug, store, target, projectRoot, provider: wantedProvider }) {
    const clean = String(slug ?? '').trim();
    if (!clean) throw new Error('缺少 slug');
    if (!target) throw new Error('还没有绑定博客项目根目录');

    const digest = store && typeof store.loadDigest === 'function' ? await store.loadDigest('latest') : null;
    const item =
      (digest?.items ?? []).find((it) => slugify(it.title ?? '') === clean) ?? null;
    const title = String(item?.title ?? clean);
    const url = String(item?.sources?.[0]?.url ?? '');

    const service = typeof getSubagents === 'function' ? getSubagents() : null;
    if (!service) throw new Error('宿主没有提供 subagents 服务，无法生成正文');
    const provider = wantedProvider || pickProvider(typeof service.list === 'function' ? service.list() : []);

    const artifact = path.join(projectRoot || '.', writerArtifactPath(typeof digestDir === 'function' ? digestDir() : digestDir, clean));
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

    const registered = [];
    const failed = [];
    for (const source of parsed.sources) {
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

    const written = await target.writeBody(clean, parsed.body);
    return {
      slug: clean,
      file: written.file,
      title: written.title,
      bodyChars: [...parsed.body].length,
      sources: parsed.sources.length,
      registered: registered.length,
      registerFailed: failed,
      artifact: path.relative(projectRoot || '.', artifact),
    };
  };
}
