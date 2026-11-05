import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createFsStore } from '../src/adapters/store-fs.js';
import { createMemoryStore } from '../src/adapters/store-memory.js';

test('loadDigest：还没抓过时返回 null，不是抛 ENOENT', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'hotspot-store-'));
  const store = createFsStore({ dir });
  assert.equal(await store.loadDigest('latest'), null);
  assert.equal(await store.loadDigest('2026-11-05'), null);
});

test('loadDigest：坏 JSON 仍然抛，不吞成「没有候选」', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'hotspot-store-'));
  const digestDir = path.join(dir, 'digest');
  mkdirSync(digestDir, { recursive: true });
  writeFileSync(path.join(digestDir, 'latest.json'), '{ 坏掉的 json', 'utf8');
  const store = createFsStore({ dir });
  await assert.rejects(() => store.loadDigest('latest'), /JSON/);
});

test('内存 store：digest 与 raw 在进程内可读，latest 跟着最后一次保存走', async () => {
  const store = createMemoryStore();
  assert.equal(await store.loadDigest('latest'), null);

  await store.saveRaw('2026-11-05', [{ url: 'https://a.com/x', content: 'v1.2.3' }]);
  await store.saveDigest({ date: '2026-11-05', items: [{ id: 'h-20261105-01' }] });
  await store.saveDigest({ date: '2026-11-06', items: [{ id: 'h-20261106-01' }] });

  assert.equal((await store.loadDigest('latest')).date, '2026-11-06');
  assert.equal((await store.loadDigest('2026-11-05')).items[0].id, 'h-20261105-01');
  assert.equal((await store.loadRaw('2026-11-05'))[0].content, 'v1.2.3');
  assert.deepEqual((await store.loadRecent(1)).map((d) => d.date), ['2026-11-06']);
  assert.equal(store.persistent, false);
});

test('prune：只删过期日期文件，latest / state / 其它子目录不动', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'hotspot-store-'));
  const digestDir = path.join(dir, 'digest');
  const rawDir = path.join(dir, 'raw');
  mkdirSync(digestDir, { recursive: true });
  mkdirSync(rawDir, { recursive: true });
  mkdirSync(path.join(dir, 'writer'), { recursive: true });

  writeFileSync(path.join(digestDir, '2026-09-01.json'), '{}');
  writeFileSync(path.join(digestDir, '2026-09-01.md'), '# old');
  writeFileSync(path.join(digestDir, '2026-11-04.json'), '{}');
  writeFileSync(path.join(digestDir, 'latest.json'), '{}');
  writeFileSync(path.join(digestDir, 'latest.md'), '# latest');
  writeFileSync(path.join(rawDir, '2026-09-01.json'), '[]');
  writeFileSync(path.join(rawDir, '2026-11-04.json'), '[]');
  writeFileSync(path.join(dir, 'writer', 'demo.json'), '{}');

  const store = createFsStore({ dir });
  const removed = await store.prune({ keepDays: 30, now: new Date('2026-11-05T00:00:00Z') });

  assert.equal(removed.length, 3, '旧的 digest json/md 与 raw json 各一个');
  assert.equal(existsSync(path.join(digestDir, '2026-09-01.json')), false);
  assert.equal(existsSync(path.join(rawDir, '2026-09-01.json')), false);
  assert.equal(existsSync(path.join(digestDir, '2026-11-04.json')), true, '30 天内的保留');
  assert.equal(existsSync(path.join(digestDir, 'latest.json')), true, 'latest 不是历史，不能删');
  assert.equal(existsSync(path.join(dir, 'writer', 'demo.json')), true, 'writer 产物不在清理范围');
});

test('prune：keepDays 非法时什么都不删', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'hotspot-store-'));
  const digestDir = path.join(dir, 'digest');
  mkdirSync(digestDir, { recursive: true });
  writeFileSync(path.join(digestDir, '2020-01-01.json'), '{}');
  const store = createFsStore({ dir });

  assert.deepEqual(await store.prune({ keepDays: 0 }), []);
  assert.deepEqual(await store.prune({ keepDays: -5 }), []);
  assert.equal(existsSync(path.join(digestDir, '2020-01-01.json')), true);
});
