import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCandidateBrief, renderBrief } from '../src/core/brief.js';
import { buildWriterPrompt } from '../src/core/writer.js';

const candidate = {
  id: 'h-20261105-03',
  title: 'Swift 6.2 released',
  url: 'https://swift.org/blog/swift-6-2',
  summary: 'Swift 6.2 发布，带来并发安全检查与更快的构建。',
  tags: ['swift'],
  sources: [
    { source: 'swift-org', title: 'Swift 6.2', url: 'https://swift.org/blog/swift-6-2', publishedAt: '2026-11-05T00:00:00Z' },
    { source: 'hn', title: 'HN 讨论', url: 'https://news.ycombinator.com/item?id=1' },
  ],
};

const raw = [
  { url: 'https://swift.org/blog/swift-6-2/?utm_source=rss', content: 'Swift 6.2 发布，构建速度快了 20%。' },
  { url: 'https://news.ycombinator.com/item?id=1', content: 'HN 上有人讨论 Swift 6.2 的并发检查。' },
];

test('素材包带上摘要、tags 与一手源原文', () => {
  const brief = buildCandidateBrief(candidate, raw);
  assert.equal(brief.id, 'h-20261105-03');
  assert.equal(brief.title, 'Swift 6.2 released');
  assert.deepEqual(brief.tags, ['swift']);
  assert.match(brief.summary, /并发安全检查/);
  assert.equal(brief.sources.length, 2);
  assert.equal(brief.withContent, 2);
  assert.match(brief.sources[0].content, /快了 20%/);
});

test('原文按 canonicalUrl 匹配：带 utm 的来源也能对上', () => {
  const brief = buildCandidateBrief(candidate, raw);
  assert.match(brief.sources[0].content, /构建速度快了/);
});

test('单条与总量预算都会截断，且不会超支', () => {
  const long = 'x'.repeat(5000);
  const brief = buildCandidateBrief(
    { ...candidate, sources: [{ url: 'https://a.com/1' }, { url: 'https://a.com/2' }] },
    [{ url: 'https://a.com/1', content: long }, { url: 'https://a.com/2', content: long }],
    { perSourceChars: 100, totalChars: 150 },
  );
  assert.equal(brief.sources[0].chars, 100, '单条上限生效');
  assert.equal(brief.sources[1].chars, 50, '总量上限生效');
  assert.equal(brief.chars, 150);
});

test('没有留存原文的来源仍然列出，但标记为「只有链接」', () => {
  const brief = buildCandidateBrief(candidate, [], {});
  assert.equal(brief.withContent, 0);
  assert.equal(brief.sources[0].hasContent, false);
  assert.match(renderBrief(brief).join('\n'), /只留存了链接/);
});

test('来源条数受 maxSources 限制，摘要过长会截断', () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ url: `https://a.com/${i}` }));
  const brief = buildCandidateBrief({ ...candidate, sources: many, summary: 's'.repeat(2000) }, [], { maxSources: 3 });
  assert.equal(brief.sources.length, 3);
  assert.equal(brief.summary.length, 800);
});

test('renderBrief 把素材摊成「起点，不是全部」的一段', () => {
  const text = renderBrief(buildCandidateBrief(candidate, raw)).join('\n');
  assert.match(text, /这条热点目前掌握的信息/);
  assert.match(text, /摘要：/);
  assert.match(text, /标签：swift/);
  assert.match(text, /--- 一手源 1：Swift 6.2/);
  assert.match(text, /https:\/\/swift\.org\/blog\/swift-6-2/);
});

test('写作提示词带素材时，摘要与原文都在里面，并要求联网补读', () => {
  const prompt = buildWriterPrompt({
    title: candidate.title,
    url: candidate.url,
    brief: buildCandidateBrief(candidate, raw),
    artifactPath: '/tmp/x.json',
  });
  assert.match(prompt, /摘要：Swift 6.2 发布/);
  assert.match(prompt, /构建速度快了 20%/);
  assert.match(prompt, /找 3–6 篇互相独立的报道/);
  assert.match(prompt, /素材只是起点/);
});

test('没有素材包时保持旧行为：列出候选源链接', () => {
  const prompt = buildWriterPrompt({
    title: 'T',
    sources: [{ title: 'A', url: 'https://a.com/x' }],
    artifactPath: '/tmp/x.json',
  });
  assert.match(prompt, /候选源（只当线索/);
  assert.match(prompt, /https:\/\/a\.com\/x/);
});
