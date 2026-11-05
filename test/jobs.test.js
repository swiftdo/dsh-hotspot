import test from 'node:test';
import assert from 'node:assert/strict';

import { createJobRunner } from '../src/server/jobs.js';
import { writeSteps } from '../src/server/write-steps.js';

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

test('取消：正在跑的任务标为 cancelled，signal 真的 abort', async () => {
  let seenSignal = null;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const runner = createJobRunner();
  runner.start({
    slug: 'demo',
    run: async ({ signal }) => {
      seenSignal = signal;
      await gate;
      return { file: 'x' };
    },
  });

  // run 是通过微任务起的，先让出一次事件循环，确保 signal 已经交到任务体手里
  await new Promise((resolve) => setTimeout(resolve, 0));

  const cancelling = runner.cancel({ slug: 'demo' });
  assert.equal(cancelling.slug, 'demo');
  assert.equal(seenSignal.aborted, true, 'signal 要真的 abort');

  release({ file: 'docs/draft/demo/index.md' });
  const settled = await settle(runner, 'demo');
  assert.equal(settled.state, 'cancelled');
  assert.equal(settled.message, '已取消（若已写盘则保留）');
});

test('取消：任务体抛错时也记为已取消，不报失败', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const runner = createJobRunner();
  runner.start({
    slug: 'demo',
    run: async () => {
      await gate;
      throw new Error('aborted');
    },
  });
  runner.cancel({ slug: 'demo' });
  release();
  const settled = await settle(runner, 'demo');
  assert.equal(settled.state, 'cancelled');
  assert.equal(settled.error, '', '用户主动取消不该显示成失败原因');
});

test('取消：没有正在跑的任务时返回 null（已结束的不再取消）', async () => {
  const runner = createJobRunner();
  assert.equal(runner.cancel({ slug: 'nope' }), null);
  runner.start({ slug: 'done-job', run: async () => ({}) });
  await settle(runner, 'done-job');
  assert.equal(runner.cancel({ slug: 'done-job' }), null);
  assert.equal(runner.cancel({}), null);
});

// ── 六步链路（生成草稿的进度面板靠它） ──

test('步骤模板：预置 done 的步保持 done，其余从 pending 起', () => {
  const runner = createJobRunner();
  const job = runner.start({
    slug: 'demo',
    steps: writeSteps({ scaffoldDetail: '.drafts/demo/index.md', now: new Date('2026-11-05T10:00:00Z') }),
    run: async () => ({}),
  });

  assert.deepEqual(
    job.steps.map((step) => [step.key, step.state]),
    [
      ['scaffold', 'done'],
      ['resolve', 'pending'],
      ['brief', 'pending'],
      ['route', 'pending'],
      ['write', 'pending'],
      ['persist', 'pending'],
    ],
  );
  assert.equal(job.steps[0].detail, '.drafts/demo/index.md');
  assert.equal(job.steps[0].label, '建草稿');
});

test('步骤推进：上一步收尾成 done，当前步 active，每切一步落一次盘', async () => {
  const saved = [];
  const runner = createJobRunner({ persist: async (job) => saved.push(job) });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });

  runner.start({
    slug: 'demo',
    steps: writeSteps({ scaffoldDetail: 'a.md' }),
    run: async ({ step }) => {
      step('resolve', '候选 h-20261105-01');
      step('brief', '3 篇原文');
      await gate;
      return {};
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  const mid = runner.runningFor('demo');
  assert.deepEqual(
    mid.steps.map((step) => step.state),
    ['done', 'done', 'active', 'pending', 'pending', 'pending'],
  );
  assert.equal(mid.steps[1].detail, '候选 h-20261105-01');
  assert.ok(mid.steps[1].startedAt, 'active 步要记开始时间，面板才算得出耗时');
  assert.ok(saved.length >= 3, '开始 + 两次切步，至少三次落盘');

  release();
  const done = await settle(runner, 'demo');
  assert.equal(done.state, 'done');
  // 没跑到的步骤不能被写成「跑完了」
  assert.deepEqual(
    done.steps.map((step) => step.state),
    ['done', 'done', 'done', 'pending', 'pending', 'pending'],
  );
});

test('步骤失败：当前步标 failed 并带上错误，后面的保持 pending', async () => {
  const runner = createJobRunner();
  runner.start({
    slug: 'demo',
    steps: writeSteps(),
    run: async ({ step }) => {
      step('resolve');
      step('brief');
      throw new Error('模型超时');
    },
  });

  const failed = await settle(runner, 'demo');
  assert.equal(failed.state, 'failed');
  const brief = failed.steps.find((step) => step.key === 'brief');
  assert.equal(brief.state, 'failed');
  assert.equal(brief.detail, '模型超时');
  assert.ok(brief.endedAt);
  assert.equal(failed.steps.find((step) => step.key === 'write').state, 'pending');
});

test('步骤取消：正在做的那一步标 cancelled', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const runner = createJobRunner();
  runner.start({
    slug: 'demo',
    steps: writeSteps(),
    run: async ({ step }) => {
      step('resolve');
      await gate;
      return {};
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  runner.cancel({ slug: 'demo' });
  release();

  const settled = await settle(runner, 'demo');
  assert.equal(settled.state, 'cancelled');
  assert.equal(settled.steps.find((step) => step.key === 'resolve').state, 'cancelled');
  assert.equal(settled.steps.find((step) => step.key === 'brief').state, 'pending');
});

test('步骤推进：任务已结束后再打点不会改状态', async () => {
  const runner = createJobRunner();
  let late;
  runner.start({
    slug: 'demo',
    steps: writeSteps(),
    run: async ({ step }) => {
      late = step;
      return {};
    },
  });
  await settle(runner, 'demo');
  late('write', '迟到的打点');
  const after = runner.list({ slug: 'demo' })[0];
  assert.equal(after.steps.find((step) => step.key === 'write').state, 'pending');
});
