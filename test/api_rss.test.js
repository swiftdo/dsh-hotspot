import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRoutes } from '../src/server/api.js';

function mockReqRes(method, pathUrl, headers = {}) {
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
    req.emit('end');
  });

  return {
    req,
    res,
    result: () => ({
      status: statusCode,
      headers: resHeaders,
      body: responseBody,
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

function digest() {
  return {
    date: '2026-11-05',
    generatedAt: '2026-11-05T10:00:00Z',
    status: { feedsOk: 1, feedsTotal: 1, itemsRaw: 3, itemsDeduped: 2, candidates: 1, degraded: false, failedSources: [] },
    items: [
      {
        id: 'cand-1',
        title: '候选文章',
        url: 'https://example.com/a',
        score: 120,
        scoreParts: {},
        sourceCount: 2,
        tags: ['swift'],
        slugHint: 'candidate',
        summary: '候选摘要',
        sources: [
          { source: 's1', title: '候选文章', url: 'https://example.com/a?utm_source=rss' },
          { source: 's2', title: '候选文章 2', url: 'https://example.com/a2' },
        ],
      },
    ],
  };
}

function rawItem(overrides = {}) {
  return {
    id: 'raw-1',
    title: '原文标题',
    url: 'https://example.com/b',
    content: '这条正文不该出现在订阅源里',
    source: 's1',
    sourceKind: 'rss',
    publishedAt: '2026-11-05T09:00:00Z',
    summary: '原文摘要',
    ...overrides,
  };
}

function rssRoute(deps) {
  return createRoutes(deps).find((r) => r.path === '/dsh-hotspot/rss.xml');
}

test('GET /dsh-hotspot/rss.xml 返回候选在前、今日文章在后的可解析订阅源', async (t) => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'hotspot-rss-test-'));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));

  const store = {
    loadDigest: async () => digest(),
    loadRaw: async () => [
      rawItem({ id: 'raw-2', url: 'https://example.com/c', title: '更早的文章', publishedAt: '2026-11-05T02:00:00Z' }),
      rawItem(),
      // 候选自身的原始条目：规范化 URL 相同，不能再出现一次
      rawItem({ id: 'raw-3', url: 'https://example.com/a?utm_medium=feed', title: '重复候选' }),
    ],
  };

  const route = rssRoute(makeDeps(tempDir, store));
  const mock = mockReqRes('GET', '/dsh-hotspot/rss.xml');
  await route.handler(mock.req, mock.res);

  const { status, headers, body } = mock.result();
  assert.equal(status, 200);
  assert.match(headers['content-type'], /application\/rss\+xml/);
  assert.ok(body.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.match(body, /<atom:link href="http:\/\/127\.0\.0\.1:63259\/dsh-hotspot\/rss\.xml" rel="self"/);
  assert.match(body, /候选 1 条 · 今日文章 2 条/);

  const order = [...body.matchAll(/<title>([^<]+)<\/title>/g)].map((m) => m[1]);
  assert.deepEqual(order.slice(1), ['候选文章', '原文标题', '更早的文章'], '候选排第一，文章按发布时间倒序');
  assert.ok(!body.includes('这条正文不该出现在订阅源里'), '正文不进订阅源');
  assert.ok(!body.includes('重复候选'), '候选 URL 规范化后去重');

  const last = body.match(/<item>[\s\S]*?原文标题[\s\S]*?<\/item>/)[0];
  assert.match(last, /<guid isPermaLink="true">https:\/\/example\.com\/b<\/guid>/);
  assert.match(last, /<pubDate>Thu, 05 Nov 2026 09:00:00 GMT<\/pubDate>/);
});

test('没有 digest 时订阅源返回空 items 而不是报错', async (t) => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'hotspot-rss-test-'));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));

  const route = rssRoute(makeDeps(tempDir, { loadDigest: async () => null, loadRaw: async () => [rawItem()] }));
  const mock = mockReqRes('GET', '/dsh-hotspot/rss.xml');
  await route.handler(mock.req, mock.res);

  const { status, body } = mock.result();
  assert.equal(status, 200);
  assert.ok(!body.includes('<item>'), '没有当天数据就不输出条目');
  assert.match(body, /今天还没有抓取记录/);
});

test('订阅源只放行本机同源 GET', async (t) => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'hotspot-rss-test-'));
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));

  const deps = makeDeps(tempDir, { loadDigest: async () => digest(), loadRaw: async () => [rawItem()] });
  const route = rssRoute(deps);

  const crossSite = mockReqRes('GET', '/dsh-hotspot/rss.xml', { origin: 'https://evil.example' });
  await route.handler(crossSite.req, crossSite.res);
  assert.equal(crossSite.result().status, 403);

  const wrongMethod = mockReqRes('POST', '/dsh-hotspot/rss.xml');
  await route.handler(wrongMethod.req, wrongMethod.res);
  assert.equal(wrongMethod.result().status, 405);
});
