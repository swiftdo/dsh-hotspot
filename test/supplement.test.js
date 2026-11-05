import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  MAX_CONTENT_CHARS,
  collectSupplementEvidence,
  normalizeSupplementEntry,
  normalizeSupplementFile,
  registerCandidateSources,
  upsertSupplement,
} from '../src/core/supplement.js';
import { checkNumbers, checkExternalLinks } from '../src/core/validate.js';
import { createVitePressTarget } from '../src/adapters/target-vitepress.js';

test('补料条目归一化：去追踪参数、缺标题回落到域名', () => {
  const entry = normalizeSupplementEntry(
    { url: 'https://WWW.GitHub.com/a/b/?utm_source=x&utm_medium=y', content: 'v6.1.2 发布于 2026-10-30' },
    new Date('2026-11-05T00:00:00Z'),
  );
  assert.equal(entry.url, 'https://github.com/a/b');
  assert.equal(entry.host, 'github.com');
  assert.equal(entry.title, 'github.com');
  assert.equal(entry.kind, 'other');
  assert.equal(entry.fetchedAt, '2026-11-05T00:00:00.000Z');
});

test('补料只收 http(s)：file:// 与空 URL 直接拒绝', () => {
  assert.throws(() => normalizeSupplementEntry({ url: 'file:///etc/passwd' }), /URL 不合法/);
  assert.throws(() => normalizeSupplementEntry({ url: '' }), /URL 不合法/);
  assert.throws(() => normalizeSupplementEntry({ url: 'github.com/a/b' }), /URL 不合法/);
});

test('正文超长被截断且留标记', () => {
  const entry = normalizeSupplementEntry({ url: 'https://a.com/x', content: 'a'.repeat(MAX_CONTENT_CHARS + 10) });
  assert.equal(entry.truncated, true);
  assert.equal([...entry.content].length, MAX_CONTENT_CHARS + 1);
  assert.ok(entry.content.endsWith('…'));

  const short = normalizeSupplementEntry({ url: 'https://a.com/x', content: '  v6.1.2\n  发布  ' });
  assert.equal(short.truncated, false);
  assert.equal(short.content, 'v6.1.2 发布');
});

test('同一页面重复登记是更新而不是新增', () => {
  const first = normalizeSupplementEntry({ url: 'https://swift.org/blog/a/', content: 'v6.1.2' });
  const second = normalizeSupplementEntry({ url: 'https://swift.org/blog/a/?utm_source=t', content: 'v6.1.3' });

  const a = upsertSupplement([], first);
  assert.equal(a.added, true);
  assert.equal(a.entries.length, 1);

  const b = upsertSupplement(a.entries, second);
  assert.equal(b.added, false);
  assert.equal(b.entries.length, 1);
  assert.equal(b.entries[0].content, 'v6.1.3');
});

test('补料原文真正让数字校验通过（不是只加进数组）', () => {
  const body = 'Swift 6.1.2 修掉了 3 个编译问题。';
  assert.equal(checkNumbers(body, ['候选源里只有 v6.0.0']).length, 1, '未登记补料时应判编造');

  const entries = [normalizeSupplementEntry({ url: 'https://swift.org/blog/x/', content: 'Swift 6.1.2 已发布，修掉 3 个问题' })];
  const evidence = collectSupplementEvidence(entries);
  assert.equal(checkNumbers(body, evidence.sourceTexts).length, 0, '登记补料后应放行');
});

test('补料域名连带放行外链，配置白名单同时保留', () => {
  const entries = [normalizeSupplementEntry({ url: 'https://swift.org/blog/x/', title: 'Swift 博客' })];
  const evidence = collectSupplementEvidence(entries, { allowedHosts: ['github.com'] });

  assert.ok(evidence.allowedUrls.has('https://swift.org/blog/x'));
  assert.ok(evidence.allowedHosts.has('swift.org'), '补料域名应自动进白名单');
  assert.ok(evidence.allowedHosts.has('github.com'), '配置里的白名单不能被覆盖掉');

  const markdown = '见 [Swift 博客](https://swift.org/blog/x/) 与 [仓库](https://github.com/a/b)';
  const violations = checkExternalLinks(markdown, {
    allowedUrls: evidence.allowedUrls,
    allowedHosts: evidence.allowedHosts,
  });
  assert.deepEqual(violations, []);

  // 没登记过的站外域名仍要拦
  const extra = checkExternalLinks('见 [别处](https://example.com/x)', {
    allowedUrls: evidence.allowedUrls,
    allowedHosts: evidence.allowedHosts,
  });
  assert.equal(extra.length, 1);
  assert.equal(extra[0].code, 'external-link-untrusted');
});

test('补料文件容忍裸数组，坏条目记进 invalid 而不是静默丢弃', () => {
  const fromArray = normalizeSupplementFile([{ url: 'https://ok.com/a', content: 'x' }]);
  assert.equal(fromArray.entries.length, 1);
  assert.equal(fromArray.invalid.length, 0);

  const mixed = normalizeSupplementFile([{ url: 'ftp://bad' }, { url: 'https://ok.com/b' }]);
  assert.equal(mixed.entries.length, 1);
  assert.equal(mixed.invalid.length, 1);
  assert.match(mixed.invalid[0].reason, /URL 不合法/);

  assert.deepEqual(normalizeSupplementFile(null).entries, []);
});

test('落盘：登记到草稿目录、按 URL 去重、无草稿时拒绝', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'hotspot-supp-'));
  try {
    const target = createVitePressTarget({ root, articleDir: 'docs/article', draftDir: 'docs/draft' });

    await assert.rejects(
      () => target.addSupplement('nope', { url: 'https://a.com/x' }),
      /找不到草稿或文章/,
    );

    await mkdir(path.join(root, 'docs/draft/hello'), { recursive: true });
    await writeFile(path.join(root, 'docs/draft/hello/index.md'), '---\ntitle: Hello\n---\n\n正文', 'utf8');

    const first = await target.addSupplement('hello', { url: 'https://swift.org/blog/a/', title: 'A', content: 'v6.1.2' });
    assert.equal(first.added, true);
    assert.equal(first.file, path.join('docs/draft/hello/sources.json'));

    const second = await target.addSupplement('hello', { url: 'https://swift.org/blog/a/?utm_source=t', content: 'v6.1.3' });
    assert.equal(second.added, false);
    assert.equal(second.entries.length, 1);

    const read = await target.readSupplements('hello');
    assert.equal(read.entries.length, 1);
    assert.equal(read.entries[0].content, 'v6.1.3');
    assert.equal(read.entries[0].title, 'swift.org', '第二次没给标题，应回落到域名而不是保留旧标题');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('promote 把补料一起搬到文章目录，转正后仍读得到', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'hotspot-supp-'));
  try {
    const target = createVitePressTarget({ root, articleDir: 'docs/article', draftDir: 'docs/draft' });
    await mkdir(path.join(root, 'docs/draft/hello'), { recursive: true });
    await writeFile(
      path.join(root, 'docs/draft/hello/index.md'),
      '---\ntitle: Hello\nsitemap: false\n---\n\n正文',
      'utf8',
    );
    await target.addSupplement('hello', { url: 'https://swift.org/blog/a/', content: 'v6.1.2' });

    const promoted = await target.promote('hello');
    assert.ok(promoted.supplement, 'promote 应返回补料新路径');
    assert.ok(existsSync(path.join(root, 'docs/article/hello/sources.json')));
    assert.equal(existsSync(path.join(root, 'docs/draft/hello')), false, '草稿目录应被清掉');

    const read = await target.readSupplements('hello');
    assert.equal(read.entries.length, 1);
    assert.equal(read.file, path.join('docs/article/hello/sources.json'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('一键登记候选来源：有原文的登记、没原文的记失败原因、addSupplement 抛错不中断', async () => {
  const calls = [];
  const target = {
    addSupplement: async (slug, input) => {
      if (input.url === 'https://boom.com/x') throw new Error('磁盘写满了');
      calls.push({ slug, url: input.url, kind: input.kind, title: input.title });
      return { added: true };
    },
  };

  const sources = [
    { source: 'gh', title: 'Release v6.1.2', url: 'https://github.com/a/b' },
    { source: 'blog', title: '作者博客', url: 'https://swift.org/blog/x/' },
    { source: 'news', title: '没有原文的源', url: 'https://missing.com/y' },
    { source: 'boom', title: '写盘失败', url: 'https://boom.com/x' },
  ];
  const raw = [
    { url: 'https://github.com/a/b', content: 'v6.1.2 修掉 3 个问题' },
    { url: 'https://swift.org/blog/x', content: '作者复盘' },
    { url: 'https://boom.com/x', content: '会抛错' },
  ];

  const outcome = await registerCandidateSources(target, 'demo', sources, raw);

  assert.deepEqual(outcome.registered, ['https://github.com/a/b', 'https://swift.org/blog/x']);
  assert.equal(outcome.failed.length, 2);
  assert.match(outcome.failed[0].reason, /没有留存原文/);
  assert.match(outcome.failed[1].reason, /磁盘写满了/);
  assert.equal(calls.length, 2, '抛错的那条不应算进登记数');
  assert.equal(calls[0].kind, 'candidate');
  assert.equal(calls[0].slug, 'demo');
  assert.equal(calls[1].title, '作者博客');
});

test('一键登记候选来源：空来源与空 raw 不炸', async () => {
  const target = { addSupplement: async () => ({ added: true }) };
  const empty = await registerCandidateSources(target, 'demo', [], []);
  assert.deepEqual(empty, { registered: [], failed: [] });

  const noRaw = await registerCandidateSources(target, 'demo', [{ url: 'https://a.com/x' }], []);
  assert.equal(noRaw.registered.length, 0);
  assert.equal(noRaw.failed.length, 1);
});
