import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';

import { createRoutes } from '../src/server/api.js';
import { createJobRunner } from '../src/server/jobs.js';

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
    if (body) req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
    req.emit('end');
  });

  return {
    req,
    res,
    result: () => ({ status: statusCode, headers: resHeaders, json: () => JSON.parse(responseBody || '{}') }),
  };
}

const CANDIDATE = {
  id: 'h-20261105-01',
  title: 'Swift 6.2 released',
  slugHint: 'swift-6-2',
  url: 'https://swift.org/blog/swift-6-2',
  summary: 'Swift 6.2 发布。',
  tags: [],
  sources: [{ source: 'swift-org', title: 'Swift 6.2', url: 'https://swift.org/blog/swift-6-2' }],
};

async function settle(jobs, slug, timeoutMs = 2000) {
  const started = Date.now();
  for (;;) {
    if (!jobs.runningFor(slug)) return jobs.list({ slug })[0];
    if (Date.now() - started > timeoutMs) throw new Error('任务没有在预期时间内结束');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function makeDeps(overrides = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'hotspot-jobs-api-'));
  const generated = [];
  const jobs = createJobRunner();
  const deps = {
    projectRoot: root,
    store: {
      async loadDigest() {
        return { date: '2026-11-05', items: [CANDIDATE] };
      },
      async loadRaw() {
        return [{ url: CANDIDATE.url, content: 'Swift 6.2 发布' }];
      },
    },
    target: {
      articleDir: 'docs/article',
      draftDir: 'docs/draft',
      async profile() {
        return { tagVocabulary: [], keywords: [], articles: [] };
      },
      async listDrafts() {
        return [];
      },
      async siteUrls() {
        return new Set(['/']);
      },
      async readSupplements() {
        return { entries: [], invalid: [], candidate: null };
      },
      async exists() {
        return { exists: false };
      },
      async scaffold(item, opts) {
        return { file: `docs/draft/${opts.slug || 'swift-6-2'}/index.md`, slug: opts.slug || 'swift-6-2', bodyWritten: false };
      },
    },
    jobs,
    generate: async ({ slug }) => {
      generated.push(slug);
      return { slug, bodyChars: 42 };
    },
    checkDraft: async () => ({ result: { ok: true, violations: [] } }),
    runScan: async () => ({ digest: null, status: {} }),
    ...overrides,
  };
  return { deps, jobs, generated, root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('generate:true 建完草稿后在后台起任务，接口立刻返回 running', async () => {
  const { deps, jobs, generated, cleanup } = makeDeps();
  try {
    const routes = createRoutes(deps);
    const scaffold = routes.find((r) => r.path === '/dsh-hotspot/api/scaffold');
    const { req, res, result } = mockReqRes('POST', '/dsh-hotspot/api/scaffold', { id: '#1', generate: true });
    await scaffold.handler(req, res);

    const data = result().json();
    assert.equal(result().status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.job.state, 'running');
    assert.equal(data.job.slug, 'swift-6-2');

    const done = await settle(jobs, 'swift-6-2');
    assert.equal(done.state, 'done');
    assert.deepEqual(generated, ['swift-6-2']);
    assert.equal(done.result.bodyChars, 42);
    assert.deepEqual(done.result.checks, { ok: true, violations: [] });
  } finally {
    cleanup();
  }
});

test('不带 generate 时只建骨架，不起任务', async () => {
  const { deps, jobs, generated, cleanup } = makeDeps();
  try {
    const scaffold = createRoutes(deps).find((r) => r.path === '/dsh-hotspot/api/scaffold');
    const { req, res, result } = mockReqRes('POST', '/dsh-hotspot/api/scaffold', { id: '#1' });
    await scaffold.handler(req, res);

    const data = result().json();
    assert.equal(data.ok, true);
    assert.equal(data.job ?? null, null);
    assert.equal(jobs.size, 0);
    assert.deepEqual(generated, []);
  } finally {
    cleanup();
  }
});

test('GET /api/jobs 支持按 slug 过滤，state 里也带任务列表', async () => {
  const { deps, jobs, cleanup } = makeDeps();
  try {
    const routes = createRoutes(deps);
    const start = routes.find((r) => r.path === '/dsh-hotspot/api/jobs');
    const started = mockReqRes('POST', '/dsh-hotspot/api/jobs', { slug: 'swift-6-2' });
    await start.handler(started.req, started.res);
    assert.equal(started.result().json().ok, true);
    await settle(jobs, 'swift-6-2');

    const list = mockReqRes('GET', '/dsh-hotspot/api/jobs?slug=swift-6-2');
    await start.handler(list.req, list.res);
    const listed = list.result().json();
    assert.equal(listed.value.length, 1);
    assert.equal(listed.value[0].slug, 'swift-6-2');

    const state = routes.find((r) => r.path === '/dsh-hotspot/api/state');
    const stateRes = mockReqRes('GET', '/dsh-hotspot/api/state');
    await state.handler(stateRes.req, stateRes.res);
    assert.ok(Array.isArray(stateRes.result().json().value.jobs), 'state 要带 jobs');
  } finally {
    cleanup();
  }
});

test('同一篇正在写时再点重试回 409 ERR_JOB_BUSY', async () => {
  const { deps, jobs, cleanup } = makeDeps();
  try {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    deps.generate = async ({ slug }) => {
      await gate;
      return { slug, bodyChars: 1 };
    };

    const route = createRoutes(deps).find((r) => r.path === '/dsh-hotspot/api/jobs');
    const first = mockReqRes('POST', '/dsh-hotspot/api/jobs', { slug: 'swift-6-2' });
    await route.handler(first.req, first.res);
    assert.equal(first.result().json().ok, true);

    const second = mockReqRes('POST', '/dsh-hotspot/api/jobs', { slug: 'swift-6-2' });
    await route.handler(second.req, second.res);
    assert.equal(second.result().status, 409);
    assert.equal(second.result().json().code, 'ERR_JOB_BUSY');

    release();
    const done = await settle(jobs, 'swift-6-2');
    assert.equal(done.state, 'done');
  } finally {
    cleanup();
  }
});

test('没有接入写作子代理时，generate:true 仍保住草稿并说明原因', async () => {
  const { deps, cleanup } = makeDeps({ generate: undefined });
  try {
    const scaffold = createRoutes(deps).find((r) => r.path === '/dsh-hotspot/api/scaffold');
    const { req, res, result } = mockReqRes('POST', '/dsh-hotspot/api/scaffold', { id: '#1', generate: true });
    await scaffold.handler(req, res);

    const data = result().json();
    assert.equal(result().status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.job, null);
    assert.match(data.message, /正文待补/);
    assert.ok(data.value.file, '草稿路径要回给前端');
  } finally {
    cleanup();
  }
});
