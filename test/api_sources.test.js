import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createRoutes } from '../src/server/api.js';
import { BUILTIN_SOURCES } from '../src/core/sources.js';

function mockReqRes(method, pathUrl, body = null) {
  const req = new EventEmitter();
  req.method = method;
  req.url = pathUrl;
  req.headers = { host: '127.0.0.1:63259', origin: 'http://127.0.0.1:63259' };
  req.socket = { remoteAddress: '127.0.0.1' };

  let responseBody = '';
  let statusCode = 200;
  const res = {
    writeHead(code) {
      statusCode = code;
    },
    end(chunk) {
      if (chunk) responseBody += chunk;
      this.finished = true;
    },
    finished: false,
  };

  process.nextTick(() => {
    if (body) req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
    req.emit('end');
  });

  return { req, res, result: () => ({ status: statusCode, json: () => JSON.parse(responseBody || '{}') }) };
}

function setupBlog(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'hotspot-sources-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function routesWith(root) {
  return createRoutes({
    projectRoot: root,
    store: { loadDigest: async () => null, loadRaw: async () => [] },
    target: { articleDir: 'docs', draftDir: '.drafts', listDrafts: async () => [] },
    runScan: async () => ({ digest: { date: '2026-11-05', items: [] }, status: {} }),
    onConfigUpdated: async () => undefined,
  });
}

async function call(routes, suffix, method, body) {
  const route = routes.find((r) => r.path === `/dsh-hotspot/api/${suffix}`);
  assert.ok(route, `/dsh-hotspot/api/${suffix} 应存在`);
  const { req, res, result } = mockReqRes(method, `/dsh-hotspot/api/${suffix}`, body);
  await route.handler(req, res);
  const out = result();
  return { status: out.status, ...out.json() };
}

function readConfig(root) {
  return JSON.parse(readFileSync(path.join(root, 'dsh-hotspot.config.json'), 'utf8'));
}

test('添加源：不填 id 时从域名推导，并写进配置', async (t) => {
  const root = setupBlog(t);
  const routes = routesWith(root);

  const out = await call(routes, 'sources', 'POST', {
    sources: [{ kind: 'rss', url: 'https://example.com/feed.xml' }],
  });
  assert.equal(out.status, 200);
  assert.equal(out.value.sources[0].id, 'example');
  assert.equal(readConfig(root).sources[0].id, 'example');
});

test('添加源：两个同域名源依次推导，第二个自动加后缀', async (t) => {
  const root = setupBlog(t);
  const routes = routesWith(root);

  const out = await call(routes, 'sources', 'POST', {
    sources: [
      { kind: 'rss', url: 'https://example.com/feed.xml' },
      { kind: 'rss', url: 'https://example.com/blog/feed.xml' },
    ],
  });
  assert.equal(out.status, 200);
  assert.deepEqual(out.value.sources.map((s) => s.id), ['example', 'example-blog']);
});

test('添加源：地址就是内置源时回 409，不重复抓', async (t) => {
  const root = setupBlog(t);
  const routes = routesWith(root);
  const builtin = BUILTIN_SOURCES.find((source) => source.url);

  const out = await call(routes, 'sources', 'POST', { sources: [{ kind: 'rss', url: builtin.url }] });
  assert.equal(out.status, 409);
  assert.equal(out.code, 'ERR_BUILTIN_URL');
  assert.match(out.message, new RegExp(builtin.id));
});

test('添加源：占用内置 id 时回 400 ERR_BUILTIN_ID', async (t) => {
  const root = setupBlog(t);
  const routes = routesWith(root);

  const out = await call(routes, 'sources', 'POST', {
    sources: [{ id: 'ifanr', kind: 'rss', url: 'https://other.example/feed.xml' }],
  });
  assert.equal(out.status, 400);
  assert.equal(out.code, 'ERR_BUILTIN_ID');
});

test('开关内置源：关闭写进 disabledBuiltins，再开则删掉该字段', async (t) => {
  const root = setupBlog(t);
  const routes = routesWith(root);

  const off = await call(routes, 'sources/builtin', 'POST', { id: 'ifanr', enabled: false });
  assert.equal(off.status, 200);
  assert.equal(off.value.enabled, false);
  assert.deepEqual(readConfig(root).disabledBuiltins, ['ifanr']);
  assert.ok(!off.value.activeSources.some((s) => s.id === 'ifanr'), '关掉的源不该还在生效集合里');

  const on = await call(routes, 'sources/builtin', 'POST', { id: 'ifanr', enabled: true });
  assert.equal(on.status, 200);
  assert.equal(readConfig(root).disabledBuiltins, undefined, '全开时不留空数组');
  assert.ok(on.value.activeSources.some((s) => s.id === 'ifanr'));
});

test('开关内置源：未知 id 回 404，enabled 不是布尔值回 400', async (t) => {
  const root = setupBlog(t);
  const routes = routesWith(root);

  assert.equal((await call(routes, 'sources/builtin', 'POST', { id: 'nope', enabled: false })).status, 404);
  assert.equal((await call(routes, 'sources/builtin', 'POST', { id: 'ifanr', enabled: 'no' })).status, 400);
});

test('id 预览：GET /api/sources/derive 按 kind/url 推导', async (t) => {
  const root = setupBlog(t);
  const routes = routesWith(root);

  const rss = await call(routes, 'sources/derive', 'GET', null);
  assert.equal(rss.status, 200);

  const route = routes.find((r) => r.path === '/dsh-hotspot/api/sources/derive');
  const { req, res, result } = mockReqRes('GET', '/dsh-hotspot/api/sources/derive?kind=rss&url=https://plink.anyfeeder.com/people');
  await route.handler(req, res);
  const out = result();
  assert.equal(out.json().value.id, 'anyfeeder-people');
});

test('连接测试：能抓到一个本地 RSS 源，报告条数与耗时', async (t) => {
  const root = setupBlog(t);
  const routes = routesWith(root);

  const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
    <item><title>第一条</title><link>https://example.com/a</link><description>A</description></item>
    <item><title>第二条</title><link>https://example.com/b</link><description>B</description></item>
  </channel></rss>`;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/rss+xml' });
    res.end(rss);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/feed.xml`;

  const out = await call(routes, 'sources/test', 'POST', { kind: 'rss', url });
  assert.equal(out.status, 200);
  assert.equal(out.value.ok, true);
  assert.equal(out.value.items, 2);
  assert.deepEqual(out.value.sample, ['第一条', '第二条']);
  assert.ok(Number(out.value.ms) >= 0);
});

test('连接测试：抓不到时 ok=false 并带回原因，但 HTTP 仍是 200', async (t) => {
  const root = setupBlog(t);
  const routes = routesWith(root);

  const out = await call(routes, 'sources/test', 'POST', {
    kind: 'rss',
    url: 'http://127.0.0.1:1/nope.xml',
  });
  assert.equal(out.status, 200);
  assert.equal(out.value.ok, false);
  assert.ok(out.value.error, '要带回失败原因');
});

test('连接测试：参数不合法时回 400，不去发请求', async (t) => {
  const root = setupBlog(t);
  const routes = routesWith(root);

  const out = await call(routes, 'sources/test', 'POST', { kind: 'nope', url: 'https://example.com' });
  assert.equal(out.status, 400);
  assert.equal(out.code, 'ERR_SOURCE_INVALID');
});

test('添加源：内置源的手工复制被静默丢弃，不报错', async (t) => {
  const root = setupBlog(t);
  const routes = routesWith(root);
  const builtin = BUILTIN_SOURCES.find((source) => source.id === 'appinn');

  const out = await call(routes, 'sources', 'POST', {
    sources: [
      { id: 'appinn', kind: 'rss', url: builtin.url },
      { kind: 'rss', url: 'https://example.com/feed.xml' },
    ],
  });
  assert.equal(out.status, 200);
  assert.deepEqual(out.value.sources.map((s) => s.id), ['example'], '复制被丢掉，只留下真的自定义源');
  assert.deepEqual(readConfig(root).sources.map((s) => s.id), ['example']);
});
