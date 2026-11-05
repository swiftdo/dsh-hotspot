import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRoutes } from '../src/server/api.js';

function mockReqRes(method, pathUrl, body = null, headers = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = pathUrl;
  req.headers = { host: '127.0.0.1:63259', origin: 'http://127.0.0.1:63259', ...headers };
  req.socket = { remoteAddress: '127.0.0.1' };

  let responseBody = '';
  let statusCode = 200;
  const resHeaders = {};

  const res = {
    writeHead(code, h = {}) {
      statusCode = code;
      Object.assign(resHeaders, h);
    },
    end(chunk) {
      if (chunk) responseBody += chunk;
      this.finished = true;
    },
    finished: false,
  };

  process.nextTick(() => {
    if (body) {
      req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
    }
    req.emit('end');
  });

  return {
    req,
    res,
    result: () => ({
      status: statusCode,
      headers: resHeaders,
      json: () => JSON.parse(responseBody || '{}'),
    }),
  };
}

function makeDeps(tempDir, store) {
  return {
    projectRoot: tempDir,
    store,
    target: {
      articleDir: 'docs',
      draftDir: 'docs/draft',
      profile: async () => ({ tagVocabulary: [], keywords: [], articles: [] }),
      listDrafts: async () => [],
    },
    runScan: async () => ({ digest: null, status: {} }),
    onConfigUpdated: async () => undefined,
  };
}

async function readState(deps) {
  const route = createRoutes(deps).find((r) => r.path === '/dsh-hotspot/api/state');
  const mock = mockReqRes('GET', '/dsh-hotspot/api/state');
  await route.handler(mock.req, mock.res);
  const payload = mock.result().json();
  assert.equal(payload.ok, true);
  return payload.value;
}

function digest(date = '2026-11-05') {
  return {
    date,
    generatedAt: `${date}T00:00:00Z`,
    status: { feedsOk: 1, feedsTotal: 1, itemsRaw: 2, itemsDeduped: 1, candidates: 1, degraded: false, failedSources: [] },
    items: [
      {
        id: 'cand-1',
        title: '候选文章',
        url: 'https://example.com/a',
        score: 120,
        scoreParts: {},
        sourceCount: 1,
        tags: [],
        slugHint: 'candidate',
        summary: '候选摘要',
        sources: [{ source: 's1', title: '候选文章', url: 'https://example.com/a?utm_source=rss' }],
      },
    ],
  };
}

function rawItem(overrides = {}) {
  return {
    id: 'raw-1',
    title: '原文标题',
    url: 'https://example.com/a',
    content: '这条正文不该出现在 feed 里',
    source: 's1',
    sourceKind: 'rss',
    publishedAt: '2026-11-05T09:00:00Z',
    summary: '摘要',
    ...overrides,
  };
}

test('buildState.feed 带出当天 raw 条目，候选按 URL 标记，正文不外泄', async (t) => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'hotspot-feed-test-'));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));

  const longSummary = 'x'.repeat(500);
  const store = {
    loadDigest: async () => digest(),
    loadRaw: async (date) => {
      assert.equal(date, '2026-11-05');
      return [
        rawItem(),
        rawItem({ id: 'raw-2', title: '早间文章', url: 'https://example.com/b', publishedAt: '2026-11-05T07:00:00Z' }),
        rawItem({
          id: 'raw-3',
          title: '晚间文章',
          url: 'https://example.com/c',
          publishedAt: '2026-11-05T11:00:00Z',
          source: 's2',
          summary: longSummary,
        }),
      ];
    },
  };

  const value = await readState(makeDeps(tempDir, store));

  assert.equal(value.feed.date, '2026-11-05');
  assert.equal(value.feed.items.length, 3);
  const byUrl = Object.fromEntries(value.feed.items.map((item) => [item.url, item]));
  assert.equal(byUrl['https://example.com/a'].candidate, true);
  assert.equal(byUrl['https://example.com/b'].candidate, false);
  assert.equal(value.feed.items[0].url, 'https://example.com/c', '按发布时间倒序');
  assert.equal(value.feed.items[0].summary.length, 200, '摘要截断到 200 字符');
  assert.equal(byUrl['https://example.com/b'].content, undefined, 'raw 正文不返回给面板');
  assert.equal(byUrl['https://example.com/b'].source, 's1');
});

test('没有 digest 或 store 不支持 loadRaw 时 feed 为空且不报错', async (t) => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'hotspot-feed-test-'));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));

  const noDigest = await readState(makeDeps(tempDir, { loadDigest: async () => null, loadRaw: async () => [rawItem()] }));
  assert.equal(noDigest.feed.date, '');
  assert.equal(noDigest.feed.items.length, 0);
  assert.equal(noDigest.feed.candidateCount, 0);
  assert.equal(noDigest.feed.rssPath, '/dsh-hotspot/rss.xml');

  const noLoadRaw = await readState(makeDeps(tempDir, { loadDigest: async () => digest() }));
  assert.equal(noLoadRaw.feed.date, '2026-11-05');
  assert.equal(noLoadRaw.feed.items.length, 0);
  assert.equal(noLoadRaw.feed.candidateCount, 1);
});

test('feed 最多返回 300 条', async (t) => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'hotspot-feed-test-'));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));

  const store = {
    loadDigest: async () => digest(),
    loadRaw: async () =>
      Array.from({ length: 420 }, (_, i) =>
        rawItem({ id: `raw-${i}`, url: `https://example.com/${i}`, publishedAt: `2026-11-05T00:00:${String(i % 60).padStart(2, '0')}Z` })
      ),
  };

  const value = await readState(makeDeps(tempDir, store));
  assert.equal(value.feed.items.length, 300);
});

test('feed 条目的 sourceName 把源 id 翻成可读名字，未知源退回 id', async (t) => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'hotspot-feed-test-'));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));

  writeFileSync(path.join(tempDir, 'dsh-hotspot.config.json'), JSON.stringify({
    sources: [
      { id: 'swift-releases', kind: 'github-release', repo: 'apple/swift' },
      { id: 'swift-blog', kind: 'rss', url: 'https://www.swift.org/atom.xml' },
    ],
  }));

  const store = {
    loadDigest: async () => digest(),
    loadRaw: async () => [
      rawItem({ id: 'raw-gh', source: 'swift-releases', url: 'https://example.com/gh' }),
      rawItem({ id: 'raw-blog', source: 'swift-blog', url: 'https://example.com/blog' }),
      rawItem({ id: 'raw-unknown', source: 's9', url: 'https://example.com/unknown' }),
    ],
  };

  const value = await readState(makeDeps(tempDir, store));
  const byUrl = Object.fromEntries(value.feed.items.map((item) => [item.url, item]));
  assert.equal(byUrl['https://example.com/gh'].sourceName, 'GitHub · apple/swift', 'github-release 没配 name 时按 repo 拼名字');
  assert.equal(byUrl['https://example.com/blog'].sourceName, 'swift.org', 'rss 没配 name 时退回域名');
  assert.equal(byUrl['https://example.com/unknown'].sourceName, 's9', '未知源不编造名字，退回 id');
});

test('配置里给内置源改名时，以配置为准', async (t) => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'hotspot-feed-test-'));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));

  writeFileSync(path.join(tempDir, 'dsh-hotspot.config.json'), JSON.stringify({
    sources: [{ id: 'sopilot-hottweets', kind: 'rss', url: 'https://sopilot.net/rss/hottweets', name: '我的推特源' }],
  }));

  const store = {
    loadDigest: async () => digest(),
    loadRaw: async () => [rawItem({ id: 'raw-sp', source: 'sopilot-hottweets' })],
  };

  const value = await readState(makeDeps(tempDir, store));
  assert.equal(value.feed.items[0].sourceName, '我的推特源');
});
