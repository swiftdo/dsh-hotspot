import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_POLISH_INSTRUCTION,
  buildPolishPrompt,
  cleanPolishedBody,
  compareFacts,
  describeFactDiff,
  hasBodyContent,
} from '../src/core/polish.js';

test('润色任务书：把用户要求放在最前，并写死「不改事实」的边界', () => {
  const prompt = buildPolishPrompt({
    title: 'Demo',
    body: '# Demo\n\n正文一段。',
    instruction: '更口语，句子短一点',
  });
  assert.match(prompt, /更口语，句子短一点/);
  assert.match(prompt, /不改事实/);
  assert.match(prompt, /数字、版本号、日期/);
  assert.match(prompt, /不许新增原文没有的信息/);
  assert.match(prompt, /「## 参考」/);
  assert.match(prompt, /只输出润色后的完整正文/);
  // 正文必须完整带进提示词，不能截断成摘要
  assert.match(prompt, /正文一段。/);
});

test('润色任务书：不填要求时用默认取向，而不是空指令', () => {
  const prompt = buildPolishPrompt({ body: '# A\n\n内容。' });
  assert.match(prompt, new RegExp(DEFAULT_POLISH_INSTRUCTION.slice(0, 8)));
});

test('产物清洗：削掉整套代码围栏与「以下是润色后的…」开场白', () => {
  assert.equal(
    cleanPolishedBody('```markdown\n# 标题\n\n正文。\n```'),
    '# 标题\n\n正文。',
  );
  assert.equal(
    cleanPolishedBody('以下是润色后的正文：\n\n# 标题\n\n正文。'),
    '# 标题\n\n正文。',
  );
  assert.equal(cleanPolishedBody('   \n '), '');
});

test('正文判空：scaffold 骨架算空，只有列表也算有正文', () => {
  const scaffold = '---\ntitle: Demo\n---\n\n# Demo\n\n> 来源：https://a.com\n\n（正文待写）\n';
  assert.equal(hasBodyContent(scaffold), false);
  assert.equal(hasBodyContent('---\ntitle: Demo\n---\n\n# Demo\n\n- 条目一\n- 条目二\n'), true);
});

test('事实比对：数字与链接缺失会被点名，纯排版变化不误报', () => {
  const before = '# T\n\n1. 第一点 版本 6.1.2\n2. 第二点 覆盖率 42%\n\n见 https://a.com/x\n';
  const after = '# T\n\n- 第一点，版本 6.1.2，覆盖率 42%\n\n见 https://a.com/x\n';
  const diff = compareFacts(before, after);
  assert.equal(diff.ok, true);
  assert.equal(describeFactDiff(diff), '');

  const lost = compareFacts(before, '# T\n\n第一点，版本 6.1.2\n');
  assert.equal(lost.ok, false);
  assert.ok(lost.numbers.missing.items.includes('42%'));
  assert.equal(lost.urls.missing.total, 1);
  assert.match(describeFactDiff(lost), /少了 1 个数字/);
  assert.match(describeFactDiff(lost), /少了 1 条链接/);

  const added = compareFacts('# T\n\n一段。\n', '# T\n\n一段 99 字。\n');
  assert.equal(added.ok, false);
  assert.equal(added.numbers.added.total, 1);
});
