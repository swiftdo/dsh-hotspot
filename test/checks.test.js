import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { checkDraft, resolveCandidate } from '../src/core/checks.js';

function makeRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'hotspot-checks-'));
  mkdirSync(path.join(root, 'docs', 'draft'), { recursive: true });
  mkdirSync(path.join(root, 'docs', 'article'), { recursive: true });
  return root;
}

const frontmatter = (title) =>
  ['---', `title: ${title}`, 'description: "一句话摘要"', 'date: 2026-11-05', 'sitemap: false', '---', ''].join('\n');

function writeDraft(root, slug, { title = '中文标题', body = '正文。' } = {}) {
  const dir = path.join(root, 'docs', 'draft', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'index.md'), `${frontmatter(title)}${body}\n`, 'utf8');
  return path.join(dir, 'index.md');
}

function makeTarget(root, supplements = { entries: [], invalid: [], candidate: null }) {
  return {
    root,
    draftDir: path.join(root, 'docs', 'draft'),
    articleDir: path.join(root, 'docs', 'article'),
    async profile() {
      return { tagVocabulary: [], keywords: [], articles: [] };
    },
    async siteUrls() {
      return new Set(['/']);
    },
    async readSupplements() {
      return supplements;
    },
  };
}

/** digests[0] 视为 latest；raws 按日期给原文。 */
function makeStore({ digests = [], raws = {} } = {}) {
  return {
    async loadDigest(date) {
      if (date === 'latest') return digests[0] ?? null;
      return digests.find((digest) => digest.date === date) ?? null;
    },
    async loadRaw(date) {
      return raws[date] ?? [];
    },
    async loadRecent(limit = 14) {
      return digests.slice(0, limit);
    },
  };
}

const candidateItem = {
  id: 'h-20261105-03',
  title: 'Swift 6.2 released',
  slugHint: 'swift-6-2',
  summary: 'Swift 6.2 发布。',
  sources: [{ source: 'swift.org', title: 'Swift 6.2', url: 'https://swift.org/blog/swift-6-2' }],
};

const digestOf = (date, items) => ({ date, items });

test('有 candidate 记录时按 id 定位证据，版本号能对上', async () => {
  const root = makeRoot();
  writeDraft(root, 'swift-post', { body: 'Swift 6.2 发布了。' });
  const target = makeTarget(root, {
    entries: [],
    invalid: [],
    candidate: { id: 'h-20261105-03', url: 'https://swift.org/blog/swift-6-2', sources: [] },
  });
  const store = makeStore({
    digests: [digestOf('2026-11-05', [candidateItem])],
    raws: { '2026-11-05': [{ url: 'https://swift.org/blog/swift-6-2', content: 'Swift 6.2 发布' }] },
  });

  const report = await checkDraft({ target, store, slug: 'swift-post' });
  assert.equal(report.result.ok, true, JSON.stringify(report.result.violations));
  assert.equal(report.candidate.id, 'h-20261105-03');
  assert.equal(report.digestDate, '2026-11-05');
});

test('中文标题也能定位：不用靠标题猜候选', async () => {
  const root = makeRoot();
  writeDraft(root, 'zh-post', { title: 'Swift 6.2 到底改了什么', body: 'Swift 6.2 发布了。' });
  const target = makeTarget(root, {
    entries: [], invalid: [],
    candidate: { id: 'h-20261105-03', url: 'https://swift.org/blog/swift-6-2', sources: [] },
  });
  const store = makeStore({
    digests: [digestOf('2026-11-05', [candidateItem])],
    raws: { '2026-11-05': [{ url: 'https://swift.org/blog/swift-6-2', content: 'Swift 6.2 发布' }] },
  });
  const report = await checkDraft({ target, store, slug: 'zh-post' });
  assert.equal(report.result.ok, true, JSON.stringify(report.result.violations));
});

test('隔天再 check：候选只留在昨天的 digest 里，仍能按 id 找回', async () => {
  const root = makeRoot();
  writeDraft(root, 'yesterday', { body: 'Swift 6.2 发布了。' });
  const target = makeTarget(root, {
    entries: [], invalid: [],
    candidate: { id: 'h-20261105-03', url: 'https://swift.org/blog/swift-6-2', sources: [] },
  });
  const store = makeStore({
    digests: [
      digestOf('2026-11-06', [{ ...candidateItem, id: 'h-20261106-01' }]),
      digestOf('2026-11-05', [candidateItem]),
    ],
    raws: { '2026-11-05': [{ url: 'https://swift.org/blog/swift-6-2', content: 'Swift 6.2 发布' }] },
  });
  const report = await checkDraft({ target, store, slug: 'yesterday' });
  assert.equal(report.result.ok, true, JSON.stringify(report.result.violations));
  assert.equal(report.digestDate, '2026-11-05', '证据应取自候选当时所在的那份 digest');
});

test('定位不到候选就判 candidate-unresolved，不再把当天全部原文当证据', async () => {
  const root = makeRoot();
  writeDraft(root, 'orphan', { title: '随便一篇', body: '里面的 9.9.9 是瞎写的。' });
  const target = makeTarget(root);
  const store = makeStore({
    digests: [digestOf('2026-11-05', [candidateItem])],
    raws: { '2026-11-05': [{ url: 'https://x.com/a', content: '9.9.9 恰好在这里出现过' }] },
  });

  const report = await checkDraft({ target, store, slug: 'orphan' });
  assert.equal(report.result.ok, false);
  assert.deepEqual(report.result.violations.map((v) => v.code), ['candidate-unresolved']);
  assert.match(report.result.violations[0].message, /candidate/);
});

test('老草稿没有 candidate 记录时，仍可按标题匹配 latest 里的候选', async () => {
  const root = makeRoot();
  writeDraft(root, 'legacy', { title: 'Swift 6.2 released', body: 'Swift 6.2 发布了。' });
  const target = makeTarget(root);
  const store = makeStore({
    digests: [digestOf('2026-11-05', [candidateItem])],
    raws: { '2026-11-05': [{ url: 'https://swift.org/blog/swift-6-2', content: 'Swift 6.2 发布' }] },
  });
  const report = await checkDraft({ target, store, slug: 'legacy' });
  assert.equal(report.result.ok, true, JSON.stringify(report.result.violations));
});

test('数字确实不在证据边界内时仍然拦下（闸门没被放软）', async () => {
  const root = makeRoot();
  writeDraft(root, 'made-up', { body: '版本号 v9.8.7 是编的。' });
  const target = makeTarget(root, {
    entries: [], invalid: [],
    candidate: { id: 'h-20261105-03', url: 'https://swift.org/blog/swift-6-2', sources: [] },
  });
  const store = makeStore({
    digests: [digestOf('2026-11-05', [candidateItem])],
    raws: { '2026-11-05': [{ url: 'https://swift.org/blog/swift-6-2', content: 'Swift 6.2 发布' }] },
  });
  const report = await checkDraft({ target, store, slug: 'made-up' });
  assert.equal(report.result.ok, false);
  assert.ok(report.result.violations.some((v) => v.code === 'number-not-in-source'));
});

test('补料原文并入证据边界：登记过就不再判编造', async () => {
  const root = makeRoot();
  writeDraft(root, 'supplemented', { body: '版本号 v9.8.7 见官方公告。' });
  const target = makeTarget(root, {
    entries: [{ url: 'https://swift.org/blog/x', title: '公告', content: '我们发布了 v9.8.7' }],
    invalid: [],
    candidate: { id: 'h-20261105-03', url: 'https://swift.org/blog/swift-6-2', sources: [] },
  });
  const store = makeStore({
    digests: [digestOf('2026-11-05', [candidateItem])],
    raws: { '2026-11-05': [{ url: 'https://swift.org/blog/swift-6-2', content: 'Swift 6.2 发布' }] },
  });
  const report = await checkDraft({ target, store, slug: 'supplemented' });
  assert.equal(report.result.ok, true, JSON.stringify(report.result.violations));
});

test('resolveCandidate：显式 date 只在指定的那份里找', async () => {
  const store = makeStore({
    digests: [digestOf('2026-11-06', [candidateItem]), digestOf('2026-11-05', [])],
  });
  const hit = await resolveCandidate({ store, slug: 's', title: '', meta: { id: 'h-20261105-03' }, date: '2026-11-05' });
  assert.equal(hit.candidate, null);
  assert.match(hit.reason, /2026-11-05/);

  const ok = await resolveCandidate({ store, slug: 's', title: '', meta: { id: 'h-20261105-03' }, date: '2026-11-06' });
  assert.equal(ok.candidate.id, 'h-20261105-03');
});

test('没有 digest 时抛出可操作的错误，而不是原始 ENOENT', async () => {
  const root = makeRoot();
  writeDraft(root, 'no-digest');
  const target = makeTarget(root);
  const store = makeStore({ digests: [] });
  const report = await checkDraft({ target, store, slug: 'no-digest' });
  assert.equal(report.result.ok, false);
  assert.equal(report.result.violations[0].code, 'candidate-unresolved');
});
