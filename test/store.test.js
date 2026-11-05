import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
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
