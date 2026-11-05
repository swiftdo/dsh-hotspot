import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFeedItems, buildRssXml, escapeXml, toRfc822, RSS_ITEM_LIMIT } from '../src/core/rss.js';

test('escapeXml 转义五个实体并删掉 XML 非法控制字符', () => {
  assert.equal(escapeXml(`a & b < c > d " e ' f`), 'a &amp; b &lt; c &gt; d &quot; e &apos; f');
  assert.equal(escapeXml('a\u0000b\u0007c'), 'abc');
  assert.equal(escapeXml(null), '');
});

test('toRfc822 输出 GMT 时间，非法时间返回空串', () => {
  assert.equal(toRfc822('2026-11-05T08:00:00Z'), 'Thu, 05 Nov 2026 08:00:00 GMT');
  assert.equal(toRfc822('2026-11-05T16:00:00+08:00'), 'Thu, 05 Nov 2026 08:00:00 GMT');
  assert.equal(toRfc822(''), '');
  assert.equal(toRfc822('not-a-date'), '');
});

const digest = {
  date: '2026-11-05',
  generatedAt: '2026-11-05T10:00:00Z',
  items: [
    {
      id: 'cand-a',
      title: '候选 A',
      url: 'https://example.com/a?utm_source=rss',
      score: 132.48,
      sourceCount: 3,
      tags: ['swift', 'ai'],
      summary: '候选 A 的摘要',
      sources: [
        { source: 'swift-org', title: '候选 A', url: 'https://example.com/a' },
        { source: 'hn-popular', title: '候选 A HN', url: 'https://news.ycombinator.com/item?id=1' },
      ],
    },
    {
      id: 'cand-b',
      title: '候选 B',
      url: 'https://example.com/b',
      score: 100,
      sourceCount: 1,
      tags: [],
      summary: '',
      sources: [{ source: 'sopilot-hottweets', title: '候选 B', url: 'https://example.com/b' }],
    },
  ],
};

const articles = [
  {
    id: 'raw-old',
    title: '早上那篇',
    url: 'https://example.com/old',
    source: 'swift-org',
    publishedAt: '2026-11-05T01:00:00Z',
    summary: '旧文章',
    candidate: false,
  },
  {
    id: 'raw-new',
    title: '新一点的那篇',
    url: 'https://example.com/new',
    source: 'hn-popular',
    publishedAt: '2026-11-05T09:30:00Z',
    summary: '新文章',
    candidate: false,
  },
  {
    // 同一篇候选的原始条目：规范化后 URL 相同，必须被去重掉
    id: 'raw-dup',
    title: '重复的候选',
    url: 'https://example.com/a?utm_medium=feed',
    source: 'swift-org',
    publishedAt: '2026-11-05T09:40:00Z',
    summary: '不该出现',
    candidate: false,
  },
  { id: 'raw-cand', title: '已标记候选', url: 'https://example.com/c', candidate: true, publishedAt: '2026-11-05T09:50:00Z' },
  { id: 'raw-bad', title: '不是 http', url: 'javascript:alert(1)', candidate: false, publishedAt: '' },
  { id: 'raw-nodate', title: '没有发布时间', url: 'https://example.com/nodate', candidate: false, publishedAt: '' },
];

test('buildFeedItems：候选按排名在前，文章按发布时间倒序，重复 URL 去掉', () => {
  const items = buildFeedItems({
    digest,
    articles,
    sourceNames: { 'swift-org': 'Swift.org', 'hn-popular': 'Hacker News', 'sopilot-hottweets': 'SoPilot' },
  });

  assert.deepEqual(items.map((item) => item.title), [
    '候选 A',
    '候选 B',
    '新一点的那篇',
    '早上那篇',
    '没有发布时间',
  ]);
  assert.deepEqual(items.map((item) => item.kind), ['candidate', 'candidate', 'article', 'article', 'article']);
});

test('buildFeedItems：候选 pubDate 用 generatedAt，文章保留自己的时间', () => {
  const items = buildFeedItems({ digest, articles });
  assert.equal(items[0].pubDate, 'Thu, 05 Nov 2026 10:00:00 GMT');
  assert.equal(items[2].pubDate, 'Thu, 05 Nov 2026 09:30:00 GMT');
  assert.equal(items[4].pubDate, '');
});

test('buildFeedItems：候选描述带排名与得分，分类带源名与标签', () => {
  const items = buildFeedItems({
    digest,
    articles: [],
    sourceNames: { 'swift-org': 'Swift.org', 'hn-popular': 'Hacker News' },
  });
  assert.match(items[0].description, /候选 #1/);
  assert.match(items[0].description, /得分 132\.5/);
  assert.match(items[0].description, /3 源共现/);
  assert.match(items[0].description, /候选 A 的摘要/);
  assert.deepEqual(items[0].categories, ['候选 #1', 'Swift.org', 'Hacker News', 'swift', 'ai']);
  // 候选是多源共现的，描述里把每个源都写出来，阅读器不展示 category 也看得到出处。
  assert.match(items[0].description, /来源：Swift\.org、Hacker News/);
  assert.equal(items[1].description, '候选 #2 · 得分 100.0\n来源：sopilot-hottweets');
});

test('buildFeedItems：文章条目带来源名与源地址，描述首行写来源', () => {
  const items = buildFeedItems({
    digest,
    articles,
    sourceNames: { 'swift-org': 'Swift.org', 'hn-popular': 'Hacker News' },
    sourceUrls: { 'swift-org': 'https://www.swift.org/atom.xml' },
  });
  const article = items.find((item) => item.title === '早上那篇');
  assert.equal(article.sourceName, 'Swift.org');
  assert.equal(article.sourceUrl, 'https://www.swift.org/atom.xml');
  assert.ok(article.description.startsWith('来源：Swift.org'));
  assert.match(article.description, /旧文章/);

  const xml = buildRssXml({ title: 't', link: 'http://x/', items });
  assert.match(xml, /<source url="https:\/\/www\.swift\.org\/atom\.xml">Swift\.org<\/source>/);
  // 没有源地址时不写 <source>（RSS 2.0 的 source 必须带 url 才合法），但 category 仍保留来源名。
  const hn = items.find((item) => item.title === '新一点的那篇');
  assert.equal(hn.sourceUrl, '');
  assert.ok(hn.categories.includes('Hacker News'));
});

test('buildFeedItems：没有 digest 时只出文章，且遵守条数上限', () => {
  const many = Array.from({ length: RSS_ITEM_LIMIT + 20 }, (_, index) => ({
    id: `raw-${index}`,
    title: `文章 ${index}`,
    url: `https://example.com/${index}`,
    publishedAt: `2026-11-05T${String(index % 24).padStart(2, '0')}:00:00Z`,
    candidate: false,
  }));
  const items = buildFeedItems({ digest: null, articles: many });
  assert.equal(items.length, RSS_ITEM_LIMIT);
  assert.ok(items.every((item) => item.kind === 'article'));

  const limited = buildFeedItems({ digest, articles: many, limit: 3 });
  assert.equal(limited.length, 3);
  assert.equal(limited[0].kind, 'candidate');
});

test('buildFeedItems：摘要压成纯文本并截断', () => {
  const items = buildFeedItems({
    digest: {
      date: '2026-11-05',
      items: [{ id: 'x', title: 'x', url: 'https://example.com/x', summary: `<p>${'字'.repeat(400)}</p>` }],
    },
  });
  assert.ok(!items[0].description.includes('<p>'));
  assert.ok(items[0].description.endsWith('…'));
  assert.ok(items[0].description.length < 400);
});

test('buildRssXml：输出合法 RSS 2.0 骨架与转义后的条目', () => {
  const items = buildFeedItems({ digest, articles, sourceNames: {} });
  const xml = buildRssXml({
    title: '今日热点候选 & 订阅',
    link: 'http://127.0.0.1:57136/dsh-hotspot/rss.xml',
    selfUrl: 'http://127.0.0.1:57136/dsh-hotspot/rss.xml',
    description: '候选在前 <今日>',
    lastBuildDate: '2026-11-05T10:00:00Z',
    items,
  });

  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.match(xml, /<rss version="2.0" xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom">/);
  assert.match(xml, /<title>今日热点候选 &amp; 订阅<\/title>/);
  assert.match(xml, /<description>候选在前 &lt;今日&gt;<\/description>/);
  assert.match(xml, /<lastBuildDate>Thu, 05 Nov 2026 10:00:00 GMT<\/lastBuildDate>/);
  assert.match(xml, /<atom:link href="http:\/\/127\.0\.0\.1:57136\/dsh-hotspot\/rss\.xml" rel="self" type="application\/rss\+xml"\/>/);
  assert.match(xml, /<ttl>60<\/ttl>/);
  assert.equal((xml.match(/<item>/g) ?? []).length, items.length);
  assert.equal((xml.match(/<\/item>/g) ?? []).length, items.length);
  assert.match(xml, /<guid isPermaLink="false">hotspot:2026-11-05:candidate:cand-a<\/guid>/);
  assert.match(xml, /<guid isPermaLink="true">https:\/\/example\.com\/old<\/guid>/);
  assert.match(xml, /<category>候选 #1<\/category>/);
});
