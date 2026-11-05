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
  assert.ok(
    sData.value.config.sources.some((s) => s.id === 'sopilot-hottweets'),
    '默认配置源中应包含 sopilot-hottweets'
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
