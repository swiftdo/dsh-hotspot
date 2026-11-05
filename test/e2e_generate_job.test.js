import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';

import { createRoutes } from '../src/server/api.js';
import { createJobRunner } from '../src/server/jobs.js';
import { createWriter } from '../src/server/generate.js';
import { checkDraft } from '../src/core/checks.js';
import { createVitePressTarget } from '../src/adapters/target-vitepress.js';

/**
 * 一键成稿的整条链：scaffold{generate:true} → 后台任务 → 真 writer（假 llm）→
 * 真 VitePress target 落盘 → 真闸门。这是「生成草稿流程通不通」的回归位。
 */

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
    if (body) req.emit('data', Buffer.from(JSON.stringify(body)));
    req.emit('end');
  });
  return { req, res, result: () => ({ status, json: () => JSON.parse(raw || '{}') }) };
}

async function settle(jobs, slug, timeoutMs = 3000) {
  const started = Date.now();
  for (;;) {
    if (!jobs.runningFor(slug)) return jobs.list({ slug })[0];
    if (Date.now() - started > timeoutMs) throw new Error('任务没有在预期时间内结束');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const CANDIDATE = {
  id: 'h-20261105-03',
  title: 'Swift 6.2 released',
  slugHint: 'swift-6-2',
  url: 'https://swift.org/blog/swift-6-2',
  summary: 'Swift 6.2 发布，构建提速。',
  tags: ['swift'],
  sources: [{ source: 'swift-org', title: 'Swift 6.2', url: 'https://swift.org/blog/swift-6-2' }],
};

const fakeLlm = {
  async listProviders() { return [{ provider: 'deepseek', name: 'DeepSeek' }]; },
  async listModels() { return [{ id: 'chat', name: 'Chat' }]; },
  async *stream(options) {
    // 正文里的「6.2」必须能在素材里找到，否则闸门会拦
    assert.match(options.messages[0].content[0].text, /构建提速/);
    yield { type: 'chunk', chunk: { type: 'text-delta', text: '# 草稿\n\nSwift 6.2 发布，构建提速。' } };
  },
};

test('一键成稿：建草稿后后台真写一次正文并跑闸门', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hotspot-e2e-'));
  const target = createVitePressTarget({ root });
  const digest = { date: '2026-11-05', generatedAt: '2026-11-05T00:00:00Z', items: [CANDIDATE] };
  const store = {
    async loadDigest(date) { return date === 'latest' ? digest : null; },
    async loadRecent() { return [digest]; },
    async loadRaw() { return [{ url: CANDIDATE.url, content: 'Swift 6.2 发布，构建提速 20%。' }]; },
  };
  const jobs = createJobRunner();
  const deps = {
    projectRoot: root,
    store,
    target,
    jobs,
    generate: createWriter({ getLlm: () => fakeLlm, digestDir: '.hotspot' }),
    checkDraft: async (opts) => checkDraft({ ...opts, allowedHosts: ['swift.org'] }),
    runScan: async () => ({ digest, status: {} }),
  };

  try {
    const scaffold = createRoutes(deps).find((r) => r.path === '/dsh-hotspot/api/scaffold');
    const { req, res, result } = mockReqRes('POST', '/dsh-hotspot/api/scaffold', {
      id: '#1',
      slug: 'swift-6-2',
      title: 'Swift 6.2 发布',
      generate: true,
    });
    await scaffold.handler(req, res);
    const started = result().json();
    assert.equal(started.ok, true, JSON.stringify(started));
    assert.equal(started.job.state, 'running');

    const done = await settle(jobs, 'swift-6-2');
    assert.equal(done.state, 'done', done.error || '任务应当成功');
    assert.equal(done.result.mode, 'direct');
    assert.ok(done.result.bodyChars > 0);
    assert.equal(done.result.checks.ok, true, JSON.stringify(done.result.checks));

    const text = readFileSync(path.join(root, '.drafts', 'swift-6-2', 'index.md'), 'utf8');
    assert.match(text, /title: Swift 6.2 发布/, '标题来自弹窗输入');
    assert.match(text, /Swift 6\.2 发布，构建提速/, '正文真的落盘了');
    assert.doesNotMatch(text, /（正文待写）/);
    assert.doesNotMatch(text, /sitemap: false/, '草稿在站点目录外，不需要这个字段');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
