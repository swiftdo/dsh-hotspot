import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * 插件壳的契约测试。
 *
 * 这里不 import src/plugin.js：它依赖宿主的 @deepseek-ai/dsh-tools，本仓库不装
 * （package.json 里是 optional peer）。所以按源码断言契约 —— 与 client.js 的
 * 那份测试同一套思路：能挡住「改着改着工具没了 / 闸门绕过了」这类回归。
 */
const source = readFileSync('src/plugin.js', 'utf8');

test('注册 7 个工具：写作闭环在会话里能走完', () => {
  for (const name of [
    'hotspot_run',
    'hotspot_get',
    'hotspot_scaffold',
    'hotspot_supplement',
    'hotspot_check',
    'hotspot_promote',
    'hotspot_write',
  ]) {
    assert.ok(source.includes(`name: '${name}'`), `缺少工具 ${name}`);
  }
});

test('转正走闸门，不直接调 target.promote', () => {
  assert.ok(source.includes('promoteChecked('), 'hotspot_promote 必须过闸');
  assert.ok(!source.includes('target.promote('), '插件里不该出现绕过闸门的 target.promote(');
});

test('候选解析统一走 core/candidates.js', () => {
  assert.ok(source.includes("from './core/candidates.js'"));
  assert.ok(source.includes('pickCandidate('));
  assert.ok(!source.includes('endsWith(key)'), '就地解析会把 #3 匹配到 h-…-13');
});

test('未绑定根目录时用进程内 store，不往 cwd 写 .hotspot', () => {
  assert.ok(source.includes('createMemoryStore'));
  assert.ok(source.includes('activeStore()'));
  assert.ok(source.includes('persisted'));
});

test('limit 优先级：参数 > rank.limit > 插件配置', () => {
  const index = source.indexOf('limit:');
  assert.ok(index > 0);
  const line = source.slice(index, index + 120);
  assert.ok(
    line.includes('limitOverride ?? projectConfig.rank?.limit ?? config.limit'),
    `limit 解析顺序被改回去了：${line.split('\n')[0]}`,
  );
});

test('带 projectRoot 的工具用运行时目录，而不是启动时的配置', () => {
  assert.ok(source.includes('createVitePressTarget({ root: pr, articleDir, draftDir })'));
  assert.ok(!source.includes("articleDir: config.articleDir || 'docs'"));
});
