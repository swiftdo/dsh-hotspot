import { parseFeed } from '../core/parse.js';

const UA = 'hotspot/0.1 (+https://oldbird.run)';

function inWindow(item, since) {
  if (!item.publishedAt) return true;
  const time = Date.parse(item.publishedAt);
  return Number.isNaN(time) ? true : time >= since.getTime();
}

/**
 * 通用 RSS / Atom 源。
 * @param {{ id: string, url: string, kind?: string, timeoutMs?: number }} config
 */
export function createRssSource(config) {
  const { id, url, kind = 'rss', timeoutMs = 15000 } = config;
  return {
    id,
    kind,
    async fetch(since, ctx = {}) {
      const response = await fetch(url, {
        headers: { 'user-agent': UA, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
        signal: AbortSignal.timeout(ctx.timeoutMs ?? timeoutMs),
        redirect: 'follow',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const xml = await response.text();
      return parseFeed(xml, { sourceId: id, sourceKind: kind }).filter((item) => inWindow(item, since));
    },
  };
}

/**
 * GitHub releases。走 releases.atom 而不是 API —— 不需要 token，
 * 也不会撞上 API 限流。kind 单独标出来，T0 自动发布的判定要用。
 * @param {{ id: string, repo: string, timeoutMs?: number }} config
 */
export function createGithubReleasesSource(config) {
  const { id, repo, timeoutMs = 15000 } = config;
  const url = `https://github.com/${repo}/releases.atom`;
  return {
    id,
    kind: 'github-release',
    repo,
    async fetch(since, ctx = {}) {
      const response = await fetch(url, {
        headers: { 'user-agent': UA, accept: 'application/atom+xml' },
        signal: AbortSignal.timeout(ctx.timeoutMs ?? timeoutMs),
        redirect: 'follow',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const xml = await response.text();
      return parseFeed(xml, { sourceId: id, sourceKind: 'github-release' })
        .filter((item) => inWindow(item, since))
        .map((item) => ({ ...item, summary: `${repo} ${item.title}` }));
    },
  };
}

/**
 * Hacker News（Algolia，免费无 token）。points 就是最直接的热度信号。
 * @param {{ id: string, minPoints?: number, hitsPerPage?: number }} config
 */
export function createHackerNewsSource(config) {
  const { id = 'hn', minPoints = 80, hitsPerPage = 50 } = config;
  return {
    id,
    kind: 'hn',
    async fetch(since, ctx = {}) {
      const sinceEpoch = Math.floor(since.getTime() / 1000);
      const query = new URLSearchParams({
        tags: 'story',
        hitsPerPage: String(hitsPerPage),
        numericFilters: `points>${minPoints},created_at_i>${sinceEpoch}`,
      });
      const response = await fetch(`https://hn.algolia.com/api/v1/search_by_date?${query}`, {
        headers: { 'user-agent': UA },
        signal: AbortSignal.timeout(ctx.timeoutMs ?? 15000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const hits = Array.isArray(payload?.hits) ? payload.hits : [];
      return hits
        .filter((hit) => hit.title)
        .map((hit) => ({
          title: hit.title,
          url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
          publishedAt: hit.created_at ? new Date(hit.created_at).toISOString() : '',
          summary: `${hit.points ?? 0} points · ${hit.num_comments ?? 0} comments`,
          source: id,
          sourceKind: 'hn',
        }));
    },
  };
}

/**
 * 按 config.sources 数组造源。
 * @param {Array<{ id: string, kind: string, url?: string, repo?: string, minPoints?: number }>} configs
 */
export function createSources(configs) {
  return configs.map((config) => {
    switch (config.kind) {
      case 'github-release':
        if (!config.repo) throw new Error(`源 ${config.id} 缺少 repo`);
        return createGithubReleasesSource(config);
      case 'hn':
        return createHackerNewsSource(config);
      case 'rss':
      case 'atom':
        if (!config.url) throw new Error(`源 ${config.id} 缺少 url`);
        return createRssSource(config);
      default:
        throw new Error(`未知的源类型：${config.kind}（可用：rss / atom / github-release / hn）`);
    }
  });
}
