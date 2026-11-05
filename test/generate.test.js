import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createVitePressTarget } from '../src/adapters/target-vitepress.js';
import { resolveWriterSelection } from '../src/core/writer-route.js';
import {
  createPolisher,
  createDescriptionSuggester,
  createTitleSuggester,
  createWriter,
  readWriterConfig,
  saveWriterConfig,
} from '../src/server/generate.js';

const CANDIDATE = {
  id: 'h-20261105-01',
  title: 'Demo Post',
  slugHint: 'demo-post',
  summary: '演示用候选。',
  tags: ['demo'],
  sources: [{ source: 'openai', title: 'OpenAI', url: 'https://openai.com/index/demo' }],
};

const RAW = [{ url: 'https://openai.com/index/demo', content: 'OpenAI 在 11 月 4 日宣布收购，金额未披露。' }];

async function setup({ draft = true } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'hotspot-generate-'));
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  const target = createVitePressTarget({ root });
  if (draft) await target.scaffold(CANDIDATE, { slug: 'demo-post' });
  const store = {
    async loadDigest() {
      return { date: '2026-11-05', items: [CANDIDATE] };
    },
    async loadRecent() {
      return [{ date: '2026-11-05', items: [CANDIDATE] }];
    },
    async loadRaw() {
      return RAW;
    },
  };
  return { root, target, store };
}

/** 假 llm：记录每次 stream 的入参，按脚本吐文本。 */
function fakeLlm({ texts = ['# 模型自己写的一级标题\n\n', '这是正文。', '第二段。'], onStream } = {}) {
  const calls = [];
  return {
    calls,
    async listProviders() {
      return [{ provider: 'deepseek', name: 'DeepSeek' }, { provider: 'openai', name: 'OpenAI' }];
    },
    async listModels(provider) {
      return provider === 'openai' ? [{ id: 'gpt-x', name: 'GPT X' }] : [{ id: 'chat', name: 'Chat' }];
    },
    async *stream(options) {
      calls.push(options);
      if (onStream) await onStream(options);
      yield { type: 'chunk', chunk: { type: 'text-delta', text: texts[0] } };
      if (texts.length > 1) yield { type: 'text-chunks', texts: texts.slice(1) };
    },
  };
}

test('写正文：一次 completion，模型从配置里选，正文写进草稿', async () => {
  const { root, target, store } = await setup();
  const llm = fakeLlm();
  const write = createWriter({ getLlm: () => llm, digestDir: '.hotspot', log: () => {} });

  const value = await write({
    slug: 'demo-post',
    store,
    target,
    projectRoot: root,
    provider: 'openai',
    model: 'gpt-x',
  });

  assert.equal(value.mode, 'direct');
  assert.equal(value.provider, 'openai');
  assert.equal(value.model, 'gpt-x');
  assert.equal(llm.calls.length, 1, '只发一次 completion，不起子代理');
  assert.equal(llm.calls[0].provider, 'openai');
  assert.match(llm.calls[0].messages[0].content[0].text, /只能使用下面给出的材料/);

  const text = readFileSync(path.join(root, value.file), 'utf8');
  assert.match(text, /^---/);
  assert.match(text, /这是正文。第二段。/);
  // 模型自带的一级标题必须被去掉，frontmatter 之后只留宿主补的那一个 H1
  assert.equal((text.match(/^# /gm) || []).length, 1);
});

test('写正文：素材包进提示词（摘要 + 一手源原文 + 标签）', async () => {
  const { root, target, store } = await setup();
  const llm = fakeLlm();
  const write = createWriter({ getLlm: () => llm, digestDir: '.hotspot' });
  const value = await write({ slug: 'demo-post', store, target, projectRoot: root });

  const prompt = llm.calls[0].messages[0].content[0].text;
  assert.match(prompt, /演示用候选/, '候选摘要要进提示词');
  assert.match(prompt, /金额未披露/, '一手源原文要进提示词');
  assert.ok(value.briefChars > 0);
  assert.equal(value.candidateId, CANDIDATE.id);
});

test('写正文：宿主没接 llm 时明确报错，不写草稿', async () => {
  const { root, target, store } = await setup();
  const write = createWriter({ getLlm: () => null });
  await assert.rejects(
    () => write({ slug: 'demo-post', store, target, projectRoot: root }),
    /没有提供 llm 服务/,
  );
  const text = readFileSync(path.join(target.draftDir, 'demo-post', 'index.md'), 'utf8');
  assert.match(text, /（正文待写）/, '失败时草稿保持骨架');
});

test('写正文：没有可用模型路由时明确报错，不静默产出空正文', async () => {
  const { root, target, store } = await setup();
  const llm = {
    async listProviders() { return []; },
    async listModels() { return []; },
    async *stream() { throw new Error('没有路由时不应该调用 stream'); },
  };
  const write = createWriter({ getLlm: () => llm, digestDir: '.hotspot' });
  await assert.rejects(
    () => write({ slug: 'demo-post', store, target, projectRoot: root }),
    /没有可用的模型路由/,
  );
});

test('写正文：草稿不存在时失败并说明原因', async () => {
  const { root, target, store } = await setup({ draft: false });
  const write = createWriter({ getLlm: () => fakeLlm(), digestDir: '.hotspot' });
  await assert.rejects(
    () => write({ slug: 'demo-post', store, target, projectRoot: root }),
    /草稿|找不到/,
  );
});

test('写正文：外部取消信号传到模型请求上', async () => {
  const { root, target, store } = await setup();
  const controller = new AbortController();
  const seen = [];
  const llm = fakeLlm({
    onStream: async () => {
      controller.abort(new Error('用户取消'));
    },
  });
  const write = createWriter({ getLlm: () => llm, digestDir: '.hotspot' });
  const value = await write({ slug: 'demo-post', store, target, projectRoot: root, signal: controller.signal });
  seen.push(...llm.calls);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].signal.aborted, true, '取消要传到 llm.stream 的 signal 上');
  assert.ok(value.bodyChars > 0, '已经拿到的正文照常落盘');
});

test('候选按 sources.json 的 id 定位：中文标题 + 自定义 slug 也能拿到摘要与一手源原文', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hotspot-generate-'));
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  const target = createVitePressTarget({ root });
  await target.scaffold(CANDIDATE, { slug: 'zh-post', title: '中文标题' });

  const store = {
    async loadDigest() { return { date: '2026-11-05', items: [CANDIDATE] }; },
    async loadRecent() { return [{ date: '2026-11-05', items: [CANDIDATE] }]; },
    async loadRaw() { return RAW; },
  };

  const llm = fakeLlm();
  const write = createWriter({ getLlm: () => llm, digestDir: '.hotspot' });
  const value = await write({ slug: 'zh-post', store, target, projectRoot: root });

  assert.equal(value.candidateId, CANDIDATE.id, '必须按 candidate.id 命中，而不是 slugify(英文标题)');
  const prompt = llm.calls[0].messages[0].content[0].text;
  assert.match(prompt, /演示用候选/, '摘要要进提示词');
  assert.match(prompt, /金额未披露/, '一手源原文要进提示词');
});

test('模型选择：全局默认 + 按用途覆盖，缺省跟随全局', async () => {
  const { root } = await setup();
  const dir = path.join(root, '.hotspot');
  const empty = { provider: '', model: '' };

  const saved = await saveWriterConfig(dir, { mode: 'direct', global: { provider: 'openai', model: 'gpt-x' } });
  assert.deepEqual(saved.global, { provider: 'openai', model: 'gpt-x' });
  assert.deepEqual(resolveWriterSelection(saved, 'writer'), { provider: 'openai', model: 'gpt-x', mode: 'direct' });
  assert.deepEqual(resolveWriterSelection(saved, 'polish'), { provider: 'openai', model: 'gpt-x', mode: 'direct' });

  const overridden = await saveWriterConfig(dir, { polish: { provider: 'deepseek', model: 'chat' } });
  assert.equal(overridden.global.model, 'gpt-x');
  assert.deepEqual(resolveWriterSelection(overridden, 'polish'), { provider: 'deepseek', model: 'chat', mode: 'direct' });
  assert.deepEqual(resolveWriterSelection(overridden, 'writer'), { provider: 'openai', model: 'gpt-x', mode: 'direct' });

  const cleared = await saveWriterConfig(dir, { polish: empty });
  assert.deepEqual(cleared.polish, empty);
  assert.deepEqual(resolveWriterSelection(cleared, 'polish'), { provider: 'openai', model: 'gpt-x', mode: 'direct' });

  assert.deepEqual(await readWriterConfig(dir), cleared);
  assert.deepEqual(await readWriterConfig(path.join(root, 'nope')), {
    version: 2,
    mode: 'agent',
    global: empty,
    writer: empty,
    polish: empty,
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
  assert.equal(prompts.length, 1, '润色只发一次 completion');
  assert.match(prompts[0].messages[0].content[0].text, /更口语一点/);
  assert.match(prompts[0].system, /只做表达层润色/);

  const text = readFileSync(path.join(root, value.file), 'utf8');
  assert.match(text, /^---/);
  assert.match(text, /这段改得更顺了/);
  assert.doesNotMatch(text, /以下是润色后的正文/);
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

// ── 六步链路的打点（面板进度弹窗靠它） ──

test('写正文：按链路顺序打点，最后一步落在写盘的文件上', async () => {
  const { root, target, store } = await setup();
  const llm = fakeLlm();
  const write = createWriter({ getLlm: () => llm, digestDir: '.hotspot', log: () => {} });

  const marks = [];
  await write({
    slug: 'demo-post',
    store,
    target,
    projectRoot: root,
    provider: 'openai',
    model: 'gpt-x',
    onStep: (key, detail) => marks.push([key, detail ?? '']),
  });

  // 同一个 key 会打两次（进入该步 / 该步有结论），顺序必须与 write-steps 一致
  const order = marks.map(([key]) => key).filter((key, index, list) => list.indexOf(key) === index);
  assert.deepEqual(order, ['resolve', 'brief', 'route', 'write', 'persist']);

  assert.match(marks.find(([key, detail]) => key === 'resolve' && detail)[1], /h-20261105-01/);
  assert.match(marks.find(([key, detail]) => key === 'brief' && detail)[1], /篇原文/);
  assert.match(marks.find(([key, detail]) => key === 'route' && detail)[1], /openai\/gpt-x/);
  const lastPersist = marks.filter(([key]) => key === 'persist').pop();
  assert.match(lastPersist[1], /demo-post/, '写盘那一步的 detail 要是文件路径');
});

test('写正文：没有 onStep 时也不炸（同步 /api/generate 的老路径）', async () => {
  const { root, target, store } = await setup();
  const llm = fakeLlm();
  const write = createWriter({ getLlm: () => llm, digestDir: '.hotspot', log: () => {} });
  const value = await write({ slug: 'demo-post', store, target, projectRoot: root });
  assert.ok(value.bodyChars > 0);
});

// ── AI 起标题 ──

const TITLE_JSON = JSON.stringify([
  { title: 'Swift 6.2 把严格并发变成了默认值', slug: 'swift-6-2-strict-concurrency' },
  { title: '数据竞争被挡在编译期', slug: 'data-race-compile-time' },
  { title: '升级前先看懂这四条并发规则', slug: 'swift-6-2-concurrency-rules' },
]);

test('起标题：一次 completion，素材来自候选 brief，返回三条建议', async () => {
  const { root, store } = await setup();
  const llm = fakeLlm({ texts: [TITLE_JSON] });
  const suggest = createTitleSuggester({ getLlm: () => llm, digestDir: '.hotspot', log: () => {} });

  const value = await suggest({
    item: CANDIDATE,
    digest: { date: '2026-11-05', items: [CANDIDATE] },
    store,
    projectRoot: root,
    provider: 'openai',
    model: 'gpt-x',
  });

  assert.equal(value.suggestions.length, 3);
  assert.equal(value.suggestions[0].slug, 'swift-6-2-strict-concurrency');
  assert.equal(value.provider, 'openai');
  assert.equal(value.model, 'gpt-x');
  // 素材必须真的进了提示词：一手原文里的那句话
  assert.match(JSON.stringify(llm.calls[0].messages), /OpenAI 在 11 月 4 日宣布收购/);
  assert.ok(llm.calls[0].maxTokens >= 1000, '起标题也要给思考预算，太小会拿不到正文');
});

test('起标题：模型答非所问时抛错，让面板回退原文标题', async () => {
  const { root, store } = await setup();
  const llm = fakeLlm({ texts: ['这篇文章很好，标题你自己想吧。'] });
  const suggest = createTitleSuggester({ getLlm: () => llm, digestDir: '.hotspot', log: () => {} });

  await assert.rejects(
    () => suggest({ item: CANDIDATE, digest: { date: '2026-11-05' }, store, projectRoot: root }),
    /没有给出可用的标题/,
  );
});

test('起标题：宿主没有 llm 时直接抛错', async () => {
  const { root, store } = await setup();
  const suggest = createTitleSuggester({ getLlm: () => null, digestDir: '.hotspot', log: () => {} });
  await assert.rejects(
    () => suggest({ item: CANDIDATE, digest: { date: '2026-11-05' }, store, projectRoot: root }),
    /没有提供 llm 服务/,
  );
});

// ── 按定稿标题写简介 ──

test('写简介：定稿标题进提示词，返回清洗后的一段话', async () => {
  const { root, store } = await setup();
  const llm = fakeLlm({
    texts: ['简介：“Swift 6.2 把严格并发设成默认值。\n升级前先看清这几条规则。”'],
  });
  const suggest = createDescriptionSuggester({ getLlm: () => llm, digestDir: '.hotspot', log: () => {} });

  const value = await suggest({
    item: CANDIDATE,
    digest: { date: '2026-11-05', items: [CANDIDATE] },
    store,
    projectRoot: root,
    title: 'Swift 6.2 把严格并发变成了默认值',
    provider: 'openai',
    model: 'gpt-x',
  });

  const prompt = JSON.stringify(llm.calls[0].messages);
  assert.match(prompt, /定稿标题：Swift 6\.2 把严格并发变成了默认值/);
  assert.match(prompt, /OpenAI 在 11 月 4 日宣布收购/, '一手原文也要进提示词');
  assert.equal(value.description, 'Swift 6.2 把严格并发设成默认值。 升级前先看清这几条规则。');
  assert.equal(value.chars, [...value.description].length);
  assert.equal(value.provider, 'openai');
  assert.ok(llm.calls[0].maxTokens >= 1000, '思考型模型需要预算，给小了会返回空');
});

test('写简介：没有标题时直接拒绝，不猜主题', async () => {
  const { root, store } = await setup();
  const llm = fakeLlm();
  const suggest = createDescriptionSuggester({ getLlm: () => llm, digestDir: '.hotspot', log: () => {} });

  await assert.rejects(
    () => suggest({ item: CANDIDATE, digest: { date: '2026-11-05' }, store, projectRoot: root, title: '  ' }),
    (error) => {
      assert.equal(error.code, 'ERR_TITLE_REQUIRED');
      return true;
    },
  );
  assert.equal(llm.calls.length, 0, '没有标题就不该发请求');
});

test('写简介：模型返回空时抛错并带上 chunk 形状，便于定位', async () => {
  const { root, store } = await setup();
  const llm = fakeLlm({ texts: [''] });
  const suggest = createDescriptionSuggester({ getLlm: () => llm, digestDir: '.hotspot', log: () => {} });

  await assert.rejects(
    () => suggest({ item: CANDIDATE, digest: { date: '2026-11-05' }, store, projectRoot: root, title: '标题' }),
    /没有给出可用的简介（原始返回：/,
  );
});
