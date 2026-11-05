import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createErrorLog } from '../src/server/errors.js';

function setup({ now = new Date('2026-11-05T10:00:00Z'), keepDays = 1 } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hotspot-errors-'));
  const log = createErrorLog({ dir, keepDays, now: () => now });
  return { dir, log, cleanup: () => {} };
}

test('记一条错误：落到当天文件，字段齐全', async () => {
  const { dir, log } = setup();
  const error = new Error('模型没有返回正文');
  error.code = 'EMPTY_BODY';

  const entry = await log.record({ source: 'writer', error, slug: 'demo' });
  assert.equal(entry.source, 'writer');
  assert.equal(entry.code, 'EMPTY_BODY');
  assert.equal(entry.message, '模型没有返回正文');
  assert.equal(entry.slug, 'demo');
  assert.ok(existsSync(path.join(dir, 'errors', '2026-11-05.jsonl')));

  const list = await log.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].message, '模型没有返回正文');
});

test('默认只保留当天：写新日志时把旧文件删掉', async () => {
  const { dir, log } = setup();
  mkdirSync(path.join(dir, 'errors'), { recursive: true });
  writeFileSync(path.join(dir, 'errors', '2026-11-01.jsonl'), '{"message":"旧"}\n');

  await log.record({ source: 'scan', message: '新错误' });
  assert.equal(existsSync(path.join(dir, 'errors', '2026-11-01.jsonl')), false, '旧日志应被清理');
  assert.equal((await log.files()).length, 1);
});

test('keepDays 可调：留 3 天时前天的文件还在', async () => {
  const { dir, log } = setup({ keepDays: 3 });
  mkdirSync(path.join(dir, 'errors'), { recursive: true });
  writeFileSync(path.join(dir, 'errors', '2026-11-03.jsonl'), '{}\n');
  writeFileSync(path.join(dir, 'errors', '2026-11-01.jsonl'), '{}\n');

  await log.record({ source: 'scan', message: 'x' });
  assert.equal(existsSync(path.join(dir, 'errors', '2026-11-03.jsonl')), true, '3 号在保留期内');
  assert.equal(existsSync(path.join(dir, 'errors', '2026-11-01.jsonl')), false, '1 号超期');
});

test('list 最新在前，limit 生效，坏行跳过', async () => {
  const { dir, log } = setup();
  mkdirSync(path.join(dir, 'errors'), { recursive: true });
  writeFileSync(
    path.join(dir, 'errors', '2026-11-05.jsonl'),
    ['{"at":"a","message":"第一条"}', '这不是 JSON', '{"at":"b","message":"第二条"}', ''].join('\n'),
  );

  const list = await log.list({ limit: 5 });
  assert.deepEqual(list.map((e) => e.message), ['第二条', '第一条']);
  assert.equal((await log.list({ limit: 1 })).length, 1);
  assert.deepEqual(await log.list({ date: '2026-01-01' }), []);
});

test('clear：默认清全部，指定日期只清那一天', async () => {
  const { dir, log } = setup();
  mkdirSync(path.join(dir, 'errors'), { recursive: true });
  writeFileSync(path.join(dir, 'errors', '2026-11-05.jsonl'), '{}\n');
  writeFileSync(path.join(dir, 'errors', '2026-11-04.jsonl'), '{}\n');

  assert.equal(await log.clear({ date: '2026-11-04' }), 1);
  assert.deepEqual(await log.files(), ['2026-11-05']);

  assert.equal(await log.clear(), 1);
  assert.deepEqual(await log.files(), []);
  assert.equal(await log.clear(), 0, '没有文件时清空是空操作，不报错');
});

test('字符串错误与缺省来源也能记，写盘失败不抛', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'hotspot-errors-'));
  const log = createErrorLog({ dir });
  const entry = await log.record({ error: '磁盘满了' });
  assert.equal(entry.source, 'plugin');
  assert.equal(entry.message, '磁盘满了');

  // dir 指向一个不可能创建的位置：record 仍返回条目，不抛
  const broken = createErrorLog({ dir: '/dev/null/nope', log: () => {} });
  const stillThere = await broken.record({ source: 'x', message: 'y' });
  assert.equal(stillThere.message, 'y');
});

test('recordSync：进程马上就要退出时也能落盘（CLI fail 用）', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'hotspot-errors-'));
  const log = createErrorLog({ dir, now: () => new Date('2026-11-05T10:00:00Z') });

  const entry = log.recordSync({ source: 'cli:scaffold', message: '还没有 digest' });
  assert.equal(entry.source, 'cli:scaffold');
  assert.ok(existsSync(path.join(dir, 'errors', '2026-11-05.jsonl')));
  assert.equal((await log.list()).length, 1);
});

test('recordSync 也会按 keepDays 清理旧文件', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'hotspot-errors-'));
  mkdirSync(path.join(dir, 'errors'), { recursive: true });
  writeFileSync(path.join(dir, 'errors', '2026-10-01.jsonl'), '{}\n');
  const log = createErrorLog({ dir, now: () => new Date('2026-11-05T10:00:00Z') });
  log.recordSync({ source: 'cli', message: 'x' });
  assert.equal(existsSync(path.join(dir, 'errors', '2026-10-01.jsonl')), false);
});
