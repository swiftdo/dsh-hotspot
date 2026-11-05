import test from 'node:test';
import assert from 'node:assert/strict';

import { createJobRunner } from '../src/server/jobs.js';

/** 等到某个 slug 的任务不再是 running。 */
async function settle(runner, slug, timeoutMs = 2000) {
  const started = Date.now();
  for (;;) {
    const running = runner.runningFor(slug);
    if (!running) return runner.list({ slug })[0];
    if (Date.now() - started > timeoutMs) throw new Error('任务没有在预期时间内结束');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test('起任务立刻返回 running，跑完后变 done 并保留结果', async () => {
  const saved = [];
  const runner = createJobRunner({ persist: async (job) => saved.push(job) });

  const job = runner.start({
    slug: 'demo',
    run: async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { file: 'docs/draft/demo/index.md', bodyChars: 1200 };
    },
  });
  assert.equal(job.state, 'running');
  assert.equal(job.slug, 'demo');

  const done = await settle(runner, 'demo');
  assert.equal(done.state, 'done');
  assert.equal(done.result.bodyChars, 1200);
  assert.ok(done.endedAt, '结束时间要记下来');
  assert.equal(saved.length, 2, '开始与结束各落一次盘');
  assert.equal(saved[0].state, 'running');
  assert.equal(saved[1].state, 'done');
});

test('同一个 slug 同时只能跑一个任务', async () => {
  const runner = createJobRunner();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  runner.start({ slug: 'demo', run: () => gate });

  assert.throws(() => runner.start({ slug: 'demo', run: async () => ({}) }), /还有一个任务在跑/);
  assert.equal(runner.runningFor('demo').state, 'running');

  release({ ok: true });
  await settle(runner, 'demo');
  // 结束后可以再起一个
  const again = runner.start({ slug: 'demo', run: async () => ({ ok: true }) });
  assert.equal(again.state, 'running');
  await settle(runner, 'demo');
});

test('任务体抛错时记为 failed 并保留原因，状态落盘失败不影响任务', async () => {
  const runner = createJobRunner({
    persist: async () => {
      throw new Error('disk full');
    },
  });
  runner.start({
    slug: 'bad',
    run: async () => {
      throw new Error('子代理没有交出可用产物');
    },
  });

  const failed = await settle(runner, 'bad');
  assert.equal(failed.state, 'failed');
  assert.match(failed.error, /没有交出可用产物/);
  assert.equal(failed.message, '正文失败，可重试');
});

test('list 支持按 slug 过滤并按时间倒序', async () => {
  const runner = createJobRunner();
  runner.start({ slug: 'a', run: async () => ({}) });
  runner.start({ slug: 'b', run: async () => ({}) });
  await settle(runner, 'a');
  await settle(runner, 'b');

  assert.equal(runner.list().length, 2);
  assert.deepEqual(runner.list({ slug: 'a' }).map((job) => job.slug), ['a']);
  assert.ok(runner.get(runner.list()[0].id), 'get 能按 id 取回快照');
  assert.equal(runner.get('nope'), null);
});

test('缺 slug 或任务体时直接拒绝', () => {
  const runner = createJobRunner();
  assert.throws(() => runner.start({ slug: '', run: async () => ({}) }), /缺少 slug/);
  assert.throws(() => runner.start({ slug: 'x' }), /缺少任务体/);
});
