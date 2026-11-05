import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
    },
  };

  process.nextTick(() => {
    if (body) req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
    req.emit('end');
  });

  return { req, res, result: () => ({ status: statusCode, json: () => JSON.parse(responseBody || '{}') }) };
}

const CHINESE_ONLY = {
  id: 'h-20261105-01',
  title: '苹果发布新芯片',
  slugHint: '',
  url: 'https://example.com/a',
  summary: '摘要',
  tags: [],
  sources: [],
};

const WITH_HINT = { ...CHINESE_ONLY, title: 'Swift 6.2 released', slugHint: 'swift-6-2' };

function makeDeps({ candidate = CHINESE_ONLY, scaffolded = [] } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'hotspot-api-scaffold-'));
  const deps = {
    projectRoot: root,
    store: {
      async loadDigest() {
        return { date: '2026-11-05', items: [candidate] };
      },
      async loadRaw() {
        return [];
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
      async exists() {
        return { exists: false };
      },
      async scaffold(item, opts) {
        scaffolded.push(opts);
        return { file: `docs/draft/${opts.slug}/index.md`, slug: opts.slug, bodyWritten: false };
      },
    },
    runScan: async () => ({ digest: null, status: {} }),
  };
  return { deps, root, scaffolded, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

async function callScaffold(deps, body) {
  const route = createRoutes(deps).find((r) => r.path === '/dsh-hotspot/api/scaffold');
  const { req, res, result } = mockReqRes('POST', '/dsh-hotspot/api/scaffold', body);
  await route.handler(req, res);
  return result();
}

test('纯中文标题推导不出 slug：回 400 ERR_SLUG_REQUIRED，并带回标题供面板预填', async () => {
  const { deps, scaffolded, cleanup } = makeDeps();
  try {
    const out = await callScaffold(deps, { id: '#1' });
    assert.equal(out.status, 400);
    assert.equal(out.json().code, 'ERR_SLUG_REQUIRED');
    assert.equal(out.json().value.title, '苹果发布新芯片');
    assert.equal(scaffolded.length, 0, '不该先建半截草稿再报错');
  } finally {
    cleanup();
  }
});

test('传了 slug 就能建：title / description 透传给 scaffold', async () => {
  const { deps, scaffolded, cleanup } = makeDeps();
  try {
    const out = await callScaffold(deps, {
      id: '#1',
      slug: 'apple-chip',
      title: '苹果这颗新芯片到底强在哪',
      description: '一次偏架构的解读。',
    });
    assert.equal(out.status, 200);
    assert.equal(out.json().ok, true);
    assert.equal(out.json().value.slug, 'apple-chip');
    assert.deepEqual(scaffolded[0], {
      draft: true,
      slug: 'apple-chip',
      title: '苹果这颗新芯片到底强在哪',
      description: '一次偏架构的解读。',
    });
  } finally {
    cleanup();
  }
});

test('slugHint 能推导时不需要面板再传', async () => {
  const { deps, scaffolded, cleanup } = makeDeps({ candidate: WITH_HINT });
  try {
    const out = await callScaffold(deps, { id: '#1' });
    assert.equal(out.status, 200);
    assert.equal(scaffolded[0].slug, 'swift-6-2');
    assert.equal(scaffolded[0].title, undefined, '没传标题就不该覆盖候选标题');
  } finally {
    cleanup();
  }
});

test('slug 不合法或标题为空时回 400，不写草稿', async () => {
  const { deps, scaffolded, cleanup } = makeDeps({ candidate: WITH_HINT });
  try {
    const bad = await callScaffold(deps, { id: '#1', slug: '中文目录' });
    assert.equal(bad.status, 400);
    assert.equal(bad.json().code, 'ERR_SLUG_INVALID');

    const emptyTitle = await callScaffold(deps, { id: '#1', slug: 'ok-slug', title: '   ' });
    assert.equal(emptyTitle.status, 400);
    assert.equal(emptyTitle.json().code, 'ERR_TITLE_EMPTY');

    assert.equal(scaffolded.length, 0);
  } finally {
    cleanup();
  }
});
