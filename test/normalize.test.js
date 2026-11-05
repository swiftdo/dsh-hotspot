import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalUrl, titleKey, bigrams, jaccard, slugify, extractSlugHint, dateLabel,
} from '../src/core/normalize.js';

test('canonicalUrl 去掉跟踪参数、排序查询串、去尾斜杠', () => {
  assert.equal(
    canonicalUrl('https://Example.com/a/?utm_source=x&b=2&a=1#frag'),
    'https://example.com/a?a=1&b=2',
  );
});

test('canonicalUrl 去 www 与默认端口', () => {
  assert.equal(canonicalUrl('https://www.example.com:443/p/'), 'https://example.com/p');
});

test('canonicalUrl 对非法 URL 原样返回', () => {
  assert.equal(canonicalUrl('not a url'), 'not a url');
});

test('titleKey 抹掉分隔符与大小写，保留中文', () => {
  assert.equal(titleKey('DeepSeek Harness 0.2.2-rc.1 发布'), 'deepseekharness022rc1发布');
});

test('bigram 对中文可用，单字符不炸', () => {
  assert.equal(bigrams('发布').size, 1);
  assert.equal(bigrams('发布会').size, 2);
  assert.equal(jaccard(bigrams('发布会'), bigrams('发布会')), 1);
});

test('slugify 只保留 ASCII 实体名', () => {
  assert.equal(slugify('DeepSeek Harness 0.2.2-rc.1 发布'), 'deepseek-harness-0-2-2-rc-1');
});

test('中文标题不生成拼音 slug', () => {
  assert.equal(slugify('突发新闻'), '');
});

test('extractSlugHint 要求至少 3 个字母', () => {
  assert.equal(extractSlugHint('DeepSeek Harness 0.2.2-rc.1 发布'), 'deepseek-harness-0-2-2-rc-1');
  assert.equal(extractSlugHint('马斯克宣布 Grok 4 免费'), 'grok-4');
  assert.equal(extractSlugHint('突发新闻'), '');
});

test('dateLabel 按 Asia/Shanghai 跨日', () => {
  assert.equal(dateLabel(new Date('2026-11-04T17:00:00Z')), '2026-11-05');
  assert.equal(dateLabel(new Date('2026-11-04T13:07:00Z')), '2026-11-04');
});
