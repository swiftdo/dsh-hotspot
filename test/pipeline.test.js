import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPipeline } from '../src/core/pipeline.js';
import { rankClusters } from '../src/core/rank.js';

const NOW = new Date('2026-11-05T00:00:00Z');

const profile = { keywords: [{ term: 'DeepSeek', weight: 1, tags: ['DeepSeek'] }], blacklist: [] };

function makeItem(title, url, source, publishedAt = '2026-11-04T21:00:00Z') {
  return { title, url, source, sourceKind: 'rss', publishedAt, summary: 's' };
}

function memoryStore() {
  const saved = [];
  return {
    saved,
    async saveDigest(digest) {
      saved.push(digest);
      return `/tmp/${digest.date}.json`;
    },
    async saveRaw() {},
    async loadDigest() {
      return saved[saved.length - 1];
    },
    async loadRaw() {
      return [];
    },
  };
}

function build(sources, store = memoryStore()) {
  const pipeline = createPipeline({
    sources,
    ranker: { rank: (clusters, ctx) => Promise.resolve(rankClusters(clusters, ctx)) },
    store,
    clock: { now: () => NOW },
  });
  return { pipeline, store };
}

test('单源失败不拖垮整体，失败源被记录', async () => {
  const sources = [
    { id: 'good', fetch: async () => [makeItem('DeepSeek Harness 0.2.2-rc.1', 'https://a.com/x', 'good')] },
    { id: 'bad', fetch: async () => { throw new Error('HTTP 403'); } },
  ];
  const { pipeline, store } = build(sources);
  const { status, digest } = await pipeline.run({ profile });

  assert.deepEqual(status.failedSources, ['bad']);
  assert.equal(status.feedsOk, 1);
  assert.equal(status.feedsTotal, 2);
  assert.equal(status.degraded, false);
  assert.equal(digest.items.length, 1);
  assert.equal(store.saved.length, 1);
});

test('存活源不足一半时标记 degraded', async () => {
  const sources = [
    { id: 'good', fetch: async () => [makeItem('x', 'https://a.com/x', 'good')] },
    { id: 'bad1', fetch: async () => { throw new Error('timeout'); } },
    { id: 'bad2', fetch: async () => { throw new Error('HTTP 500'); } },
  ];
  const { pipeline } = build(sources);
  const { status } = await pipeline.run({ profile });

  assert.equal(status.feedsOk, 1);
  assert.equal(status.degraded, true);
  assert.deepEqual(status.failedSources, ['bad1', 'bad2']);
});

test('跨源同一条新闻在 digest 里只剩一个候选', async () => {
  const sources = [
    {
      id: 's1',
      fetch: async () => [
        makeItem('DeepSeek Harness 0.2.2-rc.1 发布', 'https://a.com/x', 's1'),
        makeItem('完全无关的一条', 'https://a.com/y', 's1'),
      ],
    },
    {
      id: 's2',
      fetch: async () => [makeItem('DeepSeek Harness 0.2.2-rc.1 发布', 'https://b.com/z', 's2')],
    },
  ];
  const { pipeline } = build(sources);
  const { digest, status } = await pipeline.run({ profile });

  assert.equal(status.itemsRaw, 3);
  assert.equal(status.itemsDeduped, 2);
  assert.equal(digest.items.length, 2);
  const merged = digest.items.find((it) => it.sourceCount === 2);
  assert.ok(merged, '应该有一个 2 源合并的候选');
  assert.equal(merged.sources.length, 2);
});

test('两个源订阅同一个 URL → 仍是两条原始记录，但只出一个候选且 sourceCount=2', async () => {
  // 回归用例：管线曾按 URL 全局去重，把第二个源的同一 URL 直接吞掉，
  // 导致 sourceCount 永远是 1，跨源共现信号（排序里最重的一项）永久归零。
  const url = 'https://example.com/same-story?utm_source=a';
  const sources = [
    { id: 's1', fetch: async () => [makeItem('DeepSeek Harness 0.2.2-rc.1 发布', url, 's1')] },
    { id: 's2', fetch: async () => [makeItem('DeepSeek Harness 0.2.2-rc.1 发布', 'https://example.com/same-story', 's2')] },
  ];
  const { pipeline } = build(sources);
  const { digest, status } = await pipeline.run({ profile });

  assert.equal(status.itemsRaw, 2, '两条原始记录都要保留');
  assert.equal(digest.items.length, 1);
  assert.equal(digest.items[0].sourceCount, 2, '跨源共现必须被计入');
  assert.deepEqual(digest.items[0].sourceIds.sort(), ['s1', 's2']);
});

test('同一源内部的重复 URL 只保留一条', async () => {
  const sources = [
    {
      id: 's1',
      fetch: async () => [
        makeItem('同一条', 'https://example.com/a', 's1'),
        makeItem('同一条', 'https://example.com/a?utm_source=x', 's1'),
      ],
    },
  ];
  const { pipeline } = build(sources);
  const { status } = await pipeline.run({ profile });
  assert.equal(status.itemsRaw, 1);
});

test('digest 带 schemaVersion 与上海时区日期', async () => {
  const sources = [{ id: 'good', fetch: async () => [makeItem('x', 'https://a.com/x', 'good')] }];
  const { pipeline } = build(sources);
  const { digest } = await pipeline.run({ profile });

  assert.equal(digest.schemaVersion, 1);
  assert.equal(digest.date, '2026-11-05');
  assert.equal(digest.generatedAt, NOW.toISOString());
});

test('缺少端口时立刻抛错，而不是运行到一半', () => {
  assert.throws(() => createPipeline({ sources: [], ranker: {}, store: {}, clock: null }), /缺少端口 clock/);
});
