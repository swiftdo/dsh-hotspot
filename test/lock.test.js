import test from 'node:test';
import assert from 'node:assert/strict';

import { createSingleFlight } from '../src/core/lock.js';

function deferred() {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  return { gate, release };
}

test('同一件事同时只跑一次，第二次直接拒绝', async () => {
  const { gate, release } = deferred();
  const run = createSingleFlight(async () => {
    await gate;
    return 'done';
  });

  const first = run();
  await assert.rejects(() => run(), (error) => {
    assert.equal(error.code, 'ERR_BUSY');
    return /上一次还没跑完/.test(error.message);
  });

  release();
  assert.equal(await first, 'done');
  // 结束后可以再跑
  assert.equal(await run(), 'done');
});

test('抛错也会释放占用，不会把入口永久锁死', async () => {
  let attempts = 0;
  const run = createSingleFlight(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('boom');
    return attempts;
  });

  await assert.rejects(() => run(), /boom/);
  assert.equal(await run(), 2);
});

test('参数原样透传，自定义错误码与文案生效', async () => {
  const seen = [];
  const run = createSingleFlight(async (...args) => {
    seen.push(args);
    return args.length;
  }, { message: '已有一次抓取在跑', code: 'ERR_SCAN_BUSY' });

  assert.equal(await run(15, 'x'), 2);
  assert.deepEqual(seen, [[15, 'x']]);

  const { gate, release } = deferred();
  const slow = createSingleFlight(async () => gate, { message: '已有一次抓取在跑', code: 'ERR_SCAN_BUSY' });
  const pending = slow();
  await assert.rejects(() => slow(), (error) => error.code === 'ERR_SCAN_BUSY');
  release();
  await pending;
});
