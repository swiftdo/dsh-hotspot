import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createRoutes } from '../src/server/api.js';

function mockReqRes(method, pathUrl, body = null, headers = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = pathUrl;
  req.headers = { host: '127.0.0.1:63259', origin: 'http://127.0.0.1:63259', ...headers };
  req.socket = { remoteAddress: '127.0.0.1' };

  let responseBody = '';
  let statusCode = 200;
  const resHeaders = {};

  const res = {
    writeHead(code, h = {}) {
      statusCode = code;
      Object.assign(resHeaders, h);
    },
    end(chunk) {
      if (chunk) responseBody += chunk;
      this.finished = true;
    },
    finished: false,
  };

  process.nextTick(() => {
    if (body) {
      req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
    }
    req.emit('end');
  });

  return {
    req,
    res,
    result: () => ({
      status: statusCode,
      headers: resHeaders,
      json: () => JSON.parse(responseBody || '{}'),
      text: () => responseBody,
    }),
  };
}

test('API 路由：支持获取与配置博客路径及参数', async (t) => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'hotspot-api-test-'));
  const customBlogDir = path.join(tempDir, 'my-blog');
  mkdirSync(customBlogDir, { recursive: true });

  t.after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  let updatedRuntimeConfig = null;
  const deps = {
    projectRoot: tempDir,
    store: {
      loadDigest: async () => null,
    },
    target: {
      articleDir: 'docs',
      draftDir: 'docs/draft',
      profile: async () => ({ tagVocabulary: ['swift', 'rust'], keywords: [{ term: 'compiler' }], articles: [] }),
      listDrafts: async () => [],
    },
    runScan: async () => ({ digest: { date: '2026-11-05', generatedAt: '2026-11-05T00:00:00Z', items: [] }, status: {} }),
    onConfigUpdated: async (cfg) => {
      updatedRuntimeConfig = cfg;
      return { projectRoot: cfg.projectRoot || tempDir };
    },
  };

  const routes = createRoutes(deps);
  const dshStateRoute = routes.find((r) => r.path === '/dsh-hotspot/api/state');
  const legacyStateRoute = routes.find((r) => r.path === '/hotspot/api/state');
  const dshConfigRoute = routes.find((r) => r.path === '/dsh-hotspot/api/config');
  const legacyConfigRoute = routes.find((r) => r.path === '/hotspot/api/config');

  assert.ok(dshStateRoute, '/dsh-hotspot/api/state 主路由应存在');
  assert.ok(legacyStateRoute, '/hotspot/api/state 兼容路由应存在');
  assert.ok(dshConfigRoute, '/dsh-hotspot/api/config 主路由应存在');
  assert.ok(legacyConfigRoute, '/hotspot/api/config 兼容路由应存在');

  const stateRoute = dshStateRoute;
  const configRoute = dshConfigRoute;

  // 1. 测试 GET state
  const { req: sReq, res: sRes, result: sResult } = mockReqRes('GET', '/hotspot/api/state');
  await stateRoute.handler(sReq, sRes);
  const sData = sResult().json();
  assert.equal(sResult().status, 200);
  assert.equal(sData.ok, true);
  assert.equal(sData.value.projectRoot, tempDir);
  assert.equal(sData.value.blog.articleDir, 'docs');
  assert.equal(sData.value.config.rank.limit, 15);
  assert.ok(Array.isArray(sData.value.builtinSources), 'builtinSources 应当是数组');
  assert.ok(
    sData.value.builtinSources.some((s) => s.id === 'sopilot-hottweets' && s.url === 'https://sopilot.net/rss/hottweets'),
    '应当包含内置源 sopilot-hottweets'
  );
  // 配置里一个源都没写：config.sources 如实为空，生效源由 sourcesMode/activeSources 表达。
  // 这两者必须是同一套判定，否则面板说有源、扫描说没源（曾经的报错来源）。
  assert.deepEqual(sData.value.config.sources, [], '配置文件里没有源时 config.sources 应为空');
  assert.equal(sData.value.sourcesMode, 'builtin');
  assert.ok(
    sData.value.activeSources.some((s) => s.id === 'sopilot-hottweets'),
    '未配置源时应回落到内置默认源 sopilot-hottweets'
  );

  // 2. 测试 POST config - 错误目录拦截
  const { req: errReq, res: errRes, result: errResult } = mockReqRes('POST', '/hotspot/api/config', {
    projectRoot: '/non/existent/path/for/sure/12345',
  });
  await configRoute.handler(errReq, errRes);
  assert.equal(errResult().status, 400);
  assert.ok(errResult().json().message.includes('指定博客根目录不存在'));

  // 3. 测试 POST config - 正常配置博客参数
  const { req: cReq, res: cRes, result: cResult } = mockReqRes('POST', '/hotspot/api/config', {
    projectRoot: customBlogDir,
    articleDir: 'posts',
    draftDir: 'posts/drafts',
    digestDir: '.my-hotspot',
    rank: {
      limit: 20,
      sinceHours: 48,
      halfLifeHours: 12,
      clusterThreshold: 0.7,
    },
    publish: {
      maxPerDay: 5,
      allowedHosts: ['https://apple.com/test', 'swift.org'],
    },
  });
  await configRoute.handler(cReq, cRes);
  const cData = cResult().json();
  assert.equal(cResult().status, 200);
  assert.equal(cData.ok, true);
  assert.equal(cData.value.projectRoot, customBlogDir);
  assert.equal(cData.value.articleDir, 'posts');
  assert.equal(cData.value.draftDir, 'posts/drafts');
  assert.equal(cData.value.digestDir, '.my-hotspot');
  assert.equal(cData.value.rank.limit, 20);
  assert.deepEqual(cData.value.publish.allowedHosts, ['apple.com', 'swift.org']);

  // 验证 onConfigUpdated 回调被正确触发
  assert.ok(updatedRuntimeConfig, 'onConfigUpdated 应被触发');
  assert.equal(updatedRuntimeConfig.projectRoot, customBlogDir);
  assert.equal(updatedRuntimeConfig.articleDir, 'posts');
});

test('未配置博客路径时拦截草稿落地，且提供 projectRoot 时可成功落地', async (t) => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'hotspot-scaffold-guard-test-'));
  const validBlogDir = path.join(tempDir, 'user-blog');
  mkdirSync(validBlogDir, { recursive: true });

  t.after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  let scaffoldCalledWith = null;
  const deps = {
    projectRoot: '', // 未配置博客根目录
    store: {
      loadDigest: async () => ({
        date: '2026-11-05',
        items: [{ id: 'h-20261105-01', title: 'Swift 6.2 Released', slugHint: 'swift-6-2' }]
      }),
    },
    target: {
      articleDir: 'docs',
      draftDir: 'docs/draft',
      exists: async () => ({ exists: false }),
      scaffold: async (candidate, opts) => {
        scaffoldCalledWith = { candidate, opts };
        return { file: `docs/draft/${opts.slug || 'test'}/index.md`, slug: opts.slug || 'test' };
      },
      profile: async () => ({ tagVocabulary: [], keywords: [], articles: [] }),
      listDrafts: async () => [],
    },
    runScan: async () => ({ digest: null, status: {} }),
    onConfigUpdated: async (cfg) => {
      deps.projectRoot = cfg.projectRoot;
      return { projectRoot: cfg.projectRoot, target: deps.target };
    },
  };

  const routes = createRoutes(deps);
  const scaffoldRoute = routes.find((r) => r.path === '/hotspot/api/scaffold');
  const stateRoute = routes.find((r) => r.path === '/hotspot/api/state');

  // 1. GET state 返回 configured: false
  const { req: sReq, res: sRes, result: sResult } = mockReqRes('GET', '/hotspot/api/state');
  await stateRoute.handler(sReq, sRes);
  assert.equal(sResult().json().value.configured, false);

  // 2. 未配置博客且请求未提供 projectRoot → 必须拦截
  const { req: noRootReq, res: noRootRes, result: noRootResult } = mockReqRes('POST', '/hotspot/api/scaffold', {
    id: 'h-20261105-01',
  });
  await scaffoldRoute.handler(noRootReq, noRootRes);
  assert.equal(noRootResult().status, 400);
  const noRootJson = noRootResult().json();
  assert.equal(noRootJson.ok, false);
  assert.equal(noRootJson.code, 'ERR_NO_BLOG_ROOT');

  // 3. 在生成草稿时提供 projectRoot → 校验成功并生成草稿，且更新 projectRoot
  const { req: withRootReq, res: withRootRes, result: withRootResult } = mockReqRes('POST', '/hotspot/api/scaffold', {
    id: 'h-20261105-01',
    projectRoot: validBlogDir,
  });
  await scaffoldRoute.handler(withRootReq, withRootRes);
  assert.equal(withRootResult().status, 200);
  const withRootJson = withRootResult().json();
  assert.equal(withRootJson.ok, true);
  assert.equal(deps.projectRoot, validBlogDir);
  assert.ok(scaffoldCalledWith, 'target.scaffold 应被调用');
  assert.equal(scaffoldCalledWith.candidate.id, 'h-20261105-01');
});

test('API 路由：支持文件夹选择器 pick-dir 路由与双前缀兼容', async () => {
  const customPickedPath = '/Users/tester/Documents/my-custom-blog';
  const deps = {
    pickDirectory: async () => customPickedPath,
  };
  const routes = createRoutes(deps);

  // 1. 验证主路由 /dsh-hotspot/api/pick-dir
  const pickMain = routes.find((r) => r.path === '/dsh-hotspot/api/pick-dir');
  assert.ok(pickMain, '应注册 /dsh-hotspot/api/pick-dir 路由');
  const { req: pReq, res: pRes, result: pResult } = mockReqRes('POST', '/dsh-hotspot/api/pick-dir');
  await pickMain.handler(pReq, pRes);
  const pJson = pResult().json();
  assert.equal(pJson.ok, true);
  assert.equal(pJson.path, customPickedPath);

  // 2. 验证兼容路由 /hotspot/api/pick-dir
  const pickLegacy = routes.find((r) => r.path === '/hotspot/api/pick-dir');
  assert.ok(pickLegacy, '应注册 /hotspot/api/pick-dir 兼容路由');
  const { req: lReq, res: lRes, result: lResult } = mockReqRes('POST', '/hotspot/api/pick-dir');
  await pickLegacy.handler(lReq, lRes);
  const lJson = lResult().json();
  assert.equal(lJson.ok, true);
  assert.equal(lJson.path, customPickedPath);

  // 3. 用户取消选择或返回 null 的情况
  const cancelDeps = {
    pickDirectory: async () => null,
  };
  const cancelRoutes = createRoutes(cancelDeps);
  const cancelRoute = cancelRoutes.find((r) => r.path === '/dsh-hotspot/api/pick-dir');
  const { req: cReq, res: cRes, result: cResult } = mockReqRes('POST', '/dsh-hotspot/api/pick-dir');
  await cancelRoute.handler(cReq, cRes);
  assert.equal(cResult().json().ok, true);
  assert.equal(cResult().json().path, null);
});

test('API 路由：管辖收敛至草稿箱，/dsh-hotspot/api/drafts 与 articles 均返回草稿，已发布博文受保护', async (t) => {
  const mockDrafts = [
    { slug: 'draft-1', title: '草稿1', date: '2026-11-05', tags: ['hotspot'] },
    { slug: 'draft-2', title: '草稿2', date: '2026-11-05', tags: ['ai'] },
  ];

  const deps = {
    projectRoot: '/mock/path',
    store: { loadDigest: async () => null },
    target: {
      articleDir: 'docs/article',
      draftDir: 'docs/draft',
      profile: async () => ({ tagVocabulary: ['hotspot'], keywords: [], articles: [] }),
      listDrafts: async () => mockDrafts,
      saveArticle: async (file, content) => {
        if (!file.includes('docs/draft/')) {
          const err = new Error('只能修改草稿');
          err.code = 'ERR_ARTICLE_PROTECTED';
          throw err;
        }
        return { file, bytes: content.length };
      },
      deleteArticle: async (file) => {
        if (!file.includes('docs/draft/')) {
          const err = new Error('只能删除草稿');
          err.code = 'ERR_ARTICLE_PROTECTED';
          throw err;
        }
        return { file, deleted: true };
      }
    },
    runScan: async () => ({ digest: null, status: {} }),
  };

  const routes = createRoutes(deps);
  const dshDraftsRoute = routes.find((r) => r.path === '/dsh-hotspot/api/drafts');
  const dshArticlesRoute = routes.find((r) => r.path === '/dsh-hotspot/api/articles');
  const legacyArticlesRoute = routes.find((r) => r.path === '/hotspot/api/articles');

  assert.ok(dshDraftsRoute, '/dsh-hotspot/api/drafts 路由应存在');
  assert.ok(dshArticlesRoute, '/dsh-hotspot/api/articles 主路由应存在');
  assert.ok(legacyArticlesRoute, '/hotspot/api/articles 兼容路由应存在');

  const { req, res, result } = mockReqRes('GET', '/dsh-hotspot/api/drafts');
  await dshDraftsRoute.handler(req, res);
  assert.equal(result().status, 200);
  const data = result().json();
  assert.equal(data.ok, true);
  assert.equal(data.value.length, 2);
  assert.equal(data.value[0].slug, 'draft-1');

  // 同时验证 state 中仅聚合 drafts
  const stateRoute = routes.find((r) => r.path === '/dsh-hotspot/api/state');
  const { req: sReq, res: sRes, result: sResult } = mockReqRes('GET', '/dsh-hotspot/api/state');
  await stateRoute.handler(sReq, sRes);
  const sData = sResult().json();
  assert.equal(sData.ok, true);
  assert.equal(sData.value.drafts.length, 2);
  assert.equal(sData.value.articles.length, 2);

  // 验证保存已发布博文被拦截保护
  const saveRoute = routes.find((r) => r.path === '/dsh-hotspot/api/article');
  const { req: pReq, res: pRes, result: pResult } = mockReqRes(
    'POST',
    '/dsh-hotspot/api/article',
    { file: 'docs/article/swift-6/index.md', content: 'new content' }
  );
  await saveRoute.handler(pReq, pRes);
  assert.equal(pResult().status, 403);
  const pJson = pResult().json();
  assert.equal(pJson.ok, false);
  assert.equal(pJson.code, 'ERR_ARTICLE_PROTECTED');
});

test('API 路由：支持在线读取、修改与转正发布文章 /dsh-hotspot/api/article[s]', async (t) => {
  let savedFile = null;
  let savedContent = null;
  let promotedSlug = null;

  const deps = {
    projectRoot: '/mock/path',
    store: { loadDigest: async () => null },
    target: {
      articleDir: 'docs/article',
      draftDir: 'docs/draft',
      profile: async () => ({ tagVocabulary: [], keywords: [] }),
      listArticles: async () => [],
      listDrafts: async () => [],
      readArticle: async (file) => {
        if (file === 'docs/draft/my-draft/index.md') {
          return '# 初始草稿标题\n\n草稿正文内容';
        }
        return null;
      },
      saveArticle: async (file, content) => {
        savedFile = file;
        savedContent = content;
        return { file, bytes: content.length };
      },
      promote: async (slug) => {
        promotedSlug = slug;
        return { slug, dest: `docs/article/${slug}/index.md` };
      }
    },
    // 转正走注入的闸门（实际实现是 core/promote.js）；这一段测的是路由接线
    promoteChecked: async ({ target, slug }) => ({
      ok: true,
      violations: [],
      promoted: await target.promote(slug),
    }),
    runScan: async () => ({ digest: null, status: {} })
  };

  const routes = createRoutes(deps);

  // 1. 测试 GET /dsh-hotspot/api/article 读取文件
  const getArticleRoute = routes.find((r) => r.path === '/dsh-hotspot/api/article');
  assert.ok(getArticleRoute, 'GET /dsh-hotspot/api/article 应当存在');

  const { req: gReq, res: gRes, result: gResult } = mockReqRes(
    'GET',
    '/dsh-hotspot/api/article?file=docs/draft/my-draft/index.md'
  );
  await getArticleRoute.handler(gReq, gRes);
  const gData = gResult().json();
  assert.equal(gData.ok, true);
  assert.equal(gData.value.content, '# 初始草稿标题\n\n草稿正文内容');

  // 2. 测试 POST /dsh-hotspot/api/article 保存修改
  const postArticleRoute = routes.find((r) => r.path === '/dsh-hotspot/api/article');
  assert.ok(postArticleRoute, 'POST /dsh-hotspot/api/article 应当存在');

  const { req: pReq, res: pRes, result: pResult } = mockReqRes(
    'POST',
    '/dsh-hotspot/api/article',
    { file: 'docs/draft/my-draft/index.md', content: '# 修订后的草稿标题\n\n更新后的内容' }
  );
  await postArticleRoute.handler(pReq, pRes);
  const pData = pResult().json();
  assert.equal(pData.ok, true);
  assert.equal(savedFile, 'docs/draft/my-draft/index.md');
  assert.equal(savedContent, '# 修订后的草稿标题\n\n更新后的内容');

  // 3. 测试 POST /dsh-hotspot/api/article-promote 草稿转正
  const promoteRoute = routes.find((r) => r.path === '/dsh-hotspot/api/article-promote');
  assert.ok(promoteRoute, 'POST /dsh-hotspot/api/article-promote 应当存在');

  const { req: prReq, res: prRes, result: prResult } = mockReqRes(
    'POST',
    '/dsh-hotspot/api/article-promote',
    { slug: 'my-draft' }
  );
  await promoteRoute.handler(prReq, prRes);
  const prData = prResult().json();
  assert.equal(prData.ok, true);
  assert.equal(promotedSlug, 'my-draft');
});

test('API 路由：读取文章时附带补料证据账本（不塞整页正文）', async () => {
  let askedSlug = null;
  const deps = {
    projectRoot: '/mock/path',
    store: { loadDigest: async () => null },
    target: {
      articleDir: 'docs/article',
      draftDir: 'docs/draft',
      profile: async () => ({ tagVocabulary: [], keywords: [] }),
      listArticles: async () => [],
      listDrafts: async () => [],
      readArticle: async (file) => ({ file, content: '# 正文\n\nSwift 6.1.2' }),
      readSupplements: async (slug) => {
        askedSlug = slug;
        return {
          file: `docs/draft/${slug}/sources.json`,
          entries: [
            {
              url: 'https://swift.org/blog/x',
              host: 'swift.org',
              title: 'Swift 博客',
              kind: 'official',
              fetchedAt: '2026-11-05T00:00:00.000Z',
              content: 'x'.repeat(200),
            },
          ],
        };
      },
    },
    runScan: async () => ({ digest: null, status: {} }),
  };

  const route = createRoutes(deps).find((r) => r.path === '/dsh-hotspot/api/article');
  const { req, res, result } = mockReqRes(
    'GET',
    '/dsh-hotspot/api/article?file=docs/draft/my-draft/index.md'
  );
  await route.handler(req, res);

  const data = result().json();
  assert.equal(data.ok, true);
  assert.equal(data.value.content, '# 正文\n\nSwift 6.1.2');
  assert.equal(askedSlug, 'my-draft', 'slug 应从 index.md 的父目录名反推');
  assert.equal(data.value.supplements.count, 1);
  assert.equal(data.value.supplements.entries[0].host, 'swift.org');
  assert.equal(data.value.supplements.entries[0].chars, 200);
  assert.equal(data.value.supplements.entries[0].preview.length, 160, '列表只给摘要');
  assert.equal(data.value.supplements.entries[0].content, undefined, '不应把整页正文塞进响应');
});

test('API 路由：补料读不到时正文照常返回', async () => {
  const deps = {
    projectRoot: '/mock/path',
    store: { loadDigest: async () => null },
    target: {
      articleDir: 'docs/article',
      draftDir: 'docs/draft',
      profile: async () => ({ tagVocabulary: [], keywords: [] }),
      listArticles: async () => [],
      listDrafts: async () => [],
      readArticle: async (file) => ({ file, content: '# 正文' }),
      readSupplements: async () => {
        throw new Error('sources.json 坏了');
      },
    },
    runScan: async () => ({ digest: null, status: {} }),
  };

  const route = createRoutes(deps).find((r) => r.path === '/dsh-hotspot/api/article');
  const { req, res, result } = mockReqRes('GET', '/dsh-hotspot/api/article?file=docs/draft/x/index.md');
  await route.handler(req, res);

  const data = result().json();
  assert.equal(data.ok, true);
  assert.equal(data.value.content, '# 正文');
  assert.equal(data.value.supplements.count, 0);
});

test('API 路由：支持删除草稿或文章 /dsh-hotspot/api/article-delete 与双前缀兼容', async () => {
  let deletedFile = null;
  const deps = {
    projectRoot: '/mock/path',
    store: { loadDigest: async () => null },
    target: {
      articleDir: 'docs/article',
      draftDir: 'docs/draft',
      profile: async () => ({ tagVocabulary: [], keywords: [] }),
      listArticles: async () => [],
      listDrafts: async () => [],
      deleteArticle: async (file) => {
        deletedFile = file;
        return { ok: true, file };
      },
    },
    runScan: async () => ({ digest: null, status: {} }),
  };

  const routes = createRoutes(deps);
  const delRoute = routes.find((r) => r.path === '/dsh-hotspot/api/article-delete');
  const legacyDelRoute = routes.find((r) => r.path === '/hotspot/api/article-delete');
  assert.ok(delRoute, '主路由应当存在');
  assert.ok(legacyDelRoute, '兼容路由应当存在');

  // 1. 缺少 file 拦截
  const { req: errReq, res: errRes, result: errResult } = mockReqRes('POST', '/dsh-hotspot/api/article-delete', {});
  await delRoute.handler(errReq, errRes);
  assert.equal(errResult().status, 400);

  // 2. 正常删除
  const { req, res, result } = mockReqRes('POST', '/dsh-hotspot/api/article-delete', { file: 'docs/draft/demo/index.md' });
  await delRoute.handler(req, res);
  const data = result().json();
  assert.equal(data.ok, true);
  assert.equal(deletedFile, 'docs/draft/demo/index.md');
});
