import { createHash } from 'node:crypto';
import { clusterItems } from './dedupe.js';
import { rankClusters } from './rank.js';
import { buildDigest } from './digest.js';
import { canonicalUrl } from './normalize.js';

/**
 * 编排层。它只认端口，不知道自己在 DSH 里还是 CLI 里 —— 这是整个设计的支点。
 *
 * 四个端口：
 *   sources: Source[]   { id, kind, fetch(since) }
 *   ranker:  Ranker     { rank(clusters, ctx) }
 *   store:   Store      { saveDigest(digest), loadDigest(date), loadRecent(n) }
 *   clock:   Clock      { now() }
 */

const DEFAULT_SOURCE_TIMEOUT_MS = 15000;

function itemId(item) {
  return createHash('sha1')
    .update(`${canonicalUrl(item.url)}`)
    .digest('hex')
    .slice(0, 12);
}

/**
 * @param {{ sources: any[], ranker: any, store: any, clock: any }} ports
 */
export function createPipeline(ports) {
  const { sources, ranker, store, clock } = ports;
  for (const [name, value] of Object.entries({ sources, ranker, store, clock })) {
    if (!value) throw new Error(`createPipeline: 缺少端口 ${name}`);
  }

  /**
   * @param {{ profile: any, sinceHours?: number, limit?: number, timeoutMs?: number }} options
   */
  async function run(options) {
    const { profile, sinceHours = 36, limit = 15, timeoutMs = DEFAULT_SOURCE_TIMEOUT_MS } = options;
    const now = clock.now();
    const since = new Date(now.getTime() - sinceHours * 3600 * 1000);

    const results = await Promise.all(
      sources.map(async (source) => {
        try {
          const items = await source.fetch(since, { timeoutMs, now });
          return { source, items: Array.isArray(items) ? items : [], error: null };
        } catch (error) {
          // 单源失败绝不拖垮整体 —— 这是采集层唯一必须守住的性质
          return { source, items: [], error: error instanceof Error ? error.message : String(error) };
        }
      }),
    );

    const failedSources = results.filter((r) => r.error).map((r) => r.source.id);
    const raw = [];
    // 只压同一个源内部的重复条目（同一个 feed 偶尔会把同一条重复发布）。
    // 这里绝不能按 URL 全局去重 —— 两个源订阅同一个 URL 时会被吞掉一条，
    // 而"跨源共现"正是排序里最强的信号（3.0×log2(1+源数)），
    // 吞掉就等于把这个信号永久归零。跨源合并是 clusterItems 的职责。
    const seen = new Set();
    for (const result of results) {
      for (const item of result.items) {
        const withId = { ...item, id: itemId(item) };
        const key = `${item.source}\u0000${canonicalUrl(item.url)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        raw.push(withId);
      }
    }

    const clusters = clusterItems(raw, { threshold: options.clusterThreshold });
    const ranked = await ranker.rank(clusters, { profile, now, limit });

    const status = {
      feedsTotal: sources.length,
      feedsOk: sources.length - failedSources.length,
      itemsRaw: raw.length,
      itemsDeduped: clusters.length,
      candidates: ranked.length,
      failedSources,
      degraded: sources.length > 0 && sources.length - failedSources.length < sources.length / 2,
    };

    const digest = buildDigest(ranked, status, now);

    // 原文另存一份：digest 要瘦，但数字校验需要完整正文。
    // store 没有这个能力时静默跳过 —— 它属于可选端口。
    // 除了正文（数字校验要用），也留下 source / publishedAt / summary ——
    // 面板的「今日订阅文章」要按源和时间列出来，光有 url+title 拼不出来源。
    if (typeof store.saveRaw === 'function') {
      await store.saveRaw(
        digest.date,
        raw.map((it) => ({
          id: it.id,
          url: it.url,
          title: it.title,
          content: it.content ?? '',
          source: it.source ?? '',
          sourceKind: it.sourceKind ?? '',
          publishedAt: it.publishedAt ?? '',
          summary: it.summary ?? '',
        })),
      );
    }

    const path = await store.saveDigest(digest);
    return { digest, path, status };
  }

  return { run };
}
