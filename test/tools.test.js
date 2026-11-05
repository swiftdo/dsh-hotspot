import test from 'node:test';
import assert from 'node:assert/strict';

import { createHotspotTools } from '../src/tools.js';

/** 宿主的 defineTool 只是个恒等包装时，工具定义就能在测试里被检查。 */
const defineTool = (definition) => definition;

function makeTools(overrides = {}) {
  return createHotspotTools({
    defineTool,
    store: () => ({}),
    getTarget: () => ({ root: '/tmp/blog' }),
    resolveTarget: () => ({ target: { root: '/tmp/blog' } }),
    readProjectConfig: async () => ({}),
    runScan: async () => ({}),
    runCheck: async () => ({ ok: true, violations: [], report: {} }),
    ...overrides,
  });
}

test('七个工具：名字、必填字段、output 契约都在', () => {
  const tools = makeTools();
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      'hotspot_run',
      'hotspot_get',
      'hotspot_scaffold',
      'hotspot_supplement',
      'hotspot_check',
      'hotspot_promote',
      'hotspot_write',
    ],
  );

  for (const tool of tools) {
    assert.equal(typeof tool.description, 'string');
    assert.ok(tool.description.length > 10, `${tool.name} 要有能指导模型用法的描述`);
    assert.equal(typeof tool.execute, 'function');
    assert.equal(typeof tool.output?.render, 'function');
    assert.equal(tool.output.schema.type, 'object');
    // DSH 的 value schema DSL 不支持 required，写了会让整段注册静默失败
    assert.equal('required' in tool.output.schema, false, `${tool.name} 不该写 required`);
    assert.equal(tool.output.schema.additionalProperties, false, `${tool.name} 用 additionalProperties:false 收口`);
  }
});

test('render 必须返回 ContentBlock[]，不能是裸字符串', () => {
  const tools = makeTools();
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));

  const samples = {
    'hotspot_check': { message: '✓ 三道检查全过' },
    'hotspot_promote': { message: '✓ 已转正' },
    'hotspot_write': { message: '✓ 正文已写入' },
    'hotspot_supplement': { ok: true, url: 'https://a.com', count: 1, file: 'sources.json' },
    'hotspot_scaffold': { ok: false, message: '尚未配置博客项目根目录' },
    'hotspot_get': { text: 'h-20261105-01 标题' },
    'hotspot_run': { feedsOk: 1, feedsTotal: 1, itemsRaw: 1, itemsDeduped: 1, candidates: 1, markdown: '# 候选' },
  };

  for (const [name, value] of Object.entries(samples)) {
    const blocks = byName[name].output.render({}, value);
    assert.ok(Array.isArray(blocks), `${name}.render 必须返回数组`);
    assert.equal(blocks[0].type, 'text');
    assert.equal(typeof blocks[0].text, 'string');
  }
});

test('工具通过注入的解析器访问目标，而不是闭包里的快照', async () => {
  const seen = [];
  const target = { root: '/tmp/blog', draftDir: '/tmp/blog/docs/draft' };
  const tools = makeTools({
    resolveTarget: (projectRoot) => {
      seen.push(projectRoot);
      return { target };
    },
    readProjectConfig: async () => ({ publish: { allowedHosts: ['a.com'] } }),
    runCheck: async (resolvedTarget, slug) => {
      assert.equal(resolvedTarget, target);
      return {
        ok: false,
        violations: ['[number-not-in-source] 对不上'],
        report: { file: '/tmp/blog/docs/draft/demo/index.md', supplements: { entries: [] } },
      };
    },
  });
  const check = tools.find((tool) => tool.name === 'hotspot_check');
  const result = await check.execute({ slug: 'demo', projectRoot: '/tmp/blog' });
  assert.equal(result.ok, false);
  assert.deepEqual(seen, ['/tmp/blog']);
  assert.match(result.message, /校验未通过/);
});

test('hotspot_run 未绑定根目录时如实回报 persisted=false', async () => {
  const tools = makeTools({
    runScan: async () => ({
      digest: {
        date: '2026-11-05',
        items: [],
        status: { feedsOk: 0, feedsTotal: 0, itemsRaw: 0, itemsDeduped: 0, candidates: 0, degraded: false, failedSources: [] },
      },
      status: { feedsOk: 0, feedsTotal: 0, itemsRaw: 0, itemsDeduped: 0, candidates: 0, degraded: false, failedSources: [] },
      persisted: false,
    }),
  });
  const run = tools.find((tool) => tool.name === 'hotspot_run');
  const value = await run.execute({});
  assert.equal(value.persisted, false);
  assert.match(value.message, /未绑定博客根目录/);
});
