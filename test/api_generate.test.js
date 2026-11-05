import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRoutes } from '../src/server/api.js';

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

  return {
    req,
    res,
    result: () => ({ status: statusCode, json: () => JSON.parse(responseBody || '{}') }),
  };
}

const TARGET = { articleDir: 'docs/article', draftDir: 'docs/draft' };
const STORE = { loadDigest: async () => null };

function routesWith(extra) {
  return createRoutes({
    projectRoot: '/tmp/blog',
    store: STORE,
    target: TARGET,
    runScan: async () => ({ digest: { date: '2026-11-05', items: [] }, status: {} }),
    ...extra,
  });
}

async function callGenerate(routes, body) {
  const route = routes.find((r) => r.path === '/dsh-hotspot/api/generate');
  assert.ok(route, '/dsh-hotspot/api/generate 应存在');
  const { req, res, result } = mockReqRes('POST', '/dsh-hotspot/api/generate', body);
  await route.handler(req, res);
  const out = result();
  return { status: out.status, ...out.json() };
}

test('生成正文：调用 deps.generate 并把校验结果一起回传', async () => {
  const seen = [];
  const routes = routesWith({
    generate: async (opts) => {
      seen.push(opts);
      return { slug: opts.slug, file: 'docs/draft/demo/index.md', bodyChars: 900, registered: 2, registerFailed: [] };
    },
    checkDraft: async (opts) => {
      assert.equal(opts.slug, 'demo');
      return { result: { ok: false, violations: [{ code: 'number-not-in-source', message: '6.1.2 找不到' }] } };
    },
  });

  const out = await callGenerate(routes, { slug: 'demo' });
  assert.equal(out.status, 200);
  assert.equal(out.value.bodyChars, 900);
  assert.equal(out.value.checks.ok, false);
  assert.equal(out.value.checks.violations.length, 1);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].target, TARGET, '必须用当前 target');
  assert.equal(seen[0].store, STORE);
});

test('生成正文：没接子代理时返回 501 而不是 500', async () => {
  const out = await callGenerate(routesWith({}), { slug: 'demo' });
  assert.equal(out.status, 501);
  assert.equal(out.ok, false);
  assert.equal(out.code, 'ERR_NO_WRITER');
});

test('生成正文：缺 slug 返回 400', async () => {
  const routes = routesWith({ generate: async () => ({ bodyChars: 1 }) });
  const out = await callGenerate(routes, {});
  assert.equal(out.status, 400);
  assert.match(out.error, /slug/);
});

test('生成正文：没有博客目录时拒绝', async () => {
  const routes = createRoutes({
    projectRoot: '',
    store: STORE,
    target: null,
    runScan: async () => ({ digest: { date: '2026-11-05', items: [] }, status: {} }),
    generate: async () => ({ bodyChars: 1 }),
  });
  const out = await callGenerate(routes, { slug: 'demo' });
  assert.equal(out.status, 400);
  assert.equal(out.code, 'ERR_NO_BLOG_ROOT');
});

test('生成正文：子代理失败时把原因透出来', async () => {
  const routes = routesWith({
    generate: async () => {
      throw new Error('生成超时（480s）');
    },
  });
  const out = await callGenerate(routes, { slug: 'demo' });
  assert.equal(out.status, 500);
  assert.match(out.error, /超时/);
});
