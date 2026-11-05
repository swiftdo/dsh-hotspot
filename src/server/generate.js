import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stripH1 } from '../core/writer.js';
import {
  buildDirectPrompt,
  collectStreamText,
  normalizeCatalog,
  normalizeWriterConfig,
  resolveWriterSelection,
  pickModelEntry,
  pickProviderEntry,
  resolveRoute,
} from '../core/writer-route.js';
import { slugify } from '../core/normalize.js';
import { buildCandidateBrief } from '../core/brief.js';
import { resolveCandidate } from '../core/checks.js';
import { buildTitlePrompt, parseTitleSuggestions } from '../core/title.js';
import { buildDescriptionPrompt, cleanDescription } from '../core/description.js';
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

/** 润色是短任务：3 分钟够用，超时说明模型路由卡住了。 */
export const DEFAULT_POLISH_TIMEOUT_MS = 3 * 60 * 1000;

/** 起标题 / 写简介都是小请求：45 秒还不回来说明路由或网络卡住了。 */
export const DEFAULT_TITLE_TIMEOUT_MS = 45 * 1000;

/** 简介与标题同量级，超时预算也一样。 */
export const DEFAULT_DESCRIPTION_TIMEOUT_MS = DEFAULT_TITLE_TIMEOUT_MS;

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

export function writerConfigPath(digestDir) {
  return path.join(String(digestDir || '.hotspot'), 'writer-config.json');
}

/**
 * 读写作配置。文件不存在或读坏都回默认值，不让面板因为一个配置打不开。
 * 返回的是完整结构：{ mode, global, writer, polish }。
 */
export async function readWriterConfig(digestDir) {
  try {
    const raw = await readFile(writerConfigPath(digestDir), 'utf8');
    return normalizeWriterConfig(JSON.parse(raw));
  } catch {
    return normalizeWriterConfig(null);
  }
}

/**
 * 局部更新：只改传进来的那几段，其余沿用盘上的值。
 * 把 writer/polish 清成空对即「跟随全局」——normalizeWriterConfig 会把它归一成空。
 */
export async function saveWriterConfig(digestDir, patch = {}) {
  const current = await readWriterConfig(digestDir);
  const next = normalizeWriterConfig({
    version: 2,
    mode: patch.mode ?? current.mode,
    global: { ...current.global, ...(patch.global || {}) },
    writer: { ...current.writer, ...(patch.writer || {}) },
    polish: { ...current.polish, ...(patch.polish || {}) },
  });
  const file = writerConfigPath(digestDir);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

/**
 * 解析「这个用途该用哪个模型」：选择文件 → 模型目录 → 路由。
 * 写正文、润色、起标题三处共用 —— 三份拷贝迟早会漂成三种行为。
 *
 * @param {any} llm
 * @param {string} dir  writer-config.json 所在目录（已是绝对路径）
 * @param {{ provider?: string, model?: string, purpose?: 'writer'|'polish' }} [opts]
 * @returns {Promise<{ provider: string, model: string }|null>}
 */
async function resolveConfiguredRoute(llm, dir, { provider, model, purpose = 'writer' } = {}) {
  const configured = resolveWriterSelection(await readWriterConfig(dir), purpose);
  const catalog = await listCatalog(llm);
  return resolveRoute(catalog, { provider: provider || configured.provider, model: model || configured.model });
}

/**
 * 把外部的取消信号接到我们自己的 controller 上。
 *
 * 超时是「我们主动掐」，取消是「用户要求停」——两者都要能让子代理 / 流真的中断，
 * 所以合成一个 controller，而不是各建一个。返回解绑函数，避免长时间持有监听。
 */
function linkAbort(outer, controller) {
  if (!outer) return () => {};
  if (outer.aborted) {
    controller.abort(outer.reason);
    return () => {};
  }
  const onAbort = () => controller.abort(outer.reason);
  outer.addEventListener('abort', onAbort, { once: true });
  return () => {
    try {
      outer.removeEventListener('abort', onAbort);
    } catch {
      /* ignore */
    }
  };
}

/** 一次 completion 的文本；message 形状优先用宿主自己的 createUserMessage，拿不到再退回朴素形状。 */
async function streamOnce(llm, route, { system, prompt, signal, maxTokens = 4096, onChunk } = {}) {
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
    if (typeof onChunk === 'function') onChunk(chunk);
  }
  return collectStreamText(chunks);
}

export function createWriter({
  getLlm,
  digestDir = '.hotspot',
  timeoutMs = DEFAULT_WRITER_TIMEOUT_MS,
  log = () => {},
} = {}) {
  const dirOf = () => (typeof digestDir === 'function' ? digestDir() : digestDir);
  /** 选择文件落在博客项目里的 digest 目录下：digestDir 可能是相对的，也可能已经是绝对路径。 */
  const absDirOf = (projectRoot) => {
    const dir = String(dirOf() || '.hotspot');
    return path.isAbsolute(dir) ? dir : path.join(projectRoot || '.', dir);
  };

  /**
   * 写正文：一次 completion，不联网、不起子代理。
   *
   * 素材来自磁盘上已经有的东西 —— 候选摘要 + 当天 raw 里的一手源原文 + 已登记的补料。
   * 为什么不再走子代理：那条路要在 HTTP 路由里伪造一个「活着的父代理」才能被宿主接纳，
   * 依赖宿主的 agents 注册表与 startActivation 的引用相等校验，宿主版本一变就断；
   * 而它多出来的能力（联网搜几篇）现在由「生成前补齐补料」替代，代价是慢与不可控。
   */
  return async function write({
    slug,
    store,
    target,
    projectRoot,
    signal: outerSignal,
    provider: wantedProvider,
    model: wantedModel,
    onStep = () => {},
  }) {
    const clean = String(slug ?? '').trim();
    if (!clean) throw new Error('缺少 slug');
    if (!target) throw new Error('还没有绑定博客项目根目录');

    const llm = typeof getLlm === 'function' ? getLlm() : null;
    if (!llm || typeof llm.stream !== 'function') {
      throw new Error('宿主没有提供 llm 服务，无法生成正文');
    }

    // 定位候选：优先读草稿里记下的 candidate.id（scaffold / registerSlug 会写），
    // 找不到再退回 slugHint / 标题。
    onStep('resolve');
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
    onStep('resolve', item?.id ? `候选 ${item.id}` : '按草稿标题定位（无候选记录）');

    onStep('brief', `${brief.sources.length} 篇原文 · ${(supplements?.entries ?? []).length} 条补料`);

    const route = await resolveConfiguredRoute(llm, absDirOf(projectRoot), {
      provider: wantedProvider,
      model: wantedModel,
      purpose: 'writer',
    });
    if (!route) throw new Error('宿主没有可用的模型路由，请先在设置页里选一个模型');
    onStep('route', `${route.provider}/${route.model || '默认模型'}`);

    const prompt = buildDirectPrompt({
      title,
      url,
      summary: brief.summary,
      tags: brief.tags,
      sources: brief.sources,
      supplements: supplements?.entries ?? [],
    });

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(`生成超时（${Math.round(timeoutMs / 1000)}s）`)),
      timeoutMs,
    );
    const unlink = linkAbort(outerSignal, controller);
    let body = '';
    onStep('write', '正在生成正文…');
    try {
      const text = await streamOnce(llm, route, {
        system: '你是技术博客作者，只用给定材料写作，不编造事实。',
        prompt,
        signal: controller.signal,
      });
      body = stripH1(String(text ?? '').trim());
    } finally {
      clearTimeout(timer);
      unlink();
    }
    if (!body) throw new Error('模型没有返回正文');
    log(`模型 ${route.provider}/${route.model} 完成：${body.slice(0, 80)}`);
    onStep('write', `模型返回 ${[...body].length} 字`);

    onStep('persist', '正在写盘与跑校验');
    const written = await target.writeBody(clean, body);
    onStep('persist', written.file);
    return {
      slug: clean,
      file: written.file,
      title: written.title,
      candidateId: brief.id,
      briefChars: brief.chars,
      briefSources: brief.withContent,
      bodyChars: [...body].length,
      mode: 'direct',
      provider: route.provider,
      model: route.model || '',
      sources: brief.sources.length,
      registered: 0,
      registerFailed: [],
    };
  };
}

/**
 * 候选素材包：当天 raw + `buildCandidateBrief`。
 * 起标题与写简介都要看同一份材料 —— 各拼一遍迟早漂成两种说法。
 */
async function candidateContext({ item, digest, store } = {}) {
  const date = digest?.date || '';
  const raw = date && store && typeof store.loadRaw === 'function' ? await store.loadRaw(date) : [];
  return buildCandidateBrief(item ?? {}, raw);
}

/**
 * 拿不到正文时的诊断探针：把 stream 吐出来的 chunk 形状记下来。
 *
 * 宿主的 chunk 嵌套层数变过（老版 `{type:'chunk',chunk:{...}}`、新版扁平
 * `{type:'text-delta'}`），报「模型没有返回」时形状是唯一线索 ——
 * 上次真机上就是靠它查出扁平 chunk 没被识别。
 */
function chunkShapeProbe() {
  const shapes = new Set();
  return {
    onChunk: (chunk) => {
      const outer = chunk && typeof chunk === 'object' ? chunk.type ?? typeof chunk : typeof chunk;
      const inner = chunk?.chunk && typeof chunk.chunk === 'object' ? chunk.chunk.type ?? '' : '';
      shapes.add(inner ? `${outer}/${inner}` : String(outer));
    },
    describe: () => [...shapes].join(', ') || '一个 chunk 都没有',
  };
}

/** 把模型输出截一段带进错误：失败十次有九次是「模型换了输出格式」。 */
function describeRaw(text, probe) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat ? flat.slice(0, 200) : `空；chunk 形状：${probe.describe()}`;
}

/**
 * 宿主侧的「起标题」：在面板弹窗里给 3 个中文标题 + 英文 slug 建议。
 *
 * 为什么复用写正文的模型选择：用户只在设置页里选过一次「用哪个模型」，
 * 再冒出一个「起标题模型」只会让人多一处要配、多一处会错。
 * 素材走和写正文同一份 brief（候选摘要 + 一手原文），标题才不是凭空编的。
 */
export function createTitleSuggester({
  getLlm,
  digestDir = '.hotspot',
  timeoutMs = DEFAULT_TITLE_TIMEOUT_MS,
  log = () => {},
} = {}) {
  const dirOf = () => (typeof digestDir === 'function' ? digestDir() : digestDir);
  const absDirOf = (projectRoot) => {
    const dir = String(dirOf() || '.hotspot');
    return path.isAbsolute(dir) ? dir : path.join(projectRoot || '.', dir);
  };

  return async function suggestTitles({
    item,
    digest,
    store,
    projectRoot,
    provider: wantedProvider,
    model: wantedModel,
    signal: outerSignal,
  } = {}) {
    const llm = typeof getLlm === 'function' ? getLlm() : null;
    if (!llm || typeof llm.stream !== 'function') {
      throw new Error('宿主没有提供 llm 服务，无法生成标题建议');
    }

    const brief = await candidateContext({ item, digest, store });

    const route = await resolveConfiguredRoute(llm, absDirOf(projectRoot), {
      provider: wantedProvider,
      model: wantedModel,
      purpose: 'writer',
    });
    if (!route) throw new Error('宿主没有可用的模型路由，请先在设置页里选一个模型');

    const prompt = buildTitlePrompt({
      title: brief.title || String(item?.title ?? ''),
      url: brief.url || String(item?.url ?? ''),
      summary: brief.summary,
      tags: brief.tags,
      sources: brief.sources,
    });

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(`起标题超时（${Math.round(timeoutMs / 1000)}s）`)),
      timeoutMs,
    );
    const unlink = linkAbort(outerSignal, controller);
    const probe = chunkShapeProbe();
    let text = '';
    try {
      text = await streamOnce(llm, route, {
        system: '你是中文技术博客编辑，只根据给定材料起标题，不编造事实。',
        prompt,
        signal: controller.signal,
        // 给 2000 而不是几百：思考型模型会先花掉一段预算再吐正文，
        // 预算给小了会表现成「模型没有返回任何文本」（写正文用 4096，同理）。
        maxTokens: 2000,
        onChunk: probe.onChunk,
      });
    } finally {
      clearTimeout(timer);
      unlink();
    }

    const suggestions = parseTitleSuggestions(text);
    if (suggestions.length === 0) {
      throw new Error(`模型没有给出可用的标题（原始返回：${describeRaw(text, probe)}）`);
    }
    log(`起标题 ${route.provider}/${route.model}：${suggestions.length} 条`);

    return {
      suggestions,
      sourceTitle: brief.title || String(item?.title ?? ''),
      provider: route.provider,
      model: route.model || '',
    };
  };
}

/**
 * 宿主侧的「按定稿标题写简介」。
 *
 * 与起标题的分工：标题是 3 个候选让人挑，简介是单值、可编辑 —— 挑完标题再按它写，
 * 免得「标题说 A、简介还在说 RSS 里的 B」。模型选择仍然复用写正文那一套。
 */
export function createDescriptionSuggester({
  getLlm,
  digestDir = '.hotspot',
  timeoutMs = DEFAULT_DESCRIPTION_TIMEOUT_MS,
  log = () => {},
} = {}) {
  const dirOf = () => (typeof digestDir === 'function' ? digestDir() : digestDir);
  const absDirOf = (projectRoot) => {
    const dir = String(dirOf() || '.hotspot');
    return path.isAbsolute(dir) ? dir : path.join(projectRoot || '.', dir);
  };

  return async function suggestDescription({
    item,
    digest,
    store,
    projectRoot,
    title,
    provider: wantedProvider,
    model: wantedModel,
    signal: outerSignal,
  } = {}) {
    const finalTitle = String(title ?? '').trim();
    if (!finalTitle) {
      const error = new Error('缺少标题，无法生成简介');
      error.code = 'ERR_TITLE_REQUIRED';
      throw error;
    }

    const llm = typeof getLlm === 'function' ? getLlm() : null;
    if (!llm || typeof llm.stream !== 'function') {
      throw new Error('宿主没有提供 llm 服务，无法生成简介');
    }

    const brief = await candidateContext({ item, digest, store });
    const route = await resolveConfiguredRoute(llm, absDirOf(projectRoot), {
      provider: wantedProvider,
      model: wantedModel,
      purpose: 'writer',
    });
    if (!route) throw new Error('宿主没有可用的模型路由，请先在设置页里选一个模型');

    const prompt = buildDescriptionPrompt({
      title: finalTitle,
      summary: brief.summary,
      tags: brief.tags,
      sources: brief.sources,
    });

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(`写简介超时（${Math.round(timeoutMs / 1000)}s）`)),
      timeoutMs,
    );
    const unlink = linkAbort(outerSignal, controller);
    const probe = chunkShapeProbe();
    let text = '';
    try {
      text = await streamOnce(llm, route, {
        system: '你是中文技术博客编辑，只根据给定材料写简介，不编造事实。',
        prompt,
        signal: controller.signal,
        // 思考型模型会先花掉一段预算：给 1200 而不是几百（起标题那边同理）。
        maxTokens: 1200,
        onChunk: probe.onChunk,
      });
    } finally {
      clearTimeout(timer);
      unlink();
    }

    const description = cleanDescription(text);
    if (!description) {
      throw new Error(`模型没有给出可用的简介（原始返回：${describeRaw(text, probe)}）`);
    }
    log(`写简介 ${route.provider}/${route.model}：${[...description].length} 字`);

    return {
      description,
      chars: [...description].length,
      title: finalTitle,
      provider: route.provider,
      model: route.model || '',
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
    signal: outerSignal,
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
    const route = await resolveConfiguredRoute(llm, absDirOf(projectRoot), {
      provider: wantedProvider,
      model: wantedModel,
      purpose: 'polish',
    });
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
    const unlink = linkAbort(outerSignal, controller);
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
      unlink();
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
