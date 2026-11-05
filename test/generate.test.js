import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createVitePressTarget } from '../src/adapters/target-vitepress.js';
import {
  createPolisher,
  createWriter,
  pickParentAgent,
  pickProvider,
  readWriterSelection,
  saveWriterSelection,
} from '../src/server/generate.js';

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

/**
 * 假 agents 注册表。宿主要求 `request.parent` 是活着的 Agent 对象并做引用相等校验，
 * 所以这里给的必须是稳定引用。
 */
function fakeAgents({ initiating = null, roots = [] } = {}) {
  return {
    currentInitiator: () => initiating,
    roots: () => roots,
    list: () => roots,
  };
}

const liveAgent = { id: 'session-1', status: 'running' };

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
  const write = createWriter({
    getSubagents: () => fake.service,
    getAgents: () => fakeAgents({ roots: [liveAgent] }),
    digestDir: '.hotspot',
  });
  const value = await write({ slug: 'demo-post', store, target, projectRoot: root });

  assert.equal(fake.calls[0].request.parent, liveAgent, '子代理必须挂在活着的父代理下');

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
  const write = createWriter({ getSubagents: () => service, getAgents: () => fakeAgents({ roots: [liveAgent] }) });
  await assert.rejects(() => write({ slug: 'demo-post', store, target, projectRoot: root }), /没有交出可用产物/);

  const draft = readFileSync(path.join(root, 'docs', 'draft', 'demo-post', 'index.md'), 'utf8');
  assert.ok(draft.includes('（正文待写）'), '失败时草稿保持原样');
});

test('草稿不存在时写正文失败并说明原因', async () => {
  const { root, target, store, artifact } = await setup({ draft: false });
  const fake = fakeSubagents(artifact, { body: '正文。', sources: [] });
  const write = createWriter({ getSubagents: () => fake.service, getAgents: () => fakeAgents({ roots: [liveAgent] }) });
  await assert.rejects(() => write({ slug: 'demo-post', store, target, projectRoot: root }), /草稿|找不到/);
});

test('没有活着的会话代理时给出可操作提示，不把 TypeError 抛给用户', async () => {
  const { root, target, store } = await setup();
  const fake = fakeSubagents(path.join(root, '.hotspot', 'writer', 'demo-post.json'), { body: '正文。', sources: [] });
  const write = createWriter({ getSubagents: () => fake.service, getAgents: () => null });
  await assert.rejects(
    () => write({ slug: 'demo-post', store, target, projectRoot: root }),
    /找不到活着的会话代理/,
  );
  assert.equal(fake.calls.length, 0, '取不到父代理就不该发起激活');
});

test('pickParentAgent：initiator 优先，其次最近的 running root，再退回最后一个', () => {
  const initiating = { id: 's-0' };
  assert.equal(pickParentAgent(fakeAgents({ initiating })), initiating, 'agent 边界内优先发起者');

  const idle = { id: 's-1', status: 'idle' };
  const running = { id: 's-2', status: 'running' };
  assert.equal(pickParentAgent(fakeAgents({ roots: [idle, running] })), running, '优先 running 的 root');
  assert.equal(pickParentAgent(fakeAgents({ roots: [idle] })), idle, '没有 running 就取最近的 root');

  const listed = { id: 'child' };
  assert.equal(pickParentAgent({ list: () => [listed] }), listed, '没有 roots 时退回 list');

  assert.equal(pickParentAgent(null), null);
  assert.equal(pickParentAgent(fakeAgents()), null);
  assert.equal(
    pickParentAgent({
      currentInitiator() {
        throw new Error('no initiator');
      },
      roots() {
        throw new Error('disposed');
      },
      list() {
        throw new Error('disposed');
      },
    }),
    null,
    '服务抛错时降级为空，而不是把异常抛出去',
  );
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

test('润色：只走一次 completion，写回正文并把事实差异一并报出', async () => {
  const { root, target } = await setup();
  await target.writeBody('demo-post', '# Demo Post\n\n原文提到版本 1.2.3，共 42 个用例。\n');

  const prompts = [];
  const llm = {
    async listProviders() {
      return [{ provider: 'deepseek', name: 'DeepSeek' }];
    },
    async listModels() {
      return [{ id: 'chat', name: 'Chat' }];
    },
    async *stream(options) {
      prompts.push(options);
      yield { type: 'chunk', chunk: { type: 'text-delta', text: '以下是润色后的正文：\n' } };
      yield { type: 'text-chunks', texts: ['# Demo Post\n\n', '这段改得更顺了，版本 1.2.3 还在，用例数没提。\n'] };
    },
  };

  const polish = createPolisher({ getLlm: () => llm, digestDir: '.hotspot', log: () => {} });
  const value = await polish({
    slug: 'demo-post',
    target,
    projectRoot: root,
    instruction: '更口语一点',
  });

  assert.equal(value.mode, 'polish');
  assert.equal(value.provider, 'deepseek');
  assert.equal(value.model, 'chat');
  assert.equal(prompts.length, 1, '润色只发一次 completion，不分子代理');
  assert.match(prompts[0].messages[0].content[0].text, /更口语一点/);
  assert.match(prompts[0].system, /只做表达层润色/);

  const text = readFileSync(path.join(root, value.file), 'utf8');
  assert.match(text, /^---/);
  assert.match(text, /这段改得更顺了/);
  // 开场白必须被削掉，不能留在正文里
  assert.doesNotMatch(text, /以下是润色后的正文/);
  // 丢了「42 个用例」要被识别成事实差异（只报不拦）
  assert.equal(value.facts.ok, false);
  assert.match(value.factWarning, /42/);
});

test('润色：正文为空时拒绝，不把 scaffold 骨架当正文改', async () => {
  const { root, target } = await setup();
  const llm = { async listProviders() { return [{ provider: 'deepseek' }]; }, async listModels() { return [{ id: 'chat' }]; }, async *stream() { throw new Error('不应调用模型'); } };
  const polish = createPolisher({ getLlm: () => llm, digestDir: '.hotspot', log: () => {} });
  await assert.rejects(
    () => polish({ slug: 'demo-post', target, projectRoot: root, instruction: '' }),
    /正文还是空的/,
  );
});

test('润色：草稿不存在时明确报错', async () => {
  const { root, target } = await setup({ draft: false });
  const polish = createPolisher({ getLlm: () => null, digestDir: '.hotspot' });
  await assert.rejects(
    () => polish({ slug: 'nope', target, projectRoot: root, instruction: '' }),
    /找不到草稿/,
  );
});

test('候选按 sources.json 的 id 定位：中文标题 + 自定义 slug 也能拿到摘要与一手源原文', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hotspot-generate-'));
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  const target = createVitePressTarget({ root });
  await target.scaffold(CANDIDATE, { slug: 'zh-post', title: 'OpenAI 买下 Pierre 到底图什么' });

  const store = {
    async loadDigest() {
      return { date: '2026-11-05', items: [CANDIDATE] };
    },
    async loadRecent() {
      return [{ date: '2026-11-05', items: [CANDIDATE] }];
    },
    async loadRaw() {
      return [{ url: 'https://openai.com/index/demo', content: 'OpenAI 宣布收购 Pierre，金额未披露。' }];
    },
  };

  const artifact = path.join(root, '.hotspot', 'writer', 'zh-post.json');
  const fake = fakeSubagents(artifact, { body: '## 事实\n\n收购已宣布。', sources: [] });
  const write = createWriter({
    getSubagents: () => fake.service,
    getAgents: () => fakeAgents({ roots: [liveAgent] }),
    digestDir: '.hotspot',
  });

  const value = await write({ slug: 'zh-post', store, target, projectRoot: root });
  assert.equal(value.candidateId, 'h-20261105-01', '必须按 candidate.id 命中，而不是 slugify(英文标题)');
  assert.ok(value.briefChars > 0, '一手源原文应当进入素材包');

  const prompt = fake.calls[0].request.prompt[0].text;
  assert.match(prompt, /摘要：演示用候选/, '摘要要进提示词');
  assert.match(prompt, /金额未披露/, '一手源原文要进提示词');
});
