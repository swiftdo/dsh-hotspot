import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { createRoutes } from '../src/server/api.js';

function mockReqRes(method, pathUrl) {
  const req = new EventEmitter();
  req.method = method;
  req.url = pathUrl;
  req.headers = { host: '127.0.0.1:63259', origin: 'http://127.0.0.1:63259' };
  req.socket = { remoteAddress: '127.0.0.1' };
  let raw = '';
  let status = 200;
  const res = { writeHead(code) { status = code; }, end(chunk) { if (chunk) raw += chunk; } };
  process.nextTick(() => req.emit('end'));
  return { req, res, result: () => ({ status, json: () => JSON.parse(raw || '{}') }) };
}

function depsWith(runScan) {
  return {
    projectRoot: '/tmp/blog',
    store: { loadDigest: async () => null, loadRaw: async () => [] },
    target: { profile: async () => ({ tagVocabulary: [], keywords: [], articles: [] }), listDrafts: async () => [] },
    runScan,
  };
}

test('并发抓取被单飞挡下时，/api/run 回 409 而不是 500', async () => {
  const busy = new Error('已有一次抓取在跑，等它结束再试');
  busy.code = 'ERR_SCAN_BUSY';
  const route = createRoutes(depsWith(async () => { throw busy; })).find((r) => r.path === '/dsh-hotspot/api/run');
  const { req, res, result } = mockReqRes('POST', '/dsh-hotspot/api/run');
  await route.handler(req, res);

  assert.equal(result().status, 409);
  assert.equal(result().json().code, 'ERR_SCAN_BUSY');
});

test('正常抓取仍然回 200 与候选摘要', async () => {
  const route = createRoutes(depsWith(async () => ({
    digest: { date: '2026-11-05', generatedAt: '2026-11-05T00:00:00Z', items: [{ id: 'h-20261105-01', title: 'T', score: 4 }] },
    status: { feedsOk: 1, feedsTotal: 1 },
  }))).find((r) => r.path === '/dsh-hotspot/api/run');
  const { req, res, result } = mockReqRes('POST', '/dsh-hotspot/api/run');
  await route.handler(req, res);

  assert.equal(result().status, 200);
  assert.equal(result().json().value.items.length, 1);
});
