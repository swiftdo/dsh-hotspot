import { canonicalUrl, titleKey, bigrams, jaccard } from './normalize.js';

/**
 * 把同一条新闻的多个来源合并成一个 cluster。
 *
 * 判定：canonicalUrl 完全相同，或标题 bigram Jaccard >= threshold，
 * 且发布时间落在 windowHours 窗口内（有一方没有日期时放行）。
 *
 * 为什么保留整个 items 数组：写文章时要看多个来源的措辞差异，
 * 那恰恰是判断"一手还是转载"的依据。只留一条等于把最有用的信号丢掉。
 */

const MAX_ITEMS_FOR_PAIRS = 3000;

function makeUnionFind(size) {
  const parent = Array.from({ length: size }, (_, i) => i);
  const find = (x) => {
    let root = x;
    while (parent[root] !== root) root = parent[root];
    let cur = x;
    while (parent[cur] !== cur) {
      const next = parent[cur];
      parent[cur] = root;
      cur = next;
    }
    return root;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  return { find, union };
}

/**
 * @param {import('./types.js').Item[]} items
 * @param {{ threshold?: number, windowHours?: number }} [opts]
 * @returns {import('./types.js').Cluster[]}
 */
export function clusterItems(items, opts = {}) {
  const threshold = opts.threshold ?? 0.6;
  const windowMs = (opts.windowHours ?? 72) * 3600 * 1000;

  const valid = items.filter((it) => it && it.url && it.title);
  if (valid.length === 0) return [];

  const prepared = valid.map((item) => ({
    item,
    url: canonicalUrl(item.url),
    key: titleKey(item.title),
    grams: bigrams(titleKey(item.title)),
    time: item.publishedAt ? Date.parse(item.publishedAt) : Number.NaN,
  }));

  prepared.sort((a, b) => {
    const at = Number.isNaN(a.time) ? Infinity : a.time;
    const bt = Number.isNaN(b.time) ? Infinity : b.time;
    return at - bt;
  });

  const uf = makeUnionFind(prepared.length);
  if (prepared.length <= MAX_ITEMS_FOR_PAIRS) {
    for (let i = 0; i < prepared.length; i += 1) {
      for (let j = i + 1; j < prepared.length; j += 1) {
        const a = prepared[i];
        const b = prepared[j];
        const bothDated = !Number.isNaN(a.time) && !Number.isNaN(b.time);
        if (bothDated && Math.abs(b.time - a.time) > windowMs) continue;
        if (a.url === b.url) {
          uf.union(i, j);
          continue;
        }
        if (jaccard(a.grams, b.grams) >= threshold) uf.union(i, j);
      }
    }
  }

  const buckets = new Map();
  prepared.forEach((entry, index) => {
    const root = uf.find(index);
    if (!buckets.has(root)) buckets.set(root, []);
    buckets.get(root).push(entry);
  });

  const clusters = [...buckets.values()].map((entries) => {
    // prepared 已按时间升序，entries 继承了顺序：第一条就是最早出现的
    const head = entries[0].item;
    const last = entries[entries.length - 1].item;
    const sources = new Set(entries.map((e) => e.item.source));
    return {
      id: '',
      items: entries.map((e) => e.item),
      sourceCount: sources.size,
      title: head.title,
      url: canonicalUrl(head.url),
      firstSeen: head.publishedAt || '',
      lastSeen: last.publishedAt || '',
    };
  });

  clusters.sort((a, b) => {
    if (b.sourceCount !== a.sourceCount) return b.sourceCount - a.sourceCount;
    const at = a.firstSeen ? Date.parse(a.firstSeen) : 0;
    const bt = b.firstSeen ? Date.parse(b.firstSeen) : 0;
    return bt - at;
  });

  clusters.forEach((c, i) => {
    c.id = `c-${String(i + 1).padStart(3, '0')}`;
  });

  return clusters;
}
