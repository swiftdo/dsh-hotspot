/**
 * RSS 2.0 输出：把「今日候选 + 今日订阅文章」摊成阅读器可订阅的订阅源。
 *
 * 排序语义很关键：候选必须排在今日文章前面，而多数阅读器按 pubDate 倒序展示，
 * 所以候选的 pubDate 用 digest.generatedAt（当天最新时刻），原文保留自己的发布时间。
 * 这里只做纯函数，不碰磁盘 —— 生成逻辑能被夹具直接跑回归。
 */

import { canonicalUrl } from './normalize.js';

/** 一次订阅最多带多少条，避免阅读器一次拉几百条。 */
export const RSS_ITEM_LIMIT = 80;
const DESCRIPTION_MAX = 320;

const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

/**
 * XML 文本转义。除了五个实体，还要删掉 XML 1.0 不允许的控制字符 ——
 * 抓来的标题里混进 \u0000 之类会让整份 XML 直接解析失败。
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeXml(value) {
  return String(value ?? '')
    .replace(XML_INVALID, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * RSS 的 pubDate 要 RFC 822 / RFC 1123 格式（`Wed, 05 Nov 2026 08:00:00 GMT`）。
 * 时间非法时返回空串，调用方就别写这个标签了 —— 写空标签阅读器会当成 1970。
 *
 * @param {unknown} value
 * @returns {string}
 */
export function toRfc822(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return date.toUTCString();
}

/**
 * 摘要压成纯文本：去掉 HTML 标签、合并空白、截断。
 *
 * @param {unknown} value
 * @param {number} max
 * @returns {string}
 */
function plainSummary(value, max = DESCRIPTION_MAX) {
  const text = String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = [...text];
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : text;
}

/**
 * @param {string} key
 * @returns {boolean}
 */
function isHttpUrl(key) {
  return /^https?:\/\//i.test(key);
}

/**
 * 候选与今日文章合成订阅条目。顺序即 XML 顺序：候选按排名，随后文章按发布时间倒序。
 *
 * @param {{
 *   digest?: { date?: string, generatedAt?: string, items?: any[] } | null,
 *   articles?: any[],
 *   sourceNames?: Record<string, string>,
 *   limit?: number,
 * }} input
 * @returns {Array<{
 *   kind: 'candidate' | 'article',
 *   rank: number,
 *   title: string,
 *   link: string,
 *   guid: string,
 *   pubDate: string,
 *   description: string,
 *   categories: string[],
 * }>}
 */
export function buildFeedItems({ digest, articles = [], sourceNames = {}, limit = RSS_ITEM_LIMIT }) {
  const candidates = Array.isArray(digest?.items) ? digest.items : [];
  const channelDate = digest?.date ?? '';
  const candidatePubDate = toRfc822(digest?.generatedAt) || toRfc822(channelDate ? `${channelDate}T00:00:00Z` : '');

  const seen = new Set();
  const entries = [];

  const markSeen = (url) => {
    const key = canonicalUrl(url);
    if (key) seen.add(key);
  };

  const registerCandidateUrls = (item) => {
    markSeen(item?.url);
    for (const source of Array.isArray(item?.sources) ? item.sources : []) markSeen(source?.url);
  };

  for (const [index, item] of candidates.entries()) {
    if (entries.length >= limit) break;
    const link = canonicalUrl(item?.url);
    if (!isHttpUrl(link)) continue;
    registerCandidateUrls(item);

    const rank = index + 1;
    const score = Number(item?.score);
    const sourceCount = Number(item?.sourceCount) || 0;
    const tags = Array.isArray(item?.tags) ? item.tags : [];
    const meta = [
      `候选 #${rank}`,
      Number.isFinite(score) ? `得分 ${score.toFixed(1)}` : '',
      sourceCount > 1 ? `${sourceCount} 源共现` : '',
    ].filter(Boolean).join(' · ');
    const summary = plainSummary(item?.summary);
    const sourceLabels = (Array.isArray(item?.sources) ? item.sources : [])
      .map((source) => sourceNames[source?.source] || source?.source)
      .filter(Boolean);

    entries.push({
      kind: 'candidate',
      rank,
      title: String(item?.title || link),
      link,
      guid: `hotspot:${channelDate}:candidate:${item?.id || canonicalUrl(link)}`,
      pubDate: candidatePubDate,
      description: [meta, summary].filter(Boolean).join('\n'),
      categories: [`候选 #${rank}`, ...sourceLabels, ...tags],
    });
  }

  const rest = [];
  for (const item of Array.isArray(articles) ? articles : []) {
    if (item?.candidate) continue;
    const link = canonicalUrl(item?.url);
    if (!isHttpUrl(link) || seen.has(link)) continue;
    seen.add(link);
    rest.push({ item, link, pubDate: toRfc822(item?.publishedAt) });
  }

  // 有发布时间的按时间倒序在前，没有时间的保持抓取顺序垫后。
  rest.sort((a, b) => {
    if (a.pubDate && b.pubDate) return a.pubDate < b.pubDate ? 1 : a.pubDate > b.pubDate ? -1 : 0;
    if (a.pubDate) return -1;
    if (b.pubDate) return 1;
    return 0;
  });

  for (const { item, link, pubDate } of rest) {
    if (entries.length >= limit) break;
    const sourceLabel = sourceNames[item?.source] || item?.source || '';
    entries.push({
      kind: 'article',
      rank: 0,
      title: String(item?.title || link),
      link,
      guid: link,
      pubDate,
      description: plainSummary(item?.summary),
      categories: sourceLabel ? [sourceLabel] : [],
    });
  }

  return entries;
}

/**
 * 生成完整 RSS 文档。
 *
 * @param {{
 *   title: string,
 *   link: string,
 *   selfUrl?: string,
 *   description?: string,
 *   language?: string,
 *   lastBuildDate?: string,
 *   ttl?: number,
 *   items: ReturnType<typeof buildFeedItems>,
 * }} input
 * @returns {string}
 */
export function buildRssXml({
  title,
  link,
  selfUrl = '',
  description = '',
  language = 'zh-cn',
  lastBuildDate = '',
  ttl = 60,
  items = [],
}) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    `<title>${escapeXml(title)}</title>`,
    `<link>${escapeXml(link)}</link>`,
    `<description>${escapeXml(description)}</description>`,
    `<language>${escapeXml(language)}</language>`,
  ];

  const built = toRfc822(lastBuildDate);
  if (built) lines.push(`<lastBuildDate>${built}</lastBuildDate>`);
  lines.push('<generator>dsh-hotspot</generator>');
  if (Number.isFinite(ttl)) lines.push(`<ttl>${Math.max(1, Math.floor(ttl))}</ttl>`);
  if (selfUrl) {
    lines.push(
      `<atom:link href="${escapeXml(selfUrl)}" rel="self" type="application/rss+xml"/>`,
    );
  }

  for (const item of items) {
    lines.push('<item>');
    lines.push(`<title>${escapeXml(item.title)}</title>`);
    lines.push(`<link>${escapeXml(item.link)}</link>`);
    const permalink = item.kind === 'article' ? 'true' : 'false';
    lines.push(`<guid isPermaLink="${permalink}">${escapeXml(item.guid)}</guid>`);
    if (item.pubDate) lines.push(`<pubDate>${item.pubDate}</pubDate>`);
    for (const category of item.categories ?? []) {
      if (!category) continue;
      lines.push(`<category>${escapeXml(category)}</category>`);
    }
    if (item.description) lines.push(`<description>${escapeXml(item.description)}</description>`);
    lines.push('</item>');
  }

  lines.push('</channel>', '</rss>', '');
  return lines.join('\n');
}
