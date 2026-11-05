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

  return { req, res, result: () => ({ status: statusCode, json: () => JSON.parse(responseBody || '{}') }) };
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

async function callPolish(routes, body) {
  const route = routes.find((r) => r.path === '/dsh-hotspot/api/polish');
  assert.ok(route, '/dsh-hotspot/api/polish 应存在');
  const { req, res, result } = mockReqRes('POST', '/dsh-hotspot/api/polish', body);
  await route.handler(req, res);
  const out = result();
  return { status: out.status, ...out.json() };
}

test('润色：把 slug 与要求交给 deps.polish，并回传校验结果', async () => {
  const seen = [];
  const routes = routesWith({
    polish: async (opts) => {
      seen.push(opts);
      return {
        slug: opts.slug,
        file: 'docs/draft/demo/index.md',
        beforeChars: 900,
        bodyChars: 820,
        deltaChars: -80,
        facts: { ok: false },
        factWarning: '少了 1 个数字（如 42）',
      };
    },
    checkDraft: async (opts) => {
      assert.equal(opts.slug, 'demo');
      return { result: { ok: true, violations: [] } };
    },
  });

  const out = await callPolish(routes, { slug: 'demo', instruction: '更口语一点' });
  assert.equal(out.status, 200);
  assert.equal(out.ok, true);
  assert.equal(out.value.checks.ok, true);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].slug, 'demo');
  assert.equal(seen[0].instruction, '更口语一点');
  assert.equal(seen[0].target, TARGET);
  // 事实差异要进 message，面板 toast 直接可见
  assert.match(out.message, /少了 1 个数字/);
});

test('润色：不传要求也放行（服务端用默认取向）', async () => {
  let got = null;
  const routes = routesWith({
    polish: async (opts) => {
      got = opts.instruction;
      return { beforeChars: 10, bodyChars: 10, facts: { ok: true }, factWarning: '' };
    },
  });
  const out = await callPolish(routes, { slug: 'demo' });
  assert.equal(out.status, 200);
  assert.equal(got, '');
});

test('润色：缺 slug / 要求过长 / 没有润色服务 / 抛错都给出明确状态码', async () => {
  const base = { polish: async () => ({ beforeChars: 1, bodyChars: 1, facts: { ok: true } }) };

  const missing = await callPolish(routesWith(base), { instruction: '改一改' });
  assert.equal(missing.status, 400);
  assert.match(missing.error, /slug/);

  const tooLong = await callPolish(routesWith(base), { slug: 'demo', instruction: 'x'.repeat(2001) });
  assert.equal(tooLong.status, 400);
  assert.match(tooLong.error, /2000/);

  const noPolish = await callPolish(routesWith({}), { slug: 'demo' });
  assert.equal(noPolish.status, 501);
  assert.equal(noPolish.code, 'ERR_NO_POLISHER');

  const failed = await callPolish(
    routesWith({ polish: async () => { throw new Error('正文还是空的，先补全正文再润色'); } }),
    { slug: 'demo' },
  );
  assert.equal(failed.status, 500);
  assert.match(failed.error, /正文还是空的/);
});
