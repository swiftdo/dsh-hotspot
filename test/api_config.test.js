import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
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

test('API 路由：支持获取与配置博客路径及参数', async (t) => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'hotspot-api-test-'));
  const customBlogDir = path.join(tempDir, 'my-blog');
  mkdirSync(customBlogDir, { recursive: true });

  t.after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  let updatedRuntimeConfig = null;
  const deps = {
    projectRoot: tempDir,
    store: {
      loadDigest: async () => null,
    },
    target: {
      articleDir: 'docs',
      draftDir: 'docs/draft',
      profile: async () => ({ tagVocabulary: ['swift', 'rust'], keywords: [{ term: 'compiler' }], articles: [] }),
      listDrafts: async () => [],
    },
    runScan: async () => ({ digest: { date: '2026-11-05', generatedAt: '2026-11-05T00:00:00Z', items: [] }, status: {} }),
    onConfigUpdated: async (cfg) => {
      updatedRuntimeConfig = cfg;
      return { projectRoot: cfg.projectRoot || tempDir };
    },
  };

  const routes = createRoutes(deps);
  const stateRoute = routes.find((r) => r.path === '/hotspot/api/state');
  const configRoute = routes.find((r) => r.path === '/hotspot/api/config');

  assert.ok(stateRoute, '/hotspot/api/state 路由应存在');
  assert.ok(configRoute, '/hotspot/api/config 路由应存在');

  // 1. 测试 GET state
  const { req: sReq, res: sRes, result: sResult } = mockReqRes('GET', '/hotspot/api/state');
  await stateRoute.handler(sReq, sRes);
  const sData = sResult().json();
  assert.equal(sResult().status, 200);
  assert.equal(sData.ok, true);
  assert.equal(sData.value.projectRoot, tempDir);
  assert.equal(sData.value.blog.articleDir, 'docs');
  assert.equal(sData.value.config.rank.limit, 15);

  // 2. 测试 POST config - 错误目录拦截
  const { req: errReq, res: errRes, result: errResult } = mockReqRes('POST', '/hotspot/api/config', {
    projectRoot: '/non/existent/path/for/sure/12345',
  });
  await configRoute.handler(errReq, errRes);
  assert.equal(errResult().status, 400);
  assert.ok(errResult().json().message.includes('指定博客根目录不存在'));

  // 3. 测试 POST config - 正常配置博客参数
  const { req: cReq, res: cRes, result: cResult } = mockReqRes('POST', '/hotspot/api/config', {
    projectRoot: customBlogDir,
    articleDir: 'posts',
    draftDir: 'posts/drafts',
    digestDir: '.my-hotspot',
    rank: {
      limit: 20,
      sinceHours: 48,
      halfLifeHours: 12,
      clusterThreshold: 0.7,
    },
    publish: {
      maxPerDay: 5,
      allowedHosts: ['https://apple.com/test', 'swift.org'],
    },
  });
  await configRoute.handler(cReq, cRes);
  const cData = cResult().json();
  assert.equal(cResult().status, 200);
  assert.equal(cData.ok, true);
  assert.equal(cData.value.projectRoot, customBlogDir);
  assert.equal(cData.value.articleDir, 'posts');
  assert.equal(cData.value.draftDir, 'posts/drafts');
  assert.equal(cData.value.digestDir, '.my-hotspot');
  assert.equal(cData.value.rank.limit, 20);
  assert.deepEqual(cData.value.publish.allowedHosts, ['apple.com', 'swift.org']);

  // 验证 onConfigUpdated 回调被正确触发
  assert.ok(updatedRuntimeConfig, 'onConfigUpdated 应被触发');
  assert.equal(updatedRuntimeConfig.projectRoot, customBlogDir);
  assert.equal(updatedRuntimeConfig.articleDir, 'posts');
});
