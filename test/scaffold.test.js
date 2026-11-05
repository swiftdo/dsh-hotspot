import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createVitePressTarget } from '../src/adapters/target-vitepress.js';

function makeTarget() {
  const root = mkdtempSync(path.join(tmpdir(), 'hotspot-scaffold-'));
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  return createVitePressTarget({ root });
}

const candidate = {
  id: 'h-20261105-01',
  title: 'OpenAI to acquire Pierre Computer Company',
  slugHint: 'openai-pierre',
  summary: 'OpenAI 收购代码评审公司 Pierre。',
  tags: [],
  sources: [{ title: 'OpenAI', url: 'https://openai.com/index/openai-to-acquire-pierre' }],
};

test('不传正文时仍是骨架，带「（正文待写）」占位', async () => {
  const target = makeTarget();
  const result = await target.scaffold(candidate, { slug: 'skeleton' });
  assert.equal(result.bodyWritten, false);

  const text = readFileSync(result.file, 'utf8');
  assert.ok(text.includes('（正文待写）'), '骨架应保留占位');
  assert.ok(text.includes('# OpenAI to acquire Pierre Computer Company'), '骨架应带 H1');
  assert.ok(text.includes('> 草稿，来源：'), '骨架应列来源');
});

test('传正文时一次成型：正文落盘，没有占位也没有来源块', async () => {
  const target = makeTarget();
  const body = '第一段。\n\n## 小标题\n\n第二段。';
  const result = await target.scaffold(candidate, {
    slug: 'with-body',
    title: 'OpenAI 买下 Pierre',
    description: '一笔冲着 GitHub 去的收购。',
    body,
  });
  assert.equal(result.bodyWritten, true);

  const text = readFileSync(result.file, 'utf8');
  assert.ok(!text.includes('（正文待写）'), '成型草稿不应留占位');
  assert.ok(!text.includes('> 草稿，来源：'), '正文自带参考时不该再塞来源块');
  assert.ok(text.includes('title: OpenAI 买下 Pierre'), 'title 应可用参数覆盖');
  assert.ok(text.includes('description: "一笔冲着 GitHub 去的收购。"'), 'description 应可用参数覆盖');
  assert.ok(text.includes('sitemap: false'), '草稿仍要 sitemap:false');
  // 正文没有 # 标题时自动补一个，且不重复
  assert.ok(text.includes('# OpenAI 买下 Pierre\n\n第一段。'), '缺 H1 时自动补');
  assert.equal((text.match(/^# /gm) ?? []).length, 1, '只应有一个 H1');
});

test('正文自带 # 标题时原样使用，不再补标题', async () => {
  const target = makeTarget();
  const body = '# 我自己的标题\n\n正文。';
  const result = await target.scaffold(candidate, { slug: 'own-title', body });
  const text = readFileSync(result.file, 'utf8');
  assert.ok(text.includes('# 我自己的标题'), '应保留作者标题');
  assert.ok(!text.includes('# OpenAI to acquire Pierre Computer Company'), '不应再插候选标题');
  assert.equal((text.match(/^# /gm) ?? []).length, 1);
});

test('正文是空字符串时退回骨架（不把空正文当成型）', async () => {
  const target = makeTarget();
  const result = await target.scaffold(candidate, { slug: 'empty-body', body: '   \n  ' });
  assert.equal(result.bodyWritten, false);
  assert.ok(readFileSync(result.file, 'utf8').includes('（正文待写）'));
});

test('scaffold 把候选来源记进 sources.json：check 靠它定位证据，而不是按标题猜', async () => {
  const target = makeTarget();
  const result = await target.scaffold(candidate, { slug: 'with-meta', title: '中文标题' });

  const meta = JSON.parse(readFileSync(path.join(path.dirname(result.file), 'sources.json'), 'utf8'));
  assert.equal(meta.candidate.id, 'h-20261105-01');
  assert.deepEqual(meta.candidate.sources, ['https://openai.com/index/openai-to-acquire-pierre']);
  assert.deepEqual(meta.entries, [], '还没有补料时也要留下 candidate 记录');

  const read = await target.readSupplements('with-meta');
  assert.equal(read.candidate.id, 'h-20261105-01');
});
