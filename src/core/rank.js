import { titleKey, extractSlugHint, dateLabel } from './normalize.js';

/**
 * 确定性排序。这里刻意不调模型 —— 理由写在 README「为什么不用模型打分」。
 *
 * score = 3.0 × log2(1 + sourceCount)     跨源共现，最强信号
 *       + 1.5 × freshness(0..1)            单位：小时，按半衰期线性衰减
 *       + 2.0 × relevance(0..1)            关键词命中权重之和，封顶 1
 *       - 5.0 × penalty                    黑名单
 *
 * 每一分都落进 scoreParts，digest 里能逐项解释。同一批数据跑两次结果一致。
 */

const W_COOCCURRENCE = 3.0;
const W_FRESHNESS = 1.5;
const W_RELEVANCE = 2.0;
const W_PENALTY = 5.0;

/**
 * @typedef {object} Profile
 * @property {{ term: string, weight: number, tags?: string[] }[]} keywords
 * @property {string[]} blacklist
 */

/**
 * @param {import('./types.js').Cluster} cluster
 * @param {Profile} profile
 * @param {Date} now
 * @param {{ halfLifeHours?: number }} [opts]
 */
export function scoreCluster(cluster, profile, now, opts = {}) {
  const halfLife = opts.halfLifeHours ?? 24;
  const key = titleKey(cluster.title);

  const cooccurrence = W_COOCCURRENCE * Math.log2(1 + cluster.sourceCount);

  const ageHours = cluster.firstSeen
    ? Math.max(0, (now.getTime() - Date.parse(cluster.firstSeen)) / 3600000)
    : halfLife;
  const freshnessRatio = Math.max(0, 1 - ageHours / halfLife);
  const freshness = W_FRESHNESS * freshnessRatio;

  let relevanceSum = 0;
  const tags = [];
  for (const kw of profile.keywords ?? []) {
    const term = titleKey(kw.term);
    if (!term || !key.includes(term)) continue;
    relevanceSum += kw.weight ?? 1;
    for (const tag of kw.tags ?? []) if (!tags.includes(tag)) tags.push(tag);
  }
  const relevanceRatio = Math.min(1, relevanceSum);
  const relevance = W_RELEVANCE * relevanceRatio;

  const blackHits = (profile.blacklist ?? []).filter((word) => {
    const term = titleKey(word);
    return term && key.includes(term);
  });
  const penalty = W_PENALTY * Math.min(1, blackHits.length);

  const scoreParts = {
    cooccurrence: round(cooccurrence),
    freshness: round(freshness),
    relevance: round(relevance),
    penalty: round(penalty),
  };

  return {
    score: round(cooccurrence + freshness + relevance - penalty),
    scoreParts,
    tags,
    blacklisted: blackHits.length > 0,
  };
}

function round(n) {
  return Math.round(n * 100) / 100;
}

/**
 * 聚类 → 候选。排序在这里发生，稳定 id（h-YYYYMMDD-NN）也在这里分配。
 *
 * @param {import('./types.js').Cluster[]} clusters
 * @param {{ profile: Profile, now: Date, halfLifeHours?: number, limit?: number }} options
 * @returns {import('./types.js').Candidate[]}
 */
export function rankClusters(clusters, options) {
  const { profile, now, halfLifeHours, limit = 15 } = options;
  const label = dateLabel(now);
  const datePart = label.replace(/-/g, '');

  const scored = clusters.map((cluster) => {
    const result = scoreCluster(cluster, profile, now, { halfLifeHours });
    const head = cluster.items[0];
    return {
      cluster,
      ...result,
      slugHint: extractSlugHint(cluster.title),
      summary: (head?.summary ?? '').slice(0, 400),
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.cluster.title.localeCompare(b.cluster.title, 'zh-CN');
  });

  return scored.slice(0, limit).map((entry, index) => ({
    id: `h-${datePart}-${String(index + 1).padStart(2, '0')}`,
    title: entry.cluster.title,
    url: entry.cluster.url,
    sourceIds: [...new Set(entry.cluster.items.map((it) => it.source))],
    sourceCount: entry.cluster.sourceCount,
    firstSeen: entry.cluster.firstSeen,
    summary: entry.summary,
    slugHint: entry.slugHint,
    tags: entry.tags,
    score: entry.score,
    scoreParts: entry.scoreParts,
    cluster: entry.cluster,
  }));
}
