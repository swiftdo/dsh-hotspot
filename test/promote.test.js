import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describeViolations, promoteChecked } from '../src/core/promote.js';

function makeRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'hotspot-promote-'));
  mkdirSync(path.join(root, 'docs', 'draft'), { recursive: true });
  mkdirSync(path.join(root, 'docs', 'article'), { recursive: true });
  return root;
}

const frontmatter = (title) =>
  ['---', `title: ${title}`, 'description: "一句话摘要"', 'date: 2026-11-05', 'sitemap: false', '---', ''].join('\n');

const candidateItem = {
  id: 'h-20261105-03',
  title: 'Swift 6.2 released',
  slugHint: 'swift-6-2',
  summary: 'Swift 6.2 发布。',
  sources: [{ source: 'swift.org', title: 'Swift 6.2', url: 'https://swift.org/blog/swift-6-2' }],
};

function makeTarget(root, { promotedSlug } = {}) {
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
      return { entries: [], invalid: [], candidate: { id: 'h-20261105-03', url: candidateItem.sources[0].url, sources: [] } };
    },
    async promote(slug) {
      if (promotedSlug) promotedSlug.value = slug;
      const from = path.join(root, 'docs', 'draft', slug);
      const to = path.join(root, 'docs', 'article', slug);
      mkdirSync(to, { recursive: true });
      writeFileSync(path.join(to, 'index.md'), 'promoted', 'utf8');
      return { from, to, file: path.join(to, 'index.md') };
    },
  };
}

const store = {
  async loadDigest(date) {
    return date === 'latest' ? { date: '2026-11-05', items: [candidateItem] } : null;
  },
  async loadRaw() {
    return [{ url: 'https://swift.org/blog/swift-6-2', content: 'Swift 6.2 发布' }];
  },
  async loadRecent() {
    return [{ date: '2026-11-05', items: [candidateItem] }];
  },
};

function writeDraft(root, slug, body) {
  const dir = path.join(root, 'docs', 'draft', slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'index.md'), `${frontmatter('Swift 6.2 解读')}${body}\n`, 'utf8');
}

test('违规时拒绝转正，草稿留在草稿目录', async () => {
  const root = makeRoot();
  writeDraft(root, 'bad', '版本号 v9.9.9 是编的。');
  const promoted = { value: null };
  const target = makeTarget(root, { promotedSlug: promoted });

  const outcome = await promoteChecked({ target, store, slug: 'bad' });
  assert.equal(outcome.ok, false);
  assert.equal(promoted.value, null, 'promote 不该被调用');
  assert.ok(outcome.violations.some((v) => v.code === 'number-not-in-source'));
  assert.equal(existsSync(path.join(root, 'docs', 'article', 'bad')), false);
  assert.equal(existsSync(path.join(root, 'docs', 'draft', 'bad', 'index.md')), true);
});

test('全过才转正，并把 slug 交给 target.promote', async () => {
  const root = makeRoot();
  writeDraft(root, 'good', 'Swift 6.2 发布了。');
  const promoted = { value: null };
  const target = makeTarget(root, { promotedSlug: promoted });

  const outcome = await promoteChecked({ target, store, slug: 'good' });
  assert.equal(outcome.ok, true, JSON.stringify(outcome.violations));
  assert.equal(promoted.value, 'good');
  assert.equal(outcome.promoted.to, path.join(root, 'docs', 'article', 'good'));
});

test('describeViolations 把违规摊成一句可显示的话', () => {
  assert.equal(describeViolations([]), '无违规');
  const text = describeViolations([
    { code: 'number-not-in-source' },
    { code: 'number-not-in-source' },
    { code: 'external-link-untrusted' },
  ]);
  assert.equal(text, '3 项 · number-not-in-source×2、external-link-untrusted');
});
