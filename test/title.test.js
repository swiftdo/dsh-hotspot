import test from 'node:test';
import assert from 'node:assert/strict';

import { MAX_TITLE_SUGGESTIONS, buildTitlePrompt, parseTitleSuggestions } from '../src/core/title.js';

test('起标题提示词：带上候选素材，并写清三条硬约束', () => {
  const prompt = buildTitlePrompt({
    title: 'Swift 6.2 makes strict concurrency the default',
    url: 'https://swift.org/blog/swift-6-2',
    summary: 'Apple 把严格并发设成默认值。',
    tags: ['swift', 'concurrency'],
    sources: [{ title: 'Swift.org', url: 'https://swift.org/blog/swift-6-2', content: 'Strict concurrency is on by default.' }],
  });

  assert.match(prompt, /Swift 6\.2 makes strict concurrency the default/);
  assert.match(prompt, /https:\/\/swift\.org\/blog\/swift-6-2/);
  assert.match(prompt, /swift \/ concurrency/);
  assert.match(prompt, /Strict concurrency is on by default\./);
  // 硬约束：数量、语言、slug 字符集、只输出 JSON
  assert.match(prompt, new RegExp(`${MAX_TITLE_SUGGESTIONS} 个标题`));
  assert.match(prompt, /个汉字/);
  assert.match(prompt, /a-z、0-9 和 -/);
  assert.match(prompt, /只输出 JSON 数组/);
  // 事实边界必须写死在提示词里，否则模型会自己编版本号
  assert.match(prompt, /不新增数字、版本号或结论/);
});

test('起标题提示词：没有来源时不留下空的一手来源段落', () => {
  const prompt = buildTitlePrompt({ title: 'Demo' });
  assert.ok(!prompt.includes('一手来源：'), '没有来源就不该出现这一节');
  assert.match(prompt, /Demo/);
});

test('解析：标准 JSON 数组，slug 原样保留', () => {
  const text = JSON.stringify([
    { title: 'Swift 6.2 把严格并发变成了默认值', slug: 'swift-6-2-strict-concurrency' },
    { title: '数据竞争终于被挡在编译期', slug: 'data-race-compile-time' },
  ]);
  const out = parseTitleSuggestions(text);
  assert.equal(out.length, 2);
  assert.equal(out[0].title, 'Swift 6.2 把严格并发变成了默认值');
  assert.equal(out[0].slug, 'swift-6-2-strict-concurrency');
  assert.equal(out[1].slug, 'data-race-compile-time');
});

test('解析：包在 ```json 代码块里也能认', () => {
  const text = ['```json', '[{"title":"代码块里的标题","slug":"code-fence"}]', '```'].join('\n');
  const out = parseTitleSuggestions(text);
  assert.equal(out.length, 1);
  assert.equal(out[0].title, '代码块里的标题');
  assert.equal(out[0].slug, 'code-fence');
});

test('解析：逐行「1. 标题 | slug」的写法', () => {
  const text = ['1. 第一个标题 | first-slug', '2. 第二个标题 | second-slug'].join('\n');
  const out = parseTitleSuggestions(text);
  assert.deepEqual(
    out.map((entry) => [entry.title, entry.slug]),
    [
      ['第一个标题', 'first-slug'],
      ['第二个标题', 'second-slug'],
    ],
  );
});

test('解析：括号里的 slug 写法与项目符号', () => {
  const text = ['- 标题甲（slug: slug-a）', '• 标题乙(slug-b)'].join('\n');
  const out = parseTitleSuggestions(text);
  assert.deepEqual(
    out.map((entry) => [entry.title, entry.slug]),
    [
      ['标题甲', 'slug-a'],
      ['标题乙', 'slug-b'],
    ],
  );
});

test('解析：中文 slug 归一成空，不把中文塞进目录名', () => {
  const out = parseTitleSuggestions(JSON.stringify([{ title: '纯中文标题', slug: '中文目录名' }]));
  assert.equal(out.length, 1);
  assert.equal(out[0].slug, '', '中文 slug 归一后为空，交给前端按标题推算');
});

test('解析：去重、截断到上限、标记标题党', () => {
  const text = JSON.stringify([
    { title: '同一个标题', slug: 'a' },
    { title: '同一个标题', slug: 'b' },
    { title: '第二个', slug: 'c' },
    { title: '第三个', slug: 'd' },
    { title: '震惊！第四个', slug: 'e' },
  ]);
  const out = parseTitleSuggestions(text);
  assert.equal(out.length, MAX_TITLE_SUGGESTIONS);
  assert.equal(out[0].slug, 'a', '重复标题保留第一次出现的');
  assert.deepEqual(
    out.map((entry) => entry.title),
    ['同一个标题', '第二个', '第三个'],
  );

  const bait = parseTitleSuggestions(JSON.stringify([{ title: '震惊！Swift 6.2 改了这个默认值', slug: 'swift-6-2' }]));
  assert.equal(bait[0].clickbait, true, '标题党词要能被下游识别');
});

test('解析：认不出来就返回空数组，不返回半截垃圾', () => {
  assert.deepEqual(parseTitleSuggestions(''), []);
  assert.deepEqual(parseTitleSuggestions('我觉得这篇文章很好，你可以自己起个标题。'), []);
  assert.deepEqual(parseTitleSuggestions('[{"nope":1}]'), []);
});
