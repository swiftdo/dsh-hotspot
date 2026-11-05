import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createVitePressTarget } from '../src/adapters/target-vitepress.js';
import { createWriter, pickProvider, readWriterSelection, saveWriterSelection } from '../src/server/generate.js';

const CANDIDATE = {
  id: 'h-20261105-01',
  title: 'Demo Post',
  slugHint: 'demo-post',
  summary: '演示用候选。',
  tags: [],
  sources: [{ title: 'OpenAI', url: 'https://openai.com/index/demo' }],
};

async function setup({ draft = true } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'hotspot-generate-'));
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  const target = createVitePressTarget({ root });
  if (draft) await target.scaffold(CANDIDATE, { slug: 'demo-post' });
  const store = {
    async loadDigest() {
      return { date: '2026-11-05', items: [CANDIDATE] };
    },
  };
  const artifact = path.join(root, '.hotspot', 'writer', 'demo-post.json');
  return { root, target, store, artifact };
}

/** 假宿主：startActivation 时把产物写进磁盘，模拟子代理交付。 */
function fakeSubagents(artifact, payload, { text = '已写入', providers = ['spawn'] } = {}) {
  const calls = [];
  const state = { disposed: false };
  return {
    calls,
    state,
    service: {
      list: () => providers,
      async startActivation(options) {
        calls.push(options);
        await mkdir(path.dirname(artifact), { recursive: true });
        await writeFile(artifact, JSON.stringify(payload));
        return {
          result: Promise.resolve({ text }),
          async dispose() {
            state.disposed = true;
          },
        };
      },
    },
  };
}

test('子代理写产物 → 宿主登记补料 → 写正文 → 释放子代理', async () => {
  const { root, target, store, artifact } = await setup();
  const fake = fakeSubagents(artifact, {
    body: '## 事实\n\nOpenAI 在 11 月 4 日宣布这笔收购。\n\n## 参考\n\n- https://the-decoder.com/x',
    sources: [
      { url: 'https://the-decoder.com/x', title: 'The Decoder', content: 'OpenAI announced on Nov 4.' },
      { url: 'https://siliconangle.com/y', title: 'SiliconANGLE' },
    ],
  });

  const body = '## 事实\n\nOpenAI 在 11 月 4 日宣布这笔收购。\n\n## 参考\n\n- https://the-decoder.com/x';
  const write = createWriter({ getSubagents: () => fake.service, digestDir: '.hotspot' });
  const value = await write({ slug: 'demo-post', store, target, projectRoot: root });

  assert.equal(value.slug, 'demo-post');
  assert.equal(value.registered, 1, '只有带原文的来源才登记');
  assert.equal(value.registerFailed.length, 1);
  assert.match(value.registerFailed[0].reason, /没有原文/);
  assert.equal(value.bodyChars, [...body].length);
  assert.equal(fake.state.disposed, true, '跑完必须 dispose，否则子代理常驻');
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].provider, 'spawn');
  assert.equal(fake.calls[0].delivery, 'caller');

  const draft = readFileSync(path.join(root, 'docs', 'draft', 'demo-post', 'index.md'), 'utf8');
  assert.ok(draft.includes('## 事实'), '正文应写进草稿');
  assert.ok(draft.includes('title: Demo Post'), 'frontmatter 必须保留');
  assert.ok(draft.includes('# Demo Post'), '缺 H1 时宿主补一个');
  assert.ok(!draft.includes('（正文待写）'), '写完不该留占位');

  const supplements = JSON.parse(readFileSync(path.join(root, 'docs', 'draft', 'demo-post', 'sources.json'), 'utf8'));
  assert.equal(supplements.entries.length, 1);
  assert.equal(supplements.entries[0].kind, 'web');
});

test('宿主没有 subagents 服务时明确报错', async () => {
  const { target, store } = await setup();
  const write = createWriter({ getSubagents: () => null });
  await assert.rejects(() => write({ slug: 'demo-post', store, target, projectRoot: '/tmp' }), /subagents 服务/);
});

test('子代理没交产物时抛错，不写草稿', async () => {
  const { root, target, store } = await setup();
  const service = {
    list: () => ['spawn'],
    async startActivation() {
      return { result: Promise.resolve({ text: '我写好了，但忘记存文件' }), async dispose() {} };
    },
  };
  const write = createWriter({ getSubagents: () => service });
  await assert.rejects(() => write({ slug: 'demo-post', store, target, projectRoot: root }), /没有交出可用产物/);

  const draft = readFileSync(path.join(root, 'docs', 'draft', 'demo-post', 'index.md'), 'utf8');
  assert.ok(draft.includes('（正文待写）'), '失败时草稿保持原样');
});

test('草稿不存在时写正文失败并说明原因', async () => {
  const { root, target, store, artifact } = await setup({ draft: false });
  const fake = fakeSubagents(artifact, { body: '正文。', sources: [] });
  const write = createWriter({ getSubagents: () => fake.service });
  await assert.rejects(() => write({ slug: 'demo-post', store, target, projectRoot: root }), /草稿|找不到/);
});

test('provider 缺省优先 spawn，没有就用第一个', () => {
  assert.equal(pickProvider(['custom', 'spawn']), 'spawn');
  assert.equal(pickProvider(['custom']), 'custom');
  assert.equal(pickProvider([]), 'spawn');
  assert.equal(pickProvider(null), 'spawn');
});

test('direct 模式：用选中的模型一次生成，只用手头证据并写进草稿', async () => {
  const { root, target, store } = await setup();
  const prompts = [];
  const llm = {
    async listProviders() {
      return [{ provider: 'deepseek', name: 'DeepSeek' }, { provider: 'openai', name: 'OpenAI' }];
    },
    async listModels(provider) {
      return provider === 'openai' ? [{ id: 'gpt-x', name: 'GPT X' }] : [{ id: 'chat', name: 'Chat' }];
    },
    async *stream(options) {
      prompts.push(options);
      yield { type: 'chunk', chunk: { type: 'text-delta', text: '# 模型自己写的一级标题\n\n' } };
      yield { type: 'text-chunks', texts: ['这是正文。', '第二段。'] };
    },
  };
  const write = createWriter({ getLlm: () => llm, digestDir: '.hotspot', log: () => {} });
  const value = await write({
    slug: 'demo-post',
    store,
    target,
    projectRoot: root,
    mode: 'direct',
    provider: 'openai',
    model: 'gpt-x',
  });

  assert.equal(value.mode, 'direct');
  assert.equal(value.provider, 'openai');
  assert.equal(value.model, 'gpt-x');
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].provider, 'openai');
  assert.equal(prompts[0].model, 'gpt-x');
  assert.match(prompts[0].messages[0].content[0].text, /只能使用下面给出的材料/);

  const text = readFileSync(path.join(root, value.file), 'utf8');
  assert.match(text, /^---/);
  assert.match(text, /这是正文。第二段。/);
  // 模型自带的一级标题必须被去掉，frontmatter 之后只留宿主补的那一个 H1。
  assert.equal((text.match(/^# /gm) || []).length, 1);
});

test('direct 模式：没有可用模型路由时明确报错，不静默产出空正文', async () => {
  const { root, target, store } = await setup();
  const llm = {
    async listProviders() { return []; },
    async listModels() { return []; },
    async *stream() { throw new Error('没有路由时不应该调用 stream'); },
  };
  const write = createWriter({ getLlm: () => llm, digestDir: '.hotspot', log: () => {} });
  await assert.rejects(
    () => write({ slug: 'demo-post', store, target, projectRoot: root, mode: 'direct' }),
    /没有可用的模型路由/,
  );
});

test('模型选择：存盘后下一次生成沿用，缺省是 agent 模式', async () => {
  const { root } = await setup();
  const dir = path.join(root, '.hotspot');
  const saved = await saveWriterSelection(dir, { provider: 'openai', model: 'gpt-x', mode: 'direct' });
  assert.deepEqual(saved, { provider: 'openai', model: 'gpt-x', mode: 'direct' });
  assert.deepEqual(await readWriterSelection(dir), { provider: 'openai', model: 'gpt-x', mode: 'direct' });
  assert.deepEqual(await readWriterSelection(path.join(root, 'nope')), {
    provider: '',
    model: '',
    mode: 'agent',
  });
});
