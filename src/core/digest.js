import { SCHEMA_VERSION } from './types.js';
import { dateLabel } from './normalize.js';

/**
 * Digest 是三方共同契约：人看 md，agent 读 json，站点可选读 json。
 * 所以字段只增不改；要改就提 schemaVersion。
 */

/**
 * @param {import('./types.js').Candidate[]} candidates
 * @param {import('./types.js').DigestStatus} status
 * @param {Date} now
 * @returns {import('./types.js').Digest}
 */
export function buildDigest(candidates, status, now) {
  return {
    schemaVersion: SCHEMA_VERSION,
    date: dateLabel(now),
    generatedAt: now.toISOString(),
    status,
    items: candidates.map((c) => ({
      id: c.id,
      title: c.title,
      url: c.url,
      sourceIds: c.sourceIds,
      sourceCount: c.sourceCount,
      firstSeen: c.firstSeen,
      summary: c.summary,
      slugHint: c.slugHint,
      tags: c.tags,
      score: c.score,
      scoreParts: c.scoreParts,
      sources: (c.cluster?.items ?? []).map((it) => ({
        source: it.source,
        title: it.title,
        url: it.url,
        publishedAt: it.publishedAt,
      })),
    })),
  };
}

/**
 * @param {import('./types.js').Digest} digest
 * @returns {string}
 */
export function renderMarkdown(digest) {
  const { status, items } = digest;
  const ratio = status.feedsTotal === 0 ? 0 : status.feedsOk / status.feedsTotal;
  const health = ratio >= 0.8 ? '正常' : ratio >= 0.5 ? '部分降级' : '严重降级';

  const lines = [];
  lines.push(`# 热点候选 ${digest.date}`);
  lines.push('');
  lines.push(
    `抓取 ${status.feedsOk}/${status.feedsTotal} 源 · 原始 ${status.itemsRaw} 条 · 去重后 ${status.itemsDeduped} 条 · 候选 ${status.candidates} 条 · 状态：${health}`,
  );
  if (status.failedSources.length > 0) {
    lines.push('');
    lines.push(`失败的源：${status.failedSources.join('、')}`);
  }
  if (status.degraded) {
    lines.push('');
    lines.push('> 存活源不足一半，这份候选不可信，不要据此发布。');
  }
  lines.push('');

  if (items.length === 0) {
    lines.push('今天没有候选。');
    return `${lines.join('\n')}\n`;
  }

  lines.push('| # | 分 | 标题 | 源数 | 标签 |');
  lines.push('|---|---|---|---|---|');
  for (const item of items) {
    const title = item.title.replace(/\|/g, '\\|').slice(0, 80);
    const tags = item.tags.length > 0 ? item.tags.join(' ') : '—';
    lines.push(`| ${item.id.slice(-2)} | ${item.score.toFixed(1)} | [${title}](${item.url}) | ${item.sourceCount} | ${tags} |`);
  }

  lines.push('');
  lines.push('排序依据：3.0×log2(1+源数) + 1.5×新鲜度 + 2.0×关键词命中 − 5.0×黑名单');
  lines.push('');
  lines.push('回复「写 <编号>」起草，例如 `写 #3`。');
  return `${lines.join('\n')}\n`;
}
