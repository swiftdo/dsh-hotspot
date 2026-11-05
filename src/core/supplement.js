import { canonicalUrl } from './normalize.js';

/**
 * 补料（supplement）：写正文时联网补到的证据。
 *
 * 为什么需要它：候选 cluster 只带"这条新闻"的几个来源。正文要写出信息量，
 * 一定得去查官方 release notes、作者博客、issue/PR。那些页面里的版本号、日期、
 * 数字，一手源里没有 —— 于是 checkNumbers 会把它们判成"编造"。
 *
 * 两条出路都不好：手工 --allow 等于把闸门降级成白名单；不校验等于放弃防幻觉。
 * 第三条路是这份文件：把"你实际读过什么"登记下来，让闸门知道证据边界在扩，
 * 而不是知道边界在缩。
 *
 * core 只放纯函数：归一化条目、把条目摊成校验要的三份输入。
 * 落盘在 adapters/target-vitepress.js，调用方只碰这两个。
 */

export const SUPPLEMENT_VERSION = 1;

/** 单条补料保留的正文字符上限。整页抓下来塞进来只会撑爆 digest，留摘要够比对数字。 */
export const MAX_CONTENT_CHARS = 4000;

export function hostOf(url) {
  try {
    return new URL(String(url ?? '')).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * @param {{ url?: string, title?: string, content?: string, kind?: string, fetchedAt?: string }} input
 * @param {Date} [now]
 */
export function normalizeSupplementEntry(input, now = new Date()) {
  const raw = String(input?.url ?? '').trim();
  let parsed = null;
  try {
    parsed = new URL(raw);
  } catch {
    parsed = null;
  }
  // 只收 http(s)：file:// 与 data: 既没法校验外链，也不是"读过的页面"
  if (!parsed || !/^https?:$/.test(parsed.protocol)) {
    throw new Error(`补料 URL 不合法：${raw || '(空)'}`);
  }

  const url = canonicalUrl(raw);
  const host = hostOf(url);
  const title = String(input?.title ?? '').trim() || host;
  const kind = String(input?.kind ?? '').trim() || 'other';

  const flat = String(input?.content ?? '').replace(/\s+/g, ' ').trim();
  const chars = [...flat];
  const truncated = chars.length > MAX_CONTENT_CHARS;
  const content = truncated ? `${chars.slice(0, MAX_CONTENT_CHARS).join('')}…` : flat;

  return {
    url,
    host,
    title,
    kind,
    fetchedAt: String(input?.fetchedAt ?? now.toISOString()),
    content,
    truncated,
  };
}

/**
 * 按 canonicalUrl 去重。同一个页面重复登记 = 更新，不新增。
 * @param {any[]} entries
 * @param {any} entry
 */
export function upsertSupplement(entries, entry) {
  const list = Array.isArray(entries) ? entries : [];
  const index = list.findIndex((item) => canonicalUrl(item?.url) === entry.url);
  const next = [...list];
  if (index >= 0) next[index] = entry;
  else next.push(entry);
  return { entries: next, added: index < 0 };
}

/**
 * 候选元数据：这份草稿是从哪条候选写出来的。
 *
 * 落盘在 sources.json 的 `candidate` 字段，不写进 frontmatter —— frontmatter 是站点的
 * 契约，转正后要干净；而 sources.json 本来就是「这段内容的证据账本」，转正时跟着一起搬。
 * 有了它，check 不必再靠 slugHint / 标题去猜候选：中文标题猜不到时会退化成
 * 「当天全部原文都是证据」，那等于没有闸门。
 *
 * @param {any} input
 * @returns {{ id: string, url: string, sources: string[] } | null}
 */
export function normalizeCandidateMeta(input) {
  if (!input || typeof input !== 'object') return null;
  const id = String(input.id ?? '').trim();
  if (!id) return null;
  const url = canonicalUrl(input.url) || String(input.url ?? '').trim();
  const sources = [];
  for (const item of Array.isArray(input.sources) ? input.sources : []) {
    const value = typeof item === 'string' ? canonicalUrl(item) : canonicalUrl(item?.url);
    if (value && !sources.includes(value)) sources.push(value);
  }
  return { id, url, sources };
}

/**
 * 容忍三种形态：裸数组、{ entries: [...] }、损坏文件。
 * 坏条目跳过但记进 invalid —— 静默丢弃会让"补料登记了却仍报数字违规"变成悬案。
 * @param {any} raw
 */
export function normalizeSupplementFile(raw) {
  const source = Array.isArray(raw) ? raw : Array.isArray(raw?.entries) ? raw.entries : [];
  const entries = [];
  const invalid = [];
  for (const item of source) {
    try {
      entries.push(normalizeSupplementEntry(item));
    } catch (error) {
      invalid.push({ url: String(item?.url ?? ''), reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { entries, invalid, candidate: normalizeCandidateMeta(raw?.candidate) };
}

/**
 * 把补料摊成 validateArticle 需要的三份输入，并叠上配置里的白名单。
 *
 * 白名单分三层，从紧到松：
 *   1. 候选 cluster 自己的来源 URL —— 调用方直接塞，不经过这里
 *   2. 补料条目的精确 URL + 它的域名 —— 这里产出（登记过就放行）
 *   3. publish.allowedHosts —— 配置里的手工名单，原样带过去
 *
 * @param {any[]} entries
 * @param {{ allowedHosts?: Iterable<string> }} [opts]
 */
export function collectSupplementEvidence(entries, opts = {}) {
  const sourceTexts = [];
  const allowedUrls = new Set();
  const allowedHosts = new Set();
  for (const host of opts.allowedHosts ?? []) {
    const clean = String(host ?? '').trim().toLowerCase().replace(/^www\./, '');
    if (clean) allowedHosts.add(clean);
  }

  for (const entry of Array.isArray(entries) ? entries : []) {
    const url = canonicalUrl(entry?.url);
    if (!url) continue;
    allowedUrls.add(url);
    const host = hostOf(url);
    if (host) allowedHosts.add(host);
    const text = `${entry?.title ?? ''} ${entry?.content ?? ''}`.trim();
    if (text) sourceTexts.push(text);
  }

  return { sourceTexts, allowedUrls, allowedHosts };
}

/**
 * 把候选 cluster 的全部来源原文一次性登记成补料。
 *
 * 值得单独做一步的原因：digest 按天滚动，`latest` 只保留当天候选。隔天再写这篇
 * 草稿时，check 已经找不到当初那个 cluster，候选来源不再自动进证据边界。写之前
 * 先固化一份，来源就跟着草稿走（promote 时还会一起搬到文章目录）。
 *
 * @param {{ addSupplement: (slug: string, input: any) => Promise<any>, writeCandidateMeta?: Function }} target
 * @param {string} slug
 * @param {Array<{ url?: string, title?: string, source?: string }>} sources
 * @param {Array<{ url?: string, content?: string }>} [raw]
 * @param {{ id?: string, url?: string }} [candidate] 候选本体，提供时顺便记下 meta
 */
export async function registerCandidateSources(target, slug, sources, raw = [], candidate = null) {
  const registered = [];
  const failed = [];
  const raws = Array.isArray(raw) ? raw : [];

  // 先记 meta：即使下面每条正文都没留存，check 也还能按 id 找回候选来源，
  // 不至于退化成「不知道这篇是哪条候选」。
  if (candidate?.id && typeof target.writeCandidateMeta === 'function') {
    await target.writeCandidateMeta(slug, {
      id: candidate.id,
      url: candidate.url,
      sources: (Array.isArray(sources) ? sources : []).map((source) => source?.url),
    });
  }

  for (const source of Array.isArray(sources) ? sources : []) {
    const url = canonicalUrl(source?.url);
    const match = raws.find((item) => canonicalUrl(item?.url) === url);
    if (!match?.content) {
      failed.push({ url: String(source?.url ?? ''), reason: '没有留存原文' });
      continue;
    }
    try {
      await target.addSupplement(slug, {
        url: source.url,
        title: source.title || source.source,
        kind: 'candidate',
        content: match.content,
      });
      registered.push(url);
    } catch (error) {
      failed.push({ url: String(source?.url ?? ''), reason: error instanceof Error ? error.message : String(error) });
    }
  }

  return { registered, failed };
}
