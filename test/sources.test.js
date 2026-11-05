import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_SOURCES, configuredSources, resolveSources } from '../src/core/sources.js';

test('sources：配置里有源时以配置为准', () => {
  const config = { sources: [{ id: 'mine', kind: 'rss', url: 'https://example.com/feed.xml' }] };
  const { sources, mode } = resolveSources(config);
  assert.equal(mode, 'config');
  assert.deepEqual(sources.map((s) => s.id), ['mine']);
});

test('sources：配置里没有 sources / 空数组 / 坏条目时回落到内置默认源', () => {
  for (const config of [{}, { sources: [] }, { sources: null }, { sources: [null, {}, { id: '' }] }]) {
    const { sources, mode } = resolveSources(config);
    assert.equal(mode, 'builtin', `config=${JSON.stringify(config)} 应回落到内置源`);
    assert.deepEqual(sources.map((s) => s.id), BUILTIN_SOURCES.map((s) => s.id));
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
  // 有好条目时就不该回落到内置源，否则会偷偷多抓一个源。
  assert.equal(resolveSources(config).mode, 'config');
});

test('sources：不修改传入的配置对象', () => {
  const config = { sources: [{ id: 'mine', kind: 'rss', url: 'https://example.com/feed.xml' }] };
  const snapshot = JSON.stringify(config);
  resolveSources(config);
  assert.equal(JSON.stringify(config), snapshot);
});
