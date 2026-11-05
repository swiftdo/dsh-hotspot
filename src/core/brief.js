import { canonicalUrl } from './normalize.js';

/**
 * 候选素材包 —— 「这篇文章现在到底知道什么」。
 *
 * 写作提示词以前只拿到标题和一串链接：子代理既看不到摘要，也看不到一手源原文，
 * 只能自己从零搜。而 raw 里本来就为数字闸门存了一份全文（每条 ≤4000 字），
 * digest 里也有摘要与 tags —— 这些是现成的核心信息，之前一条都没进提示词。
 *
 * 这里只做纯函数：挑来源、按预算截断、摊成提示词要的文字。
 * 落盘、联网、写正文都不在这一层。
 */

/** 一次给子代理的原文预算：再多对「写一篇 800–1400 字」没有增量，只是烧上下文。 */
export const DEFAULT_BRIEF_TOTAL_CHARS = 6000;

/** 单条来源的预算。超过这个长度的一段原文，对核对事实已经够用。 */
export const DEFAULT_BRIEF_PER_SOURCE_CHARS = 2000;

/** 候选可能挂很多来源，但提示词里只需要前几条（排序上它们已经是最相关的）。 */
export const DEFAULT_BRIEF_MAX_SOURCES = 6;

function clean(text, limit = Infinity) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > limit ? flat.slice(0, limit) : flat;
}

/**
 * @param {{ id?: string, title?: string, url?: string, summary?: string, tags?: string[],
 *           sources?: Array<{ source?: string, title?: string, url?: string, publishedAt?: string }> }} candidate
 * @param {Array<{ url?: string, content?: string }>} raw  当天的原文（store.loadRaw 的形状）
 * @param {{ totalChars?: number, perSourceChars?: number, maxSources?: number }} [opts]
 */
export function buildCandidateBrief(candidate, raw = [], opts = {}) {
  const totalChars = opts.totalChars ?? DEFAULT_BRIEF_TOTAL_CHARS;
  const perSourceChars = opts.perSourceChars ?? DEFAULT_BRIEF_PER_SOURCE_CHARS;
  const maxSources = opts.maxSources ?? DEFAULT_BRIEF_MAX_SOURCES;

  const byUrl = new Map();
  for (const item of Array.isArray(raw) ? raw : []) {
    const key = canonicalUrl(item?.url) || String(item?.url ?? '');
    if (key) byUrl.set(key, item);
  }

  let budget = totalChars;
  const sources = [];
  for (const source of (candidate?.sources ?? []).filter((entry) => entry && entry.url).slice(0, maxSources)) {
    const key = canonicalUrl(source.url) || String(source.url);
    const match = byUrl.get(key);
    const text = clean(match?.content, Math.max(0, Math.min(perSourceChars, budget)));
    budget -= text.length;
    sources.push({
      source: String(source.source ?? ''),
      title: clean(source.title, 120) || String(source.url),
      url: String(source.url),
      publishedAt: String(source.publishedAt ?? ''),
      content: text,
      chars: text.length,
      hasContent: text.length > 0,
    });
  }

  return {
    id: String(candidate?.id ?? ''),
    title: clean(candidate?.title, 200),
    url: String(candidate?.url ?? ''),
    summary: clean(candidate?.summary, 800),
    tags: (Array.isArray(candidate?.tags) ? candidate.tags : []).filter(Boolean).map(String),
    sources,
    withContent: sources.filter((source) => source.hasContent).length,
    chars: sources.reduce((sum, source) => sum + source.chars, 0),
  };
}

/**
 * 把素材包摊成提示词里的一段「已知事实」。
 *
 * 刻意写成「起点而不是全部」：摘要与节选只覆盖这条热点本身，正文要有信息量
 * 仍然得联网查官方公告与独立报道 —— 这句话必须出现在提示词里，否则子代理
 * 会把摘要改写成一篇稿子就当成交付。
 */
export function renderBrief(brief) {
  if (!brief) return [];
  const lines = [];
  lines.push('这条热点目前掌握的信息（起点，不是全部）：');
  if (brief.summary) lines.push(`摘要：${brief.summary}`);
  if (brief.tags.length > 0) lines.push(`标签：${brief.tags.join('、')}`);
  if (brief.sources.length > 0) lines.push(`已有来源：${brief.sources.length} 个，其中 ${brief.withContent} 个带原文`);
  lines.push('');

  for (const [index, source] of brief.sources.entries()) {
    const name = source.title || source.url;
    const when = source.publishedAt ? ` · ${source.publishedAt}` : '';
    lines.push(`--- 一手源 ${index + 1}：${name}${when}`);
    lines.push(source.url);
    lines.push(source.hasContent ? source.content : '（只留存了链接，没有正文）');
    lines.push('');
  }
  return lines;
}
