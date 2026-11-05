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
const toolsSource = readFileSync('src/tools.js', 'utf8');

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
    assert.ok(toolsSource.includes(`name: '${name}'`), `缺少工具 ${name}`);
  }
});

test('转正走闸门，不直接调 target.promote', () => {
  assert.ok(toolsSource.includes('promoteChecked('), 'hotspot_promote 必须过闸');
  assert.ok(!toolsSource.includes('target.promote('), '工具里不该出现绕过闸门的 target.promote(');
});

test('候选解析统一走 core/candidates.js', () => {
  assert.ok(toolsSource.includes("from './core/candidates.js'"));
  assert.ok(toolsSource.includes('pickCandidate('));
  assert.ok(!toolsSource.includes('endsWith(key)'), '就地解析会把 #3 匹配到 h-…-13');
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

test('写正文不再走子代理：只保留一次 completion 的路径', () => {
  const generate = readFileSync('src/server/generate.js', 'utf8');
  assert.ok(!generate.includes('.startActivation('), '不该再调宿主的子代理');
  assert.ok(!generate.includes('getSubagents'), '不该再依赖 subagents 服务');
  assert.ok(!generate.includes('getAgents'), '不该再从 agents 注册表找父代理');
  assert.ok(generate.includes('llm.stream') || generate.includes('streamOnce('), '走一次 completion');
  assert.ok(source.includes('routes: {'), 'listModels/saveModels 仍要回两个用途解析后的路由');
  assert.ok(!readFileSync('src/plugin.js', 'utf8').includes('getSubagents'), '插件也不再注入子代理依赖');
});

test('面板契约：生成草稿带 generate:true 并轮询 /api/jobs', () => {
  const client = readFileSync('src/client.js', 'utf8');
  assert.ok(client.includes('generate: true'), '生成草稿要一次跑完');
  assert.ok(client.includes('/jobs?slug='), '写正文期间要轮询任务状态');
  assert.ok(client.includes('重试写正文'), '失败后要能从草稿箱重试');
  assert.ok(client.includes('模型与写作方式'), '设置页要有模型选择卡');
  assert.ok(client.includes('/models`'), '模型卡要用 /api/models 读写');
});

test('面板契约：生成草稿先确认标题与 slug，写作可取消', () => {
  const client = readFileSync('src/client.js', 'utf8');
  assert.ok(client.includes('suggestSlug'), '要有目录名推导与兜底（纯中文标题）');
  assert.ok(client.includes('目录名 slug（永久 URL'), '生成前要能确认目录名');
  assert.ok(client.includes('按标题推算'), '推导不出时能一键按标题重算');
  assert.ok(client.includes('/jobs/cancel'), '写作中要能取消');
  assert.ok(client.includes('取消写作'), '卡片上要有取消入口');
  assert.ok(client.includes('校验未过'), '写完但校验没过要留在卡片上');
  assert.ok(client.includes('正文待写'), '骨架草稿要能一眼看出来');
});

test('订阅源页：内置源 hero 已移除，清单改成行式', () => {
  const client = readFileSync('src/client.js', 'utf8');
  assert.ok(!client.includes('内置精选源'), 'hero 不再出现在页面上');
  assert.ok(!client.includes('hs-hero-banner'), 'hero 的样式与标记一起删掉');
  assert.ok(client.includes('hs-src-rows'), '清单用行式渲染');
  assert.ok(client.includes('⚡ 启用全部内置'), '批量启用入口还在（移到了清单卡头）');
  assert.ok(client.includes('hs-src-rss'), 'RSS 地址条保留');
});

test('设置页：tab 与页内标题统一叫「设置」，高级参数可折叠', () => {
  const client = readFileSync('src/client.js', 'utf8');
  assert.ok(client.includes("}, '设置')"), 'tab 文案应与页内标题一致');
  assert.ok(!client.includes("}, '策略与路径配置')"), '旧的 tab 文案不该再出现');
  assert.ok(client.includes('hs-cfg-jump'), '四组之间要有锚点跳转');
  assert.ok(client.includes('高级排序参数'), '很少改的两个参数默认收起');
  assert.ok(client.includes('showAdvancedRank'), '折叠状态要能记住');
});
