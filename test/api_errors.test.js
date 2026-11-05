import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { createRoutes } from '../src/server/api.js';

function mockReqRes(method, pathUrl, body) {
  const req = new EventEmitter();
  req.method = method;
  req.url = pathUrl;
  req.headers = { host: '127.0.0.1:63259', origin: 'http://127.0.0.1:63259' };
  req.socket = { remoteAddress: '127.0.0.1' };
  let raw = '';
  let status = 200;
  const res = { writeHead(code) { status = code; }, end(chunk) { if (chunk) raw += chunk; } };
  process.nextTick(() => {
    if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  });
  return { req, res, result: () => ({ status, json: () => JSON.parse(raw || '{}') }) };
}

function depsWith(overrides = {}) {
  const calls = [];
  return {
    calls,
    deps: {
      projectRoot: '/tmp/blog',
      store: { loadDigest: async () => null, loadRaw: async () => [] },
      target: { listDrafts: async () => [], profile: async () => ({ tagVocabulary: [], keywords: [], articles: [] }) },
      runScan: async () => ({ digest: null, status: {} }),
      readErrors: async (opts) => { calls.push(['read', opts]); return [{ at: '2026-11-05T10:00:00.000Z', source: 'writer', message: '模型没有返回正文' }]; },
      clearErrors: async (opts) => { calls.push(['clear', opts]); return 2; },
      errorFiles: async () => ['2026-11-05'],
      errorLogToday: () => '2026-11-05',
      ...overrides,
    },
  };
}

async function call(deps, method, pathUrl, body) {
  const route = createRoutes(deps).find((r) => r.path === pathUrl.split('?')[0]);
  const { req, res, result } = mockReqRes(method, pathUrl, body);
  await route.handler(req, res);
  return result();
}

test('GET /api/errors：回当天条目与现有日志文件', async () => {
  const { deps, calls } = depsWith();
  const out = await call(deps, 'GET', '/dsh-hotspot/api/errors');
  assert.equal(out.status, 200);
  assert.equal(out.json().value.date, '2026-11-05');
  assert.equal(out.json().value.entries.length, 1);
  assert.deepEqual(out.json().value.files, ['2026-11-05']);
  assert.deepEqual(calls[0], ['read', { date: undefined, limit: 100 }]);
});

test('GET /api/errors?date=：按日期读', async () => {
  const { deps, calls } = depsWith();
  await call(deps, 'GET', '/dsh-hotspot/api/errors?date=2026-11-04&limit=5');
  assert.deepEqual(calls[0], ['read', { date: '2026-11-04', limit: 5 }]);
});

test('清空日志：不带日期清全部，带日期只清那一天', async () => {
  const { deps, calls } = depsWith();
  const all = await call(deps, 'POST', '/dsh-hotspot/api/errors', {});
  assert.equal(all.json().ok, true);
  assert.deepEqual(calls[0], ['clear', {}]);
  assert.match(all.json().message, /已清理 2 个/);

  await call(deps, 'POST', '/dsh-hotspot/api/errors', { date: '2026-11-04' });
  assert.deepEqual(calls[1], ['clear', { date: '2026-11-04' }]);

  // DELETE 也支持（curl -X DELETE 顺手）
  await call(deps, 'DELETE', '/dsh-hotspot/api/errors');
  assert.deepEqual(calls[2], ['clear', {}]);
});

test('宿主没注入日志能力时，接口回空数据而不是 500', async () => {
  const out = await call(
    {
      projectRoot: '/tmp/blog',
      store: { loadDigest: async () => null },
      target: { listDrafts: async () => [], profile: async () => ({ tagVocabulary: [], keywords: [], articles: [] }) },
      runScan: async () => ({ digest: null, status: {} }),
    },
    'GET',
    '/dsh-hotspot/api/errors',
  );
  assert.equal(out.status, 200);
  assert.deepEqual(out.json().value.entries, []);
});
