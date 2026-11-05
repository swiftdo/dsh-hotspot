import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFrontmatter, checkNumbers, checkInternalLinks, checkExternalLinks,
  checkFrontmatter, validateArticle,
} from '../src/core/validate.js';

const FM = `---
title: DeepSeek Harness 0.2.2-rc.1 发布
description: "一句话摘要"
date: 2026-11-05
tags:
    - DeepSeek
    - DSH
---
`;

test('frontmatter 解析支持列表与引号', () => {
  const { data, body } = parseFrontmatter(`${FM}\n正文`);
  assert.equal(data.title, 'DeepSeek Harness 0.2.2-rc.1 发布');
  assert.equal(data.description, '一句话摘要');
  assert.deepEqual(data.tags, ['DeepSeek', 'DSH']);
  assert.equal(body.trim(), '正文');
});

test('数字校验拦住编造的版本号', () => {
  const sources = ['本文基于 dsh-v0.2.2-rc.1，Node.js 最低版本提高到 24.9。'];
  const body = '这次要求 Node 24.10，SSH 协议从 2 升到 3。';

  const violations = checkNumbers(body, sources);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].code, 'number-not-in-source');
  assert.match(violations[0].message, /24\.10/);
});

test('数字校验放过源里出现过的值', () => {
  const sources = ['Node.js 最低版本提高到 24.9'];
  assert.deepEqual(checkNumbers('要求 Node 24.9', sources), []);
});

test('allow 列表可显式放行', () => {
  const violations = checkNumbers('覆盖 1.5 万人', ['无关文本'], { allow: ['1.5'] });
  assert.deepEqual(violations, []);
});

test('站内链接必须命中真实 URL', () => {
  const siteUrls = ['/', '/swift/', '/ai-toolbox/agent/dsh-superagent/'];
  assert.deepEqual(checkInternalLinks('见 [DSH](/ai-toolbox/agent/dsh-superagent/)', siteUrls), []);
  assert.deepEqual(checkInternalLinks('见 [DSH](/ai-toolbox/agent/dsh-superagent)', siteUrls), []);

  const bad = checkInternalLinks('见 [不存在](/no/such/page/)', siteUrls);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].code, 'internal-link-missing');
});

test('外链必须在白名单内', () => {
  const opts = { allowedUrls: ['https://github.com/a/b/releases/tag/v1'], allowedHosts: ['openai.com'] };
  assert.deepEqual(checkExternalLinks('见 [发布](https://github.com/a/b/releases/tag/v1)', opts), []);
  assert.deepEqual(checkExternalLinks('见 [官网](https://openai.com/news/)', opts), []);

  const bad = checkExternalLinks('见 [野站](https://spam.example/x)', opts);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].code, 'external-link-untrusted');
});

test('frontmatter 规则：描述长度、permalink、日期格式、tag 词表', () => {
  const long = '很'.repeat(130);
  const violations = checkFrontmatter(
    { title: 'x', description: long, date: '2026/11/05', permalink: '/x/', tags: ['野生标签'] },
    { tagVocabulary: ['DeepSeek'], maxDescription: 120 },
  );
  const codes = violations.map((v) => v.code).sort();
  assert.deepEqual(codes, ['fm-date', 'fm-description-length', 'fm-permalink', 'fm-tag-uncontrolled']);
});

test('validateArticle 汇总四类问题', () => {
  const markdown = `---
title: 测试
description: "短"
date: 2026-11-05
tags:
    - 不存在的标签
---

要求 Node 24.10，见 [站内](/nope/) 与 [外链](https://spam.example/x)。
`;

  const result = validateArticle({
    markdown,
    sourceTexts: ['Node.js 24.9'],
    siteUrls: ['/'],
    tagVocabulary: ['DeepSeek'],
    allowedHosts: [],
  });

  assert.equal(result.ok, false);
  const codes = result.violations.map((v) => v.code).sort();
  assert.deepEqual(codes, [
    'external-link-untrusted',
    'fm-tag-uncontrolled',
    'internal-link-missing',
    'number-not-in-source',
  ]);
});
