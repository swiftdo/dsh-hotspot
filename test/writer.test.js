import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  MAX_SOURCE_CONTENT,
  buildWriterPrompt,
  parseWriterArtifact,
  stripH1,
  writerArtifactPath,
} from '../src/core/writer.js';

test('产物路径落在 digest 目录的 writer/ 下', () => {
  assert.equal(writerArtifactPath('.hotspot', 'openai-pierre'), path.join('.hotspot', 'writer', 'openai-pierre.json'));
  assert.equal(writerArtifactPath('', 'x'), path.join('.hotspot', 'writer', 'x.json'));
});

test('任务书写明选题、一手源、候选源、字数区间与交付路径', () => {
  const prompt = buildWriterPrompt({
    title: 'OpenAI to acquire Pierre',
    url: 'https://openai.com/index/openai-to-acquire-pierre',
    sources: [
      { title: 'The Decoder', url: 'https://the-decoder.com/x' },
      { title: '无链接的一条', url: '' },
    ],
    artifactPath: '/blog/.hotspot/writer/demo.json',
  });

  assert.ok(prompt.includes('选题：OpenAI to acquire Pierre'));
  assert.ok(prompt.includes('一手源：https://openai.com/index/openai-to-acquire-pierre'));
  assert.ok(prompt.includes('- The Decoder — https://the-decoder.com/x'));
  assert.ok(!prompt.includes('无链接的一条'), '没有 URL 的来源不该进任务书');
  assert.ok(prompt.includes('800–1400 字'));
  assert.ok(prompt.includes('/blog/.hotspot/writer/demo.json'));
  assert.ok(prompt.includes('不要写一级标题'));
});

test('解析裸 JSON 产物', () => {
  const parsed = parseWriterArtifact(
    JSON.stringify({
      body: '第一段。\n\n## 小节\n\n第二段。',
      sources: [{ url: 'https://example.com/a', title: 'A', content: '原文' }],
    }),
  );
  assert.equal(parsed.ok, true);
  assert.equal(parsed.body, '第一段。\n\n## 小节\n\n第二段。');
  assert.equal(parsed.sources.length, 1);
  assert.equal(parsed.sources[0].title, 'A');
  assert.deepEqual(parsed.invalid, []);
});

test('容忍 ```json 围栏与前后解释文字', () => {
  const raw = ['好的，我读完了。', '```json', '{"body":"正文。","sources":[]}', '```', '以上。'].join('\n');
  const parsed = parseWriterArtifact(raw);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.body, '正文。');
});

test('正文自带一级标题会被去掉', () => {
  assert.equal(stripH1('# 标题\n\n正文。'), '正文。');
  const parsed = parseWriterArtifact(JSON.stringify({ body: '# 标题\n\n正文。', sources: [] }));
  assert.equal(parsed.body, '正文。');
});

test('非 http 来源被剔除并记入 invalid，标题缺省回落 URL', () => {
  const parsed = parseWriterArtifact(
    JSON.stringify({
      body: '正文。',
      sources: [{ url: 'ftp://example.com/a' }, { url: 'https://example.com/b' }],
    }),
  );
  assert.equal(parsed.sources.length, 1);
  assert.equal(parsed.sources[0].title, 'https://example.com/b');
  assert.equal(parsed.invalid.length, 1);
  assert.match(parsed.invalid[0].reason, /不是 http/);
});

test('来源正文按 MAX_SOURCE_CONTENT 截断', () => {
  const parsed = parseWriterArtifact(
    JSON.stringify({ body: '正文。', sources: [{ url: 'https://example.com/a', content: 'x'.repeat(MAX_SOURCE_CONTENT + 50) }] }),
  );
  assert.equal(parsed.sources[0].content.length, MAX_SOURCE_CONTENT);
});

test('空产物、非 JSON、body 为空都判失败', () => {
  assert.equal(parseWriterArtifact('').ok, false);
  assert.equal(parseWriterArtifact('我读完了，但没写文件').ok, false);
  assert.equal(parseWriterArtifact(JSON.stringify({ body: '   ', sources: [] })).ok, false);
});
