import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILTIN_IDS,
  BUILTIN_SOURCES,
  builtinSources,
  configuredSources,
  customSources,
  deriveSourceId,
  disabledBuiltinIds,
  isBuiltinDuplicate,
  resolveSources,
} from '../src/core/sources.js';

test('sources：内置源默认全开，与自定义源叠加（内置在前）', () => {
  const config = { sources: [{ id: 'mine', kind: 'rss', url: 'https://example.com/feed.xml' }] };
  const { sources, builtinCount, customCount } = resolveSources(config);

  assert.deepEqual(
    sources.map((s) => s.id),
    [...BUILTIN_SOURCES.map((s) => s.id), 'mine'],
  );
  assert.equal(builtinCount, BUILTIN_SOURCES.length);
  assert.equal(customCount, 1);
});

test('sources：没有任何自定义源时，生效的仍是全部内置源', () => {
  for (const config of [{}, { sources: [] }, { sources: null }, { sources: [null, {}, { id: '' }] }]) {
    const { sources, customCount } = resolveSources(config);
    assert.equal(customCount, 0);
    assert.deepEqual(sources.map((s) => s.id), BUILTIN_SOURCES.map((s) => s.id));
  }
});

test('sources：关掉的内置源不再生效，但仍在清单里（可再开）', () => {
  const config = { disabledBuiltins: ['ifanr', 'geekpark'] };
  const { sources, disabledBuiltins } = resolveSources(config);
  const ids = sources.map((s) => s.id);
  assert.ok(!ids.includes('ifanr'));
  assert.ok(!ids.includes('geekpark'));
  assert.ok(ids.includes('appinn'));
  assert.deepEqual(disabledBuiltins.sort(), ['geekpark', 'ifanr']);
  // 内置清单本身不删条目：面板要能把它再打开
  assert.equal(builtinSources(config).length, BUILTIN_SOURCES.length - 2);
});

test('sources：disabledBuiltins 写坏了当没关（默认全开比默认全关安全）', () => {
  for (const config of [{ disabledBuiltins: 'ifanr' }, { disabledBuiltins: [42, null, 'nope'] }]) {
    assert.equal(disabledBuiltinIds(config).size, 0);
    assert.equal(resolveSources(config).sources.length, BUILTIN_SOURCES.length);
  }
});

test('sources：内置源只带抓取必需字段，不带面板描述文案', () => {
  const { sources } = resolveSources({});
  for (const source of sources) {
    assert.deepEqual(Object.keys(source).sort(), ['id', 'kind', 'name', 'url']);
  }
});

test('sources：configuredSources 丢掉坏条目但保留好条目', () => {
  const config = {
    sources: [
      null,
      { kind: 'rss' },
      { id: 42 },
      { id: 'ok', kind: 'rss', url: 'https://example.com/a.xml' },
    ],
  };
  assert.deepEqual(configuredSources(config).map((s) => s.id), ['ok']);
});

test('sources：不修改传入的配置对象', () => {
  const config = { sources: [{ id: 'mine', kind: 'rss', url: 'https://example.com/feed.xml' }], disabledBuiltins: ['ifanr'] };
  const snapshot = JSON.stringify(config);
  resolveSources(config);
  assert.equal(JSON.stringify(config), snapshot);
});

test('sources：内置源 id 唯一，且都在 BUILTIN_IDS 里', () => {
  const ids = BUILTIN_SOURCES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.ok(BUILTIN_IDS.has(id));
});

// ── id 自动推导 ──────────────────────────────────────────────

test('deriveSourceId：从域名推导，跳过 feed/rss 这类通道路径', () => {
  assert.equal(deriveSourceId({ kind: 'rss', url: 'https://www.ifanr.com/feed' }, []), 'ifanr-2');
  assert.equal(deriveSourceId({ kind: 'rss', url: 'https://www.appinn.com/feed/' }, []), 'appinn-2');
  assert.equal(deriveSourceId({ kind: 'rss', url: 'http://www.geekpark.net/rss' }, []), 'geekpark-2');
  assert.equal(deriveSourceId({ kind: 'rss', url: 'https://36kr.com/feed' }, []), '36kr');
});

test('deriveSourceId：镜像站靠路径段区分（同域名不同栏目）', () => {
  assert.equal(deriveSourceId({ kind: 'rss', url: 'https://plink.anyfeeder.com/people' }, []), 'anyfeeder-people');
  assert.equal(deriveSourceId({ kind: 'rss', url: 'https://plink.anyfeeder.com/ifanr' }, []), 'anyfeeder-ifanr');
});

test('deriveSourceId：GitHub Release 用 owner-repo，Hacker News 用 hn', () => {
  assert.equal(deriveSourceId({ kind: 'github-release', repo: 'apple/swift' }, []), 'apple-swift');
  assert.equal(deriveSourceId({ kind: 'hn' }, []), 'hn');
});

test('deriveSourceId：撞上已占用的 id 自动加后缀，不覆盖别人的来源标注', () => {
  assert.equal(deriveSourceId({ kind: 'rss', url: 'https://example.com/feed.xml' }, ['example']), 'example-2');
  assert.equal(deriveSourceId({ kind: 'rss', url: 'https://example.com/feed.xml' }, ['example', 'example-2']), 'example-3');
  // 内置源 id 也算占用
  assert.equal(deriveSourceId({ kind: 'rss', url: 'https://www.ifanr.com/blog' }, []), 'ifanr-blog');
});

test('deriveSourceId：推导不出来时退回 source，不抛错', () => {
  assert.equal(deriveSourceId({ kind: 'rss', url: '不是 URL' }, []), 'source');
  assert.equal(deriveSourceId({}, []), 'source');
});

// ── 内置源的「手工复制」要能被认出来 ──────────────────────────

test('isBuiltinDuplicate：同 id 同地址算复制，同 id 不同地址不算', () => {
  const builtin = BUILTIN_SOURCES.find((source) => source.id === 'ifanr');
  assert.equal(isBuiltinDuplicate({ id: 'ifanr', kind: 'rss', url: builtin.url }), true);
  assert.equal(isBuiltinDuplicate({ id: 'ifanr', kind: 'rss', url: `${builtin.url}/` }), true, '末尾斜杠不算区别');
  assert.equal(isBuiltinDuplicate({ id: 'ifanr', kind: 'rss', url: 'https://other.example/feed' }), false);
  assert.equal(isBuiltinDuplicate({ id: 'mine', kind: 'rss', url: builtin.url }), false);
  assert.equal(isBuiltinDuplicate(null), false);
});

test('resolveSources：配置里留着内置源的手工复制时，只生效一份（内置的那份）', () => {
  const config = {
    sources: [
      { id: 'ifanr', kind: 'rss', url: 'https://www.ifanr.com/feed' },
      { id: 'mine', kind: 'rss', url: 'https://example.com/feed.xml' },
    ],
  };
  const { sources, customCount } = resolveSources(config);
  const ids = sources.map((s) => s.id);
  assert.equal(ids.filter((id) => id === 'ifanr').length, 1, 'ifanr 只能出现一次');
  assert.equal(customCount, 1, '复制不算自定义源');
  assert.ok(ids.includes('mine'));
  assert.deepEqual(customSources(config).map((s) => s.id), ['mine']);
});
