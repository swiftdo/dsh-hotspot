import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseFeed } from '../src/core/parse.js';

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

test('解析 RSS 2.0：标题、链接、时间、CDATA 正文', async () => {
  const xml = await readFile(path.join(fixtures, 'rss2.xml'), 'utf8');
  const items = parseFeed(xml, { sourceId: 'test-rss' });

  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'OpenAI 发布 Images 2.6，出图快 50%');
  assert.match(items[0].url, /openai-images-2-6/);
  assert.equal(items[0].publishedAt, '2026-11-04T13:07:00.000Z');
  assert.equal(items[0].source, 'test-rss');
  assert.match(items[0].summary, /6 秒出图/);
});

test('解析 Atom：link href 取 rel=alternate', async () => {
  const xml = await readFile(path.join(fixtures, 'atom.xml'), 'utf8');
  const items = parseFeed(xml, { sourceId: 'gh', sourceKind: 'github-release' });

  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'dsh-v0.2.2-rc.1');
  assert.equal(items[0].url, 'https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.1');
  assert.equal(items[0].sourceKind, 'github-release');
  assert.match(items[0].content, /24\.9/);
});

test('非 feed 内容返回空数组，不抛异常', () => {
  assert.deepEqual(parseFeed('<html><body>nope</body></html>', { sourceId: 'x' }), []);
  assert.deepEqual(parseFeed('', { sourceId: 'x' }), []);
});

test('缺少 link 的条目被丢弃', () => {
  const xml = '<rss><channel><item><title>无链接</title></item></channel></rss>';
  assert.deepEqual(parseFeed(xml, { sourceId: 'x' }), []);
});
