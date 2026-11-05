import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';

import { createRoutes } from '../src/server/api.js';
import { createVitePressTarget } from '../src/adapters/target-vitepress.js';

function mockReqRes(method, pathUrl, body) {
  const req = new EventEmitter();
  req.method = method;
  req.url = pathUrl;
  req.headers = { host: '127.0.0.1:63259', origin: 'http://127.0.0.1:63259' };
  req.socket = { remoteAddress: '127.0.0.1' };

  let raw = '';
  let status = 200;
  const res = {
    writeHead(code) {
      status = code;
    },
    end(chunk) {
      if (chunk) raw += chunk;
    },
  };
  process.nextTick(() => {
    if (body) req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  });
  return { req, res, result: () => ({ status, json: () => JSON.parse(raw || '{}') }) };
}

/** 真 target + 临时仓库：草稿在默认的 .drafts/，文章在 docs/article/。 */
function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'hotspot-guard-'));
  mkdirSync(path.join(root, 'docs/article/hello'), { recursive: true });
  mkdirSync(path.join(root, '.drafts/hello'), { recursive: true });
  mkdirSync(path.join(root, 'docs/mydrafts'), { recursive: true });
  writeFileSync(path.join(root, 'docs/article/hello/index.md'), '---\ntitle: Hello\ndate: 2026-11-05\n---\n\n已发布正文\n');
  writeFileSync(path.join(root, '.drafts/hello/index.md'), '---\ntitle: Hello\n---\n\n草稿正文\n');
  writeFileSync(path.join(root, 'docs/mydrafts/x.md'), '# 不在草稿目录里\n');

  const target = createVitePressTarget({ root });
  const deps = {
    projectRoot: root,
    store: { loadDigest: async () => null, loadRaw: async () => [] },
    target,
    runScan: async () => ({ digest: null, status: {} }),
  };
  return { root, target, deps, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

async function post(deps, routePath, body) {
  const route = createRoutes(deps).find((r) => r.path === routePath);
  const { req, res, result } = mockReqRes('POST', routePath, body);
  await route.handler(req, res);
  return result();
}

test('草稿目录按配置判断：.drafts/ 可改，docs/mydrafts 与已发布文章都被拦', async () => {
  const { root, cleanup } = setup();
  try {
    const ok = await post(
      { ...setupDeps(root) },
      '/dsh-hotspot/api/article',
      { file: '.drafts/hello/index.md', content: '---\ntitle: Hello\n---\n\n改过的草稿\n' },
    );
    assert.equal(ok.status, 200);
    assert.equal(ok.json().ok, true);

    const misleading = await post(
      { ...setupDeps(root) },
      '/dsh-hotspot/api/article',
      { file: 'docs/mydrafts/x.md', content: '# 改' },
    );
    assert.equal(misleading.status, 403, '目录名里带 draft 不等于就是草稿目录');
    assert.equal(misleading.json().code, 'ERR_ARTICLE_PROTECTED');

    const published = await post(
      { ...setupDeps(root) },
      '/dsh-hotspot/api/article',
      { file: 'docs/article/hello/index.md', content: '# 改已发布' },
    );
    assert.equal(published.status, 403);
  } finally {
    cleanup();
  }
});

test('删除草稿同样按配置判断，删已发布文章被拦', async () => {
  const { root, cleanup } = setup();
  try {
    const draft = await post({ ...setupDeps(root) }, '/dsh-hotspot/api/article-delete', { file: '.drafts/hello/index.md' });
    assert.equal(draft.status, 200);
    assert.equal(existsSync(path.join(root, '.drafts/hello/index.md')), false);

    const published = await post(
      { ...setupDeps(root) },
      '/dsh-hotspot/api/article-delete',
      { file: 'docs/article/hello/index.md' },
    );
    assert.equal(published.status, 403);
    assert.equal(existsSync(path.join(root, 'docs/article/hello/index.md')), true, '已发布文章不能被删');
  } finally {
    cleanup();
  }
});

/** 每次请求都新建 deps，避免上一个用例改过的 target 状态带进来。 */
function setupDeps(root) {
  const target = createVitePressTarget({ root });
  return {
    projectRoot: root,
    store: { loadDigest: async () => null, loadRaw: async () => [] },
    target,
    runScan: async () => ({ digest: null, status: {} }),
  };
}
