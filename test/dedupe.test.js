import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clusterItems } from '../src/core/dedupe.js';

function item(id, title, url, source, publishedAt) {
  return { id, title, url, source, sourceKind: 'rss', publishedAt, summary: '' };
}

test('同一标题多源 → 合成一个 cluster，sourceCount 正确', () => {
  const items = [
    item('1', 'OpenAI 发布 Images 2.6', 'https://a.com/x', 's1', '2026-11-04T13:00:00Z'),
    item('2', 'OpenAI 发布 Images 2.6，出图快 50%', 'https://b.com/y', 's2', '2026-11-04T14:00:00Z'),
    item('3', 'OpenAI 发布 Images 2.6', 'https://c.com/z', 's3', '2026-11-04T15:00:00Z'),
    item('4', '完全无关的一条新闻', 'https://d.com/w', 's1', '2026-11-04T13:00:00Z'),
  ];
  const clusters = clusterItems(items);

  assert.equal(clusters.length, 2);
  const merged = clusters.find((c) => c.items.length === 3);
  assert.ok(merged, '应该有一个 3 条的 cluster');
  assert.equal(merged.sourceCount, 3);
  assert.equal(merged.title, 'OpenAI 发布 Images 2.6', '代表标题取最早出现的那条');
});

test('同 URL 不同标题也合并 —— 这是跨源去重的主要命中方式', () => {
  const items = [
    item('1', 'OpenAI launches Images 2.6', 'https://openai.com/i26/?utm_source=x', 'hn', '2026-11-04T13:00:00Z'),
    item('2', '图像模型 2.6 来了', 'https://openai.com/i26', 'rss', '2026-11-04T13:00:00Z'),
  ];
  const clusters = clusterItems(items);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].sourceCount, 2);
});

test('超出时间窗不合并', () => {
  const items = [
    item('1', '同一条新闻标题', 'https://a.com/x', 's1', '2026-11-01T00:00:00Z'),
    item('2', '同一条新闻标题', 'https://b.com/y', 's2', '2026-11-05T00:00:00Z'),
  ];
  const clusters = clusterItems(items, { windowHours: 72 });
  assert.equal(clusters.length, 2);
});

test('cluster 保留全部原文条目，供写作时比对措辞', () => {
  const items = [
    item('1', 'OpenAI 发布 Images 2.6', 'https://a.com/x', 's1', '2026-11-04T13:00:00Z'),
    item('2', 'OpenAI 发布 Images 2.6', 'https://b.com/y', 's2', '2026-11-04T13:00:00Z'),
  ];
  const [cluster] = clusterItems(items);
  assert.equal(cluster.items.length, 2);
  assert.deepEqual(cluster.items.map((i) => i.source).sort(), ['s1', 's2']);
});

test('空输入返回空数组', () => {
  assert.deepEqual(clusterItems([]), []);
});
