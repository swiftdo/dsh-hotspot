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

const DIGEST = {
  date: '2026-11-05',
  items: [
    { id: 'h-20261105-01', title: 'First', url: 'https://example.com/1', summary: '第一条' },
    { id: 'h-20261105-03', title: 'Third', url: 'https://example.com/3', summary: '第三条' },
  ],
};

const TARGET = { articleDir: 'docs/article', draftDir: '.drafts' };

function routesWith(extra, { digest = DIGEST } = {}) {
  return createRoutes({
    projectRoot: '/tmp/blog',
    store: { loadDigest: async () => digest, loadRaw: async () => [] },
    target: TARGET,
    runScan: async () => ({ digest, status: {} }),
    ...extra,
  });
}

async function callSuggest(routes, body) {
  const route = routes.find((r) => r.path === '/dsh-hotspot/api/description-suggest');
  assert.ok(route, '/dsh-hotspot/api/description-suggest 应存在');
  const { req, res, result } = mockReqRes('POST', '/dsh-hotspot/api/description-suggest', body);
  await route.handler(req, res);
  const out = result();
  return { status: out.status, ...out.json() };
}

const VALUE = {
  description: 'Swift 6.2 把严格并发设成默认值，编译器开始替你拦数据竞争。升级前先看清这几条规则，能省掉一轮排查。',
  chars: 55,
  title: 'Swift 6.2 把严格并发变成了默认值',
  provider: 'deepseek',
  model: 'chat',
};

test('写简介：定稿标题与候选、当天 digest 一起交给 deps.suggestDescription', async () => {
  const seen = [];
  const routes = routesWith({
    suggestDescription: async (opts) => {
      seen.push(opts);
      return VALUE;
    },
  });

  const out = await callSuggest(routes, { id: 'h-20261105-03', title: 'Swift 6.2 把严格并发变成了默认值' });
  assert.equal(out.status, 200);
  assert.equal(out.ok, true);
  assert.equal(out.value.chars, 55);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].title, 'Swift 6.2 把严格并发变成了默认值');
  assert.equal(seen[0].item.id, 'h-20261105-03');
  assert.equal(seen[0].digest.date, '2026-11-05');
});

test('写简介：标题为空直接 400，不去猜主题', async () => {
  let called = false;
  const routes = routesWith({
    suggestDescription: async () => {
      called = true;
      return VALUE;
    },
  });
  const out = await callSuggest(routes, { id: 'h-20261105-01', title: '   ' });
  assert.equal(out.status, 400);
  assert.equal(out.code, 'ERR_TITLE_REQUIRED');
  assert.equal(called, false);
});

test('写简介：宿主没接 llm 时回 501，面板据此回退候选摘要', async () => {
  const routes = routesWith({});
  const out = await callSuggest(routes, { id: 'h-20261105-01', title: '标题' });
  assert.equal(out.status, 501);
  assert.equal(out.code, 'ERR_NO_DESCRIPTION_SUGGESTER');
});

test('写简介：候选不存在回 404，不静默挑一条', async () => {
  const routes = routesWith({ suggestDescription: async () => VALUE });
  const out = await callSuggest(routes, { id: 'h-20261105-99', title: '标题' });
  assert.equal(out.status, 404);
  assert.equal(out.code, 'ERR_CANDIDATE_NOT_FOUND');
});

test('写简介：还没有 digest 时回 400', async () => {
  const routes = routesWith({ suggestDescription: async () => VALUE }, { digest: null });
  const out = await callSuggest(routes, { id: 'h-20261105-01', title: '标题' });
  assert.equal(out.status, 400);
  assert.equal(out.code, 'ERR_NO_DIGEST');
});

test('写简介：模型失败时回 500 并把原因透出来', async () => {
  const routes = routesWith({
    suggestDescription: async () => {
      const error = new Error('模型没有给出可用的简介（原始返回：空）');
      error.code = 'ERR_DESCRIPTION_SUGGEST';
      throw error;
    },
  });
  const out = await callSuggest(routes, { id: 'h-20261105-01', title: '标题' });
  assert.equal(out.status, 500);
  assert.equal(out.code, 'ERR_DESCRIPTION_SUGGEST');
  assert.match(out.message, /没有给出可用的简介/);
});
