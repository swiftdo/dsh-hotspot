import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
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
      text: () => responseBody,
    }),
  };
}

function makeDeps(projectRoot) {
  return {
    projectRoot,
    store: { loadDigest: async () => null },
    target: {
      articleDir: 'docs',
      draftDir: 'docs/draft',
      profile: async () => ({ tagVocabulary: [], keywords: [], articles: [] }),
      listDrafts: async () => [],
    },
    runScan: async () => ({ digest: { date: '2026-11-05', items: [] }, status: {} }),
    onConfigUpdated: async (cfg) => ({ projectRoot: cfg.projectRoot || projectRoot }),
  };
}

const CONFIG_ROUTE = '/dsh-hotspot/api/config';
const BLOG_SOURCES = [
  { id: 'sopilot-hottweets', name: 'SoPilot AI 爆款推文', kind: 'rss', url: 'https://sopilot.net/rss/hottweets' },
  { id: 'swift-org', name: 'Swift.org', kind: 'rss', url: 'https://swift.org/atom.xml' },
];

// 回归：面板改绑博客根目录时，以前是拿「当前根」的配置（未绑定状态就是 {}）整份覆盖目标根文件，
// 目标根已有的 sources 被一起抹掉 —— 现象正是「明明有默认源，抓取却报没有配置任何 sources」。
test('换绑博客根目录时，目标根已有的 sources 必须保留', async (t) => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'hotspot-rebind-'));
  const blogDir = path.join(tempDir, 'blog');
  mkdirSync(blogDir, { recursive: true });
  writeFileSync(
    path.join(blogDir, 'dsh-hotspot.config.json'),
    `${JSON.stringify({ projectRoot: blogDir, sources: BLOG_SOURCES, publish: { maxPerDay: 2 } }, null, 2)}\n`,
    'utf8',
  );

  t.after(() => rmSync(tempDir, { recursive: true, force: true }));

  const routes = createRoutes(makeDeps(tempDir));
  const configRoute = routes.find((r) => r.path === CONFIG_ROUTE);
  const stateRoute = routes.find((r) => r.path === '/dsh-hotspot/api/state');

  const { req, res, result } = mockReqRes('POST', CONFIG_ROUTE, { projectRoot: blogDir });
  await configRoute.handler(req, res);
  assert.equal(result().status, 200, result().text());

  const saved = JSON.parse(readFileSync(path.join(blogDir, 'dsh-hotspot.config.json'), 'utf8'));
  assert.deepEqual(saved.sources.map((s) => s.id), ['sopilot-hottweets', 'swift-org'], '目标根的 sources 被覆盖丢失');
  assert.equal(saved.publish.maxPerDay, 2, '目标根的 publish 被覆盖丢失');
  assert.equal(saved.projectRoot, blogDir);

  // 面板状态也要跟着说真话：配置里有源 → config 模式，生效源就是这两条。
  const { req: sReq, res: sRes, result: sResult } = mockReqRes('GET', '/dsh-hotspot/api/state');
  await stateRoute.handler(sReq, sRes);
  const state = sResult().json().value;
  assert.equal(state.sourcesMode, 'config');
  assert.deepEqual(state.config.sources.map((s) => s.id), ['sopilot-hottweets', 'swift-org']);
  assert.deepEqual(state.activeSources.map((s) => s.id), ['sopilot-hottweets', 'swift-org']);
});

test('未绑定状态下换绑到已有配置的根，也不会清空对方的 sources', async (t) => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'hotspot-rebind-unbound-'));
  const blogDir = path.join(tempDir, 'blog');
  mkdirSync(blogDir, { recursive: true });
  writeFileSync(
    path.join(blogDir, 'dsh-hotspot.config.json'),
    `${JSON.stringify({ sources: BLOG_SOURCES }, null, 2)}\n`,
    'utf8',
  );

  t.after(() => rmSync(tempDir, { recursive: true, force: true }));

  const routes = createRoutes(makeDeps(''));
  const configRoute = routes.find((r) => r.path === CONFIG_ROUTE);

  const { req, res, result } = mockReqRes('POST', CONFIG_ROUTE, { projectRoot: blogDir, articleDir: 'docs' });
  await configRoute.handler(req, res);
  assert.equal(result().status, 200, result().text());

  const saved = JSON.parse(readFileSync(path.join(blogDir, 'dsh-hotspot.config.json'), 'utf8'));
  assert.deepEqual(saved.sources.map((s) => s.id), ['sopilot-hottweets', 'swift-org']);
});

test('换绑时目标根配置写坏了要报错，而不是静默覆盖掉', async (t) => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'hotspot-rebind-badjson-'));
  const blogDir = path.join(tempDir, 'blog');
  mkdirSync(blogDir, { recursive: true });
  const broken = '{\n  "sources": [ { "id": "a", } ]\n}\n';
  const brokenFile = path.join(blogDir, 'dsh-hotspot.config.json');
  writeFileSync(brokenFile, broken, 'utf8');

  t.after(() => rmSync(tempDir, { recursive: true, force: true }));

  const routes = createRoutes(makeDeps(tempDir));
  const configRoute = routes.find((r) => r.path === CONFIG_ROUTE);

  const { req, res, result } = mockReqRes('POST', CONFIG_ROUTE, { projectRoot: blogDir });
  await configRoute.handler(req, res);
  assert.equal(result().status, 400);
  assert.match(result().json().message, /配置文件解析失败/);
  assert.equal(readFileSync(brokenFile, 'utf8'), broken, '解析失败时不得改写用户的配置文件');
  assert.ok(existsSync(brokenFile));
});
