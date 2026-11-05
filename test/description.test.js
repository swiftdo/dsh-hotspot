import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_DESCRIPTION_MAX, buildDescriptionPrompt, cleanDescription } from '../src/core/description.js';

test('简介提示词：定稿标题在最前，素材与三条硬约束都在', () => {
  const prompt = buildDescriptionPrompt({
    title: 'Swift 6.2 把严格并发变成了默认值',
    summary: 'Apple 把严格并发设成默认值。',
    tags: ['swift', 'concurrency'],
    sources: [{ title: 'Swift.org', url: 'https://swift.org/blog/swift-6-2', content: 'Strict concurrency is on by default.' }],
  });

  // 标题是这段简介的主题，必须排在最前
  assert.match(prompt, /^定稿标题：Swift 6\.2 把严格并发变成了默认值/);
  assert.match(prompt, /候选摘要：Apple 把严格并发设成默认值。/);
  assert.match(prompt, /swift \/ concurrency/);
  assert.match(prompt, /Strict concurrency is on by default\./);
  assert.match(prompt, /60–110 字/);
  assert.match(prompt, /不新增数字、版本号或结论/);
  assert.match(prompt, /只输出简介正文一段话/);
});

test('简介提示词：没有来源时不留下空的一手来源段落', () => {
  const prompt = buildDescriptionPrompt({ title: 'Demo' });
  assert.ok(!prompt.includes('一手来源：'));
});

test('清洗：去掉「简介：」前缀、包裹引号与换行', () => {
  assert.equal(
    cleanDescription('简介：“Swift 6.2 把严格并发设成默认值。\n升级前先看清这几条规则。”'),
    'Swift 6.2 把严格并发设成默认值。 升级前先看清这几条规则。',
  );
  assert.equal(cleanDescription('Description: 一句话简介'), '一句话简介');
  assert.equal(cleanDescription('```text\n一段简介\n```'), '一段简介');
});

test('清洗：正文里的引号不动，只剥最外层', () => {
  assert.equal(cleanDescription('他说的「先看规则」不是玩笑。'), '他说的「先看规则」不是玩笑。');
  assert.equal(cleanDescription('「他说先看规则」'), '他说先看规则');
});

test('清洗：超长按码点截断到适配器的上限', () => {
  const long = '字'.repeat(DEFAULT_DESCRIPTION_MAX + 40);
  const out = cleanDescription(long);
  assert.equal([...out].length, DEFAULT_DESCRIPTION_MAX);
});

test('清洗：空输入与空白输入都回空串', () => {
  assert.equal(cleanDescription(''), '');
  assert.equal(cleanDescription('   \n\t '), '');
  assert.equal(cleanDescription(null), '');
});
