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
  const route = routes.find((r) => r.path === '/dsh-hotspot/api/title-suggest');
  assert.ok(route, '/dsh-hotspot/api/title-suggest 应存在');
  const { req, res, result } = mockReqRes('POST', '/dsh-hotspot/api/title-suggest', body);
  await route.handler(req, res);
  const out = result();
  return { status: out.status, ...out.json() };
}

const SUGGESTIONS = {
  suggestions: [
    { title: 'Swift 6.2 把严格并发变成了默认值', slug: 'swift-6-2-strict-concurrency', clickbait: false },
    { title: '数据竞争被挡在编译期', slug: 'data-race-compile-time', clickbait: false },
  ],
  sourceTitle: 'Third',
  provider: 'deepseek',
  model: 'chat',
};

test('起标题：把候选与当天 digest 一起交给 deps.suggestTitles', async () => {
  const seen = [];
  const routes = routesWith({
    suggestTitles: async (opts) => {
      seen.push(opts);
      return SUGGESTIONS;
    },
  });

  const out = await callSuggest(routes, { id: 'h-20261105-03' });
  assert.equal(out.status, 200);
  assert.equal(out.ok, true);
  assert.equal(out.value.suggestions.length, 2);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].item.id, 'h-20261105-03');
  // 起标题要读当天 raw 里的一手原文，digest 必须一起传下去
  assert.equal(seen[0].digest.date, '2026-11-05');
  assert.equal(seen[0].projectRoot, '/tmp/blog');
});

test('起标题：候选按尾号定位，与 /api/scaffold 用同一套解析', async () => {
  const seen = [];
  const routes = routesWith({
    suggestTitles: async (opts) => {
      seen.push(opts);
      return SUGGESTIONS;
    },
  });

  const out = await callSuggest(routes, { id: '#03' });
  assert.equal(out.ok, true);
  assert.equal(seen[0].item.id, 'h-20261105-03');
});

test('起标题：候选不存在回 404，不静默挑一条', async () => {
  const routes = routesWith({ suggestTitles: async () => SUGGESTIONS });
  const out = await callSuggest(routes, { id: 'h-20261105-99' });
  assert.equal(out.status, 404);
  assert.equal(out.ok, false);
  assert.equal(out.code, 'ERR_CANDIDATE_NOT_FOUND');
});

test('起标题：还没有 digest 时回 400', async () => {
  const routes = routesWith({ suggestTitles: async () => SUGGESTIONS }, { digest: null });
  const out = await callSuggest(routes, { id: 'h-20261105-01' });
  assert.equal(out.status, 400);
  assert.equal(out.code, 'ERR_NO_DIGEST');
});

test('起标题：宿主没接 llm 时回 501，面板据此回退原文标题', async () => {
  const routes = routesWith({});
  const out = await callSuggest(routes, { id: 'h-20261105-01' });
  assert.equal(out.status, 501);
  assert.equal(out.code, 'ERR_NO_TITLE_SUGGESTER');
});

test('起标题：模型失败时回 500 并把原因透出来', async () => {
  const routes = routesWith({
    suggestTitles: async () => {
      const error = new Error('模型没有给出可用的标题');
      error.code = 'ERR_TITLE_SUGGEST';
      throw error;
    },
  });
  const out = await callSuggest(routes, { id: 'h-20261105-01' });
  assert.equal(out.status, 500);
  assert.equal(out.code, 'ERR_TITLE_SUGGEST');
  assert.match(out.message, /没有给出可用的标题/);
});
