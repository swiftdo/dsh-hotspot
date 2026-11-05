import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankClusters, scoreCluster } from '../src/core/rank.js';

const NOW = new Date('2026-11-05T00:00:00Z');

function cluster(id, title, sourceCount, firstSeen) {
  return {
    id,
    title,
    url: `https://example.com/${id}`,
    sourceCount,
    firstSeen,
    lastSeen: firstSeen,
    items: [{ id, title, url: `https://example.com/${id}`, source: 's1', publishedAt: firstSeen, summary: 'x' }],
  };
}

const profile = {
  keywords: [
    { term: 'DeepSeek', weight: 1, tags: ['DeepSeek'] },
    { term: 'swift', weight: 0.5, tags: ['Swift'] },
  ],
  blacklist: ['招聘', '课程促销'],
};

test('跨源共现是最强信号', () => {
  const multi = scoreCluster(cluster('a', '某条新闻', 4, '2026-11-04T20:00:00Z'), profile, NOW);
  const single = scoreCluster(cluster('b', '某条新闻', 1, '2026-11-04T20:00:00Z'), profile, NOW);
  assert.ok(multi.score > single.score);
  // scoreParts 统一保留两位小数
  assert.equal(multi.scoreParts.cooccurrence, Math.round(3 * Math.log2(5) * 100) / 100);
});

test('同样条件跑两次结果一致（确定性）', () => {
  const clusters = [
    cluster('a', 'DeepSeek Harness 0.2.2-rc.1 发布', 2, '2026-11-04T21:00:00Z'),
    cluster('b', '某条 Swift 新闻', 1, '2026-11-04T18:00:00Z'),
    cluster('c', '一条无关新闻', 1, '2026-11-04T23:00:00Z'),
  ];
  const first = rankClusters(clusters, { profile, now: NOW });
  const second = rankClusters(clusters, { profile, now: NOW });
  assert.deepEqual(first, second);
});

test('freshness 随年龄衰减到 0', () => {
  const fresh = scoreCluster(cluster('a', 'x', 1, '2026-11-04T23:00:00Z'), profile, NOW);
  const stale = scoreCluster(cluster('a', 'x', 1, '2026-11-04T00:00:00Z'), profile, NOW);
  assert.ok(fresh.scoreParts.freshness > stale.scoreParts.freshness);
  assert.equal(stale.scoreParts.freshness, 0);
});

test('黑名单扣 5 分', () => {
  const hit = scoreCluster(cluster('a', '某某招聘启事', 1, '2026-11-04T23:00:00Z'), profile, NOW);
  assert.equal(hit.scoreParts.penalty, 5);
  assert.equal(hit.blacklisted, true);
});

test('关键词命中映射到 tag，numberings 与 limit 生效', () => {
  const clusters = [
    cluster('a', 'DeepSeek Harness 0.2.2-rc.1 发布', 2, '2026-11-04T21:00:00Z'),
    cluster('b', '一条无关新闻', 1, '2026-11-04T23:00:00Z'),
  ];
  const ranked = rankClusters(clusters, { profile, now: NOW, limit: 1 });
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].tags[0], 'DeepSeek');
  assert.match(ranked[0].id, /^h-20261105-01$/);
});
