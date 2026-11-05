import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDirectPrompt,
  collectStreamText,
  normalizeCatalog,
  normalizeWriterSelection,
  resolveRoute,
} from '../src/core/writer-route.js';

test('模型目录：容忍三种 provider 字段名与字符串形式的模型', () => {
  const catalog = normalizeCatalog([
    { provider: 'deepseek', name: 'DeepSeek', models: [{ id: 'chat' }, 'reasoner'] },
    { route: 'openai', models: [{ model: 'gpt-x', displayName: 'GPT X' }] },
    { id: 'anthropic', models: [] },
    { name: '没有路由' },
    null,
  ]);
  assert.deepEqual(
    catalog.map((item) => item.provider),
    ['deepseek', 'openai', 'anthropic'],
  );
  assert.deepEqual(catalog[0].models, [
    { id: 'chat', name: 'chat' },
    { id: 'reasoner', name: 'reasoner' },
  ]);
  assert.equal(catalog[1].models[0].name, 'GPT X');
  assert.equal(catalog[0].label, 'DeepSeek');
  assert.equal(catalog[1].label, 'openai');
});

test('路由解析：选中项优先，模型下架时退回该 provider 的第一个模型', () => {
  const catalog = [
    { provider: 'deepseek', label: 'DeepSeek', models: [{ id: 'chat', name: 'chat' }, { id: 'reasoner', name: 'reasoner' }] },
    { provider: 'openai', label: 'OpenAI', models: [{ id: 'gpt-x', name: 'GPT X' }] },
  ];
  assert.deepEqual(resolveRoute(catalog, { provider: 'openai', model: 'gpt-x' }), { provider: 'openai', model: 'gpt-x' });
  assert.deepEqual(resolveRoute(catalog, { provider: 'openai', model: '已下架' }), { provider: 'openai', model: 'gpt-x' });
  assert.deepEqual(resolveRoute(catalog, { provider: 'deepseek' }), { provider: 'deepseek', model: 'chat' });
  assert.deepEqual(resolveRoute(catalog, {}), { provider: 'deepseek', model: 'chat' });
  assert.equal(resolveRoute([], {}), null);
  assert.equal(resolveRoute([{ provider: 'x', label: 'X', models: [] }], { provider: 'x' }), null);
});

test('选择持久化：只留 provider/model/mode，mode 默认 agent', () => {
  assert.deepEqual(normalizeWriterSelection({ provider: ' a ', model: 'b', extra: 1 }), {
    provider: 'a',
    model: 'b',
    mode: 'agent',
  });
  assert.equal(normalizeWriterSelection({ mode: 'direct' }).mode, 'direct');
  assert.deepEqual(normalizeWriterSelection(null), { provider: '', model: '', mode: 'agent' });
});

test('流式拼接：text-delta / text-chunks / 嵌套 chunk / 裸字符串都认', () => {
  const text = collectStreamText([
    { type: 'chunk', chunk: { type: 'text-delta', text: '第一段' } },
    { type: 'text-chunks', texts: ['，', '第二段'] },
    { type: 'chunk', chunk: { type: 'text-chunks', texts: ['。'] } },
    '尾巴',
    { type: 'chunk', chunk: { type: 'reasoning-delta', text: '不该出现' } },
    null,
  ]);
  assert.equal(text, '第一段，第二段。尾巴');
  assert.equal(collectStreamText([]), '');
});

test('只用手头证据的任务书：材料进提示词，并明确禁止引入材料之外的事实', () => {
  const prompt = buildDirectPrompt({
    title: 'OpenAI 收购 Pierre',
    url: 'https://openai.com/index/demo',
    sources: [{ url: 'https://a.example/x', title: 'A', content: 'A'.repeat(5000) }],
    supplements: [{ url: 'https://b.example/y', title: 'B', content: 'B 的正文' }],
  });
  assert.match(prompt, /只能使用下面给出的材料/);
  assert.match(prompt, /材料 1：A — https:\/\/a\.example\/x/);
  assert.match(prompt, /材料 2：B — https:\/\/b\.example\/y/);
  assert.match(prompt, /材料没说的写「尚未披露」/);
  // 材料正文要截断，不能把整页原文塞进上下文。
  assert.ok(prompt.length < 4000, `提示词过长：${prompt.length}`);
  assert.ok(!prompt.includes('A'.repeat(2500)), '材料正文没有截断到 2000 字');
});
