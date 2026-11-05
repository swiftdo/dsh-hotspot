import test from 'node:test';
import assert from 'node:assert/strict';

import { pickDirs, projectDirsFrom } from '../src/core/project-config.js';

test('projectDirsFrom：顶层键与 target.* 都认，空白当没写', () => {
  assert.deepEqual(projectDirsFrom({ articleDir: 'docs/article', draftDir: '.drafts' }), {
    articleDir: 'docs/article',
    draftDir: '.drafts',
    digestDir: '',
  });
  assert.deepEqual(projectDirsFrom({ target: { articleDir: 'posts', draftDir: 'posts/_draft' } }), {
    articleDir: 'posts',
    draftDir: 'posts/_draft',
    digestDir: '',
  });
  assert.deepEqual(projectDirsFrom({ articleDir: '  ', draftDir: '' }), {
    articleDir: '',
    draftDir: '',
    digestDir: '',
  });
  assert.deepEqual(projectDirsFrom(null), { articleDir: '', draftDir: '', digestDir: '' });
});

test('pickDirs：面板 > 博客仓库配置 > 默认', () => {
  const merged = pickDirs({
    panel: { draftDir: 'panel-drafts' },
    project: { articleDir: 'docs/article', draftDir: '.drafts' },
    fallback: { articleDir: 'docs', draftDir: '.drafts' },
  });
  assert.equal(merged.draftDir, 'panel-drafts', '面板保存的值优先');
  assert.equal(merged.articleDir, 'docs/article', '面板没给就用仓库配置');
});

test('pickDirs：两边都没写时用默认值，空串表示交给适配器', () => {
  assert.deepEqual(pickDirs({ panel: {}, project: {}, fallback: { articleDir: 'docs', draftDir: '.drafts' } }), {
    articleDir: 'docs',
    draftDir: '.drafts',
    digestDir: '',
  });
  assert.equal(pickDirs({}).draftDir, '', '没默认值时不要自己猜目录');
});

test('pickDirs：仓库配置里只写了 target.* 也能生效（CLI 写的键）', () => {
  const merged = pickDirs({ panel: {}, project: { target: { draftDir: 'notes/draft' } } });
  assert.equal(merged.draftDir, 'notes/draft');
});
