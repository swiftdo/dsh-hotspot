import test from 'node:test';
import assert from 'node:assert/strict';

import { createDeployTracker } from '../src/server/deploy.js';

test('还没部署过时快照为 null', () => {
  const tracker = createDeployTracker();
  assert.equal(tracker.snapshot(), null);
  assert.equal(tracker.running, false);
});

test('begin：进入 running，步骤表一开始是空的', () => {
  const tracker = createDeployTracker({ now: () => new Date('2026-11-05T10:00:00Z') });
  const snap = tracker.begin({ cwd: '/tmp/blog', plan: { build: 'pnpm run build', script: './deploy.sh' } });

  assert.equal(snap.state, 'running');
  assert.equal(snap.cwd, '/tmp/blog');
  assert.deepEqual(snap.plan, { build: 'pnpm run build', script: './deploy.sh' });
  assert.deepEqual(snap.steps, []);
  assert.equal(tracker.running, true);
});

test('step + chunk：步骤状态推进，块内 stdout/stderr 按到达顺序混排', () => {
  const tracker = createDeployTracker();
  tracker.begin({ cwd: '/tmp/blog', plan: { script: './deploy.sh' } });

  tracker.step({ name: 'deploy', script: './deploy.sh', state: 'running' });
  tracker.chunk({ step: 'deploy', stream: 'stdout', text: 'first\n' });
  tracker.chunk({ step: 'deploy', stream: 'stderr', text: 'warning: x\n' });
  tracker.chunk({ step: 'deploy', stream: 'stdout', text: 'second\n' });

  const running = tracker.snapshot();
  assert.equal(running.steps.length, 1);
  assert.equal(running.steps[0].name, 'deploy');
  assert.equal(running.steps[0].state, 'running');
  assert.equal(running.steps[0].script, './deploy.sh');
  assert.equal(running.steps[0].output, 'first\nwarning: x\nsecond\n');

  tracker.step({ name: 'deploy', state: 'success', code: 0, durationMs: 1234, timedOut: false });
  const done = tracker.snapshot();
  assert.equal(done.steps[0].state, 'success');
  assert.equal(done.steps[0].code, 0);
  assert.equal(done.steps[0].durationMs, 1234);
  assert.ok(done.steps[0].endedAt, '结束时间要记下来，面板才算得出耗时');
});

test('两步：build 与 deploy 各自一块，输出不串味', () => {
  const tracker = createDeployTracker();
  tracker.begin({ cwd: '/tmp/blog', plan: { build: 'pnpm run build', script: './deploy.sh' } });

  tracker.step({ name: 'build', script: 'pnpm run build', state: 'running' });
  tracker.chunk({ step: 'build', text: 'building...\n' });
  tracker.step({ name: 'build', state: 'success', code: 0, durationMs: 100 });
  tracker.step({ name: 'deploy', script: './deploy.sh', state: 'running' });
  tracker.chunk({ step: 'deploy', text: 'uploading...\n' });

  const snap = tracker.snapshot();
  assert.deepEqual(snap.steps.map((s) => s.name), ['build', 'deploy']);
  assert.equal(snap.steps[0].output, 'building...\n');
  assert.equal(snap.steps[1].output, 'uploading...\n');
});

test('输出超上限：只留末尾并标 truncated', () => {
  const tracker = createDeployTracker({ limit: 20 });
  tracker.begin({ cwd: '/tmp/blog', plan: { script: 'x' } });
  tracker.step({ name: 'deploy', script: 'x', state: 'running' });
  tracker.chunk({ step: 'deploy', text: 'a'.repeat(30) });

  const snap = tracker.snapshot();
  assert.equal(snap.truncated, true);
  assert.ok(snap.steps[0].output.includes('已保留末尾'));
  assert.ok(snap.steps[0].output.endsWith('a'.repeat(20)), '要留末尾而不是开头');
});

test('finish：状态收尾、快照保留，之后 begin 开新的一次', () => {
  const tracker = createDeployTracker();
  tracker.begin({ cwd: '/tmp/blog', plan: { script: 'x' } });
  tracker.step({ name: 'deploy', script: 'x', state: 'running' });
  tracker.chunk({ step: 'deploy', text: 'boom\n' });
  tracker.finish({ success: false });

  assert.equal(tracker.running, false);
  const last = tracker.snapshot();
  assert.equal(last.state, 'failed');
  assert.ok(last.endedAt);
  assert.equal(last.steps[0].output, 'boom\n');

  const next = tracker.begin({ cwd: '/tmp/blog', plan: { script: 'y' } });
  assert.equal(next.state, 'running');
  assert.deepEqual(next.steps, [], '新的一次从空步骤表开始');
});

test('chunk / step 在没有进行中的部署时是安全的空操作', () => {
  const tracker = createDeployTracker();
  assert.equal(tracker.chunk({ step: 'deploy', text: 'x' }), null);
  assert.equal(tracker.step({ name: 'deploy', state: 'running' }), null);
  assert.equal(tracker.finish({ success: true }), null);
});
