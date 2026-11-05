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

function depsWith(pickDirectory) {
  return {
    projectRoot: '/tmp/blog',
    store: { loadDigest: async () => null },
    target: { listDrafts: async () => [], profile: async () => ({ tagVocabulary: [], keywords: [], articles: [] }) },
    runScan: async () => ({ digest: null, status: {} }),
    pickDirectory,
  };
}

async function pick(deps) {
  const route = createRoutes(deps).find((r) => r.path === '/dsh-hotspot/api/pick-dir');
  const { req, res, result } = mockReqRes('POST', '/dsh-hotspot/api/pick-dir');
  await route.handler(req, res);
  return result();
}

test('选目录成功：回 path 与 OK', async () => {
  const out = await pick(depsWith(async () => '/Users/me/blog'));
  assert.equal(out.status, 200);
  assert.equal(out.json().path, '/Users/me/blog');
  assert.equal(out.json().code, 'OK');
});

test('用户取消：path 为 null 且 code=CANCELLED，面板不该弹错误', async () => {
  const out = await pick(depsWith(async () => null));
  assert.equal(out.json().path, null);
  assert.equal(out.json().code, 'CANCELLED');
  assert.equal(out.json().message, '');
});

test('原生选择器不可用时，接口把原因带回去（不再静默成「点了没反应」）', async () => {
  // 直接测 pickNativeDirectory 的返回形状：无图形环境时不该只有 null
  const { pickNativeDirectory } = await import('../src/server/api.js');
  const outcome = await pickNativeDirectory();
  assert.ok(['OK', 'CANCELLED', 'NO_PICKER', 'PICKER_FAILED'].includes(outcome.code), `未知 code: ${outcome.code}`);
  if (outcome.code !== 'OK') {
    assert.equal(outcome.path, null);
    assert.equal(typeof outcome.message, 'string');
  }
});
