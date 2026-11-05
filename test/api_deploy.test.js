import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
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

// onConfigUpdated 刻意什么都不返回：部署路由每次都从磁盘读配置，
// 测试里让 currentProjectRoot 固定在临时根目录，避免配置写到别处。
function makeDeps(projectRoot) {
  return {
    projectRoot,
    store: { loadDigest: async () => null },
    target: {
      articleDir: 'docs',
      draftDir: 'docs/draft',
      profile: async () => ({ tagVocabulary: [], keywords: [], articles: [] }),
      listDrafts: async () => [],
    },
    runScan: async () => ({ digest: { date: '2026-11-05', items: [] }, status: {} }),
    onConfigUpdated: async () => undefined,
  };
}

function routeOf(routes, suffix) {
  return routes.find((r) => r.path === `/dsh-hotspot/api/${suffix}`);
}

async function callRoute(route, method, body) {
  const { req, res, result } = mockReqRes(method, '/dsh-hotspot/api', body);
  await route.handler(req, res);
  return result();
}

function setupBlog(t) {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'hotspot-deploy-test-'));
  const blogDir = path.join(tempDir, 'my-blog');
  mkdirSync(blogDir, { recursive: true });
  t.after(() => rmSync(tempDir, { recursive: true, force: true }));
  return { tempDir, blogDir };
}

test('部署：未绑定脚本时按钮信息为空，直接调用接口返回 ERR_NO_DEPLOY_SCRIPT', async (t) => {
  const { tempDir } = setupBlog(t);
  const routes = createRoutes(makeDeps(tempDir));

  const stateResult = await callRoute(routeOf(routes, 'state'), 'GET');
  assert.equal(stateResult.status, 200);
  assert.deepEqual(stateResult.json().value.config.deploy, { script: '', configured: false });

  const deployResult = await callRoute(routeOf(routes, 'deploy'), 'POST', {});
  assert.equal(deployResult.status, 400);
  const payload = deployResult.json();
  assert.equal(payload.ok, false);
  assert.equal(payload.code, 'ERR_NO_DEPLOY_SCRIPT');
  assert.ok(payload.error.includes('deploy.script'));
});

test('部署：配置保存 deploy.script 后 state 标为已绑定，空字符串保存即解绑', async (t) => {
  const { tempDir } = setupBlog(t);
  const routes = createRoutes(makeDeps(tempDir));
  const configRoute = routeOf(routes, 'config');
  const stateRoute = routeOf(routes, 'state');

  const saved = await callRoute(configRoute, 'POST', { deploy: { script: '  npm run build  ' } });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.json().value.deploy, { script: 'npm run build', configured: true });

  const state = await callRoute(stateRoute, 'GET');
  assert.deepEqual(state.json().value.config.deploy, { script: 'npm run build', configured: true });

  const onDisk = JSON.parse(readFileSync(path.join(tempDir, 'dsh-hotspot.config.json'), 'utf8'));
  assert.equal(onDisk.deploy.script, 'npm run build');

  const cleared = await callRoute(configRoute, 'POST', { deploy: { script: '   ' } });
  assert.equal(cleared.status, 200);
  assert.deepEqual(cleared.json().value.deploy, { script: '', configured: false });
  const clearedDisk = JSON.parse(readFileSync(path.join(tempDir, 'dsh-hotspot.config.json'), 'utf8'));
  assert.equal(clearedDisk.deploy, undefined);

  const clearedState = await callRoute(stateRoute, 'GET');
  assert.equal(clearedState.json().value.config.deploy.configured, false);
});

test('部署：脚本在博客根目录下执行，返回退出码、耗时与输出', async (t) => {
  const { tempDir, blogDir } = setupBlog(t);
  const routes = createRoutes(makeDeps(tempDir));
  await callRoute(routeOf(routes, 'config'), 'POST', {
    projectRoot: blogDir,
    deploy: { script: 'printf deployed > marker.txt && echo hello-from-deploy' },
  });

  const result = await callRoute(routeOf(routes, 'deploy'), 'POST', {});
  assert.equal(result.status, 200);
  const payload = result.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.success, true);
  assert.equal(payload.value.code, 0);
  assert.equal(payload.value.message, undefined);
  assert.ok(payload.value.stdout.includes('hello-from-deploy'));
  assert.equal(payload.value.cwd, path.resolve(blogDir));
  assert.equal(payload.value.script, 'printf deployed > marker.txt && echo hello-from-deploy');
  assert.ok(Number(payload.value.durationMs) >= 0);
  // 真正的判定：脚本确实以博客根目录为 cwd 执行了
  assert.equal(readFileSync(path.join(blogDir, 'marker.txt'), 'utf8'), 'deployed');
});

test('部署：非零退出码返回 success=false 且带回 stderr', async (t) => {
  const { tempDir, blogDir } = setupBlog(t);
  const routes = createRoutes(makeDeps(tempDir));
  await callRoute(routeOf(routes, 'config'), 'POST', {
    projectRoot: blogDir,
    deploy: { script: 'echo boom >&2; exit 7' },
  });

  const result = await callRoute(routeOf(routes, 'deploy'), 'POST', {});
  assert.equal(result.status, 200);
  const payload = result.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.success, false);
  assert.equal(payload.value.success, false);
  assert.equal(payload.value.code, 7);
  assert.ok(payload.value.stderr.includes('boom'));
  assert.ok(payload.message.includes('7'));
});

test('部署：博客根目录失效时返回 ERR_NO_BLOG_ROOT，而不是拿当前工作目录乱跑', async (t) => {
  const { tempDir, blogDir } = setupBlog(t);
  const routes = createRoutes(makeDeps(tempDir));
  await callRoute(routeOf(routes, 'config'), 'POST', {
    projectRoot: blogDir,
    deploy: { script: 'echo should-not-run' },
  });
  rmSync(blogDir, { recursive: true, force: true });

  const result = await callRoute(routeOf(routes, 'deploy'), 'POST', {});
  assert.equal(result.status, 400);
  assert.equal(result.json().code, 'ERR_NO_BLOG_ROOT');
});

test('部署：并发请求被 409 ERR_DEPLOY_BUSY 挡住，前一次正常完成', async (t) => {
  const { tempDir, blogDir } = setupBlog(t);
  const routes = createRoutes(makeDeps(tempDir));
  await callRoute(routeOf(routes, 'config'), 'POST', {
    projectRoot: blogDir,
    deploy: { script: 'sleep 0.4; echo done' },
  });

  const deployRoute = routeOf(routes, 'deploy');
  const first = callRoute(deployRoute, 'POST', {});
  await new Promise((resolve) => setTimeout(resolve, 80));
  const second = await callRoute(deployRoute, 'POST', {});
  assert.equal(second.status, 409);
  assert.equal(second.json().code, 'ERR_DEPLOY_BUSY');

  const firstResult = await first;
  assert.equal(firstResult.status, 200);
  assert.equal(firstResult.json().success, true);
  assert.ok(firstResult.json().value.stdout.includes('done'));

  // 排他锁在结束后释放：再来一次应恢复可用
  const third = await callRoute(deployRoute, 'POST', {});
  assert.equal(third.status, 200);
  assert.equal(third.json().success, true);
});
