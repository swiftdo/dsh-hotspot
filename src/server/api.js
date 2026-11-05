import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { createVitePressTarget } from '../adapters/target-vitepress.js';
import { canonicalUrl, slugify } from '../core/normalize.js';
import { buildFeedItems, buildRssXml } from '../core/rss.js';
import { BUILTIN_SOURCES, configuredSources, resolveSources } from '../core/sources.js';
import { describeViolations } from '../core/promote.js';
import { guard, readJson, sendHtml, sendJson } from './http.js';
import {
  DEPLOY_TIMEOUT_MS,
  appendDeployHistory,
  describeDeploy,
  readDeployHistory,
  runDeployPlan,
} from './deploy.js';
import { createStateBuilder, sourceLabel } from './state.js';
import { LEGACY_PREFIX, PREFIX } from './prefix.js';

/**
 * 管理界面的服务端。
 *
 * 用 ctx.webServer.register 注册普通 Node http handler，不走平台鉴权，
 * 所以自己守一道：只允许 loopback、拒绝跨站、同源才放行。
 * 这也是 dsh-free-search 的 bridge 采用的做法。
 *
 * 界面是单个零依赖 HTML（src/web/panel.html），不做 React 客户端插件 ——
 * 那需要引入客户端构建链和对 dsh.client 预发布 API 的耦合，
 * 而这些管理功能用不上组件化。
 */

const PANEL_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'panel.html');
export { LEGACY_PREFIX, PREFIX } from './prefix.js';
// 「今日订阅文章」单次最多返回这么多条：raw 一天可能上千条，面板一次全给会卡。

export { BUILTIN_SOURCES };

const VALID_KINDS = new Set(['rss', 'atom', 'github-release', 'hn']);

/**
 * 调起系统原生文件夹选择器。
 *
 * 返回 `{ path, code, message }`：以前失败一律 resolve(null)，面板于是表现成
 * 「点了没反应」—— 分不清是用户点了取消，还是这台机器根本没有可用的选择器
 * （Linux 没装 zenity、无头环境、Electron 沙箱禁掉 AppleScript）。
 *
 * @returns {Promise<{ path: string|null, code: string, message: string }>}
 */
export async function pickNativeDirectory() {
  const platform = process.platform;
  const cancelled = { path: null, code: 'CANCELLED', message: '已取消选择' };

  const run = (cmd, args, missingHint) =>
    new Promise((resolve) => {
      execFile(cmd, args, { timeout: 60000 }, (error, stdout) => {
        if (!error) {
          const picked = (stdout || '').trim();
          return resolve(picked ? { path: picked, code: 'OK', message: '' } : cancelled);
        }
        // 最常见的两种失败：命令不存在（没装 zenity / powershell）与用户取消
        if (error.code === 'ENOENT') {
          return resolve({ path: null, code: 'NO_PICKER', message: missingHint });
        }
        const message = String(error.message || '');
        if (/cancel|osascript is not allowed|User canceled|-128/i.test(message)) {
          return resolve(cancelled);
        }
        resolve({ path: null, code: 'PICKER_FAILED', message: `调起选择器失败：${message}` });
      });
    });

  if (platform === 'darwin') {
    return run(
      'osascript',
      ['-e', 'POSIX path of (choose folder with prompt "请选择博客项目根目录")'],
      '这台 Mac 上无法调起系统选择器（AppleScript 被沙箱禁用），请手动输入路径',
    );
  }
  if (platform === 'win32') {
    const psCmd =
      '[System.Reflection.Assembly]::LoadWithPartialName("System.windows.forms") | Out-Null; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = "请选择博客项目根目录"; if($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){ Write-Output $f.SelectedPath }';
    return run('powershell', ['-NoProfile', '-Command', psCmd], '没有可用的 PowerShell，请手动输入路径');
  }
  return run(
    'zenity',
    ['--file-selection', '--directory', '--title=请选择博客项目根目录'],
    '当前环境没有图形文件选择器（未安装 zenity），请手动输入路径',
  );
}

/**
 * 草稿目录的管辖判断：用 path.relative 而不是子串匹配。
 *
 * 以前用 `file.includes('draft')`，于是 `docs/mydrafts/x.md`、`docs/draft-notes/y.md`
 * 都会被当成草稿放行；把草稿搬到 `.drafts/` 之后，靠子串更不可能对。
 */
function outsideDraftDir(target, file) {
  const draftDir = path.resolve(target?.draftDir || path.join(target?.root || process.cwd(), '.drafts'));
  const full = path.isAbsolute(String(file))
    ? path.resolve(String(file))
    : path.resolve(target?.root || process.cwd(), String(file));
  const rel = path.relative(draftDir, full);
  return rel === '' || rel.startsWith('..') || path.isAbsolute(rel);
}

function relativeDraftDir(target) {
  const draftDir = target?.draftDir || '.drafts';
  const root = target?.root || '';
  return root ? path.relative(root, draftDir) || draftDir : draftDir;
}

function validateSource(input) {
  const source = {
    id: String(input?.id ?? '').trim(),
    kind: String(input?.kind ?? '').trim(),
  };
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(source.id)) {
    return { error: 'id 只能是小写字母、数字、连字符，长度 1–32' };
  }
  if (!VALID_KINDS.has(source.kind)) {
    return { error: `kind 必须是 ${[...VALID_KINDS].join(' / ')}` };
  }
  if (source.kind === 'github-release') {
    source.repo = String(input?.repo ?? '').trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(source.repo)) return { error: 'repo 要写成 owner/name' };
  } else if (source.kind === 'hn') {
    const points = Number(input?.minPoints);
    source.minPoints = Number.isFinite(points) && points > 0 ? Math.floor(points) : 100;
  } else {
    source.url = String(input?.url ?? '').trim();
    if (!/^https?:\/\//i.test(source.url)) return { error: 'url 必须是 http(s) 地址' };
  }
  return { source };
}

/**
 * @param {{ projectRoot: string, store: any, target: any, runScan: () => Promise<any> }} deps
 */
export function createRoutes(deps) {
  let currentProjectRoot = deps.projectRoot;
  let currentStore = deps.store;
  let currentTarget = deps.target;
  let currentRunScan = deps.runScan;
  let deployInProgress = false;

  function configFileIn(root) {
    if (!root) return '';
    const dshCfg = path.join(root, 'dsh-hotspot.config.json');
    if (existsSync(dshCfg)) return dshCfg;
    const legacyCfg = path.join(root, 'hotspot.config.json');
    if (existsSync(legacyCfg)) return legacyCfg;
    return dshCfg;
  }

  function getConfigFile() {
    if (!currentProjectRoot) return '';
    return configFileIn(currentProjectRoot);
  }

  async function readConfigFile(file) {
    try {
      if (!file || !existsSync(file)) return null;
      return JSON.parse(await readFile(file, 'utf8'));
    } catch {
      return null;
    }
  }

  // 换绑到另一个根时，以「目标根自己的配置」为基底。解析失败必须报错：静默当 {} 处理
  // 会把目标根已有的 sources / publish 一起覆盖掉 —— 这正是「明明有默认源，抓取却报
  // 没有配置任何 sources」的成因。
  async function readConfigAt(root) {
    const file = configFileIn(root);
    if (!file || !existsSync(file)) return {};
    try {
      return JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      throw new Error(`目标博客根目录里的配置文件解析失败：${file}（${error.message}）`);
    }
  }

  // 读取时跟随「绑定根」：启动根（进程 cwd / 上次绑定的目录）里的配置只负责记录
  // projectRoot；真正的配置以绑定根下的那份为准。这样「配置跟着博客项目走」，
  // 面板里改过的东西不会因为宿主换个 cwd 启动就丢。
  async function readConfig() {
    if (!currentProjectRoot) return {};
    const local = await readConfigFile(getConfigFile());
    const boundRoot = local?.projectRoot ? path.resolve(local.projectRoot) : '';
    if (boundRoot && boundRoot !== path.resolve(currentProjectRoot)) {
      const followed = await readConfigFile(configFileIn(boundRoot));
      if (followed) return followed;
    }
    return local ?? {};
  }

  // 配置写到「这次保存之后生效的根」：面板里改绑博客根目录时，config.projectRoot
  // 已经是新值，而 currentProjectRoot 还是旧的，若按旧根写盘，配置会落在上一个项目里，
  // 重启后按新根读取就变成「配置没保存」。
  // 返回实际落盘路径，接口把它回给面板 —— 保存到底有没有写成功要能看见，不能静默。
  async function writeConfig(config) {
    const targetRoot = config?.projectRoot || currentProjectRoot || process.cwd();
    const primary = path.join(targetRoot, 'dsh-hotspot.config.json');
    const legacy = path.join(targetRoot, 'hotspot.config.json');
    const payload = `${JSON.stringify(config, null, 2)}\n`;
    await writeFile(primary, payload, 'utf8');
    if (existsSync(legacy)) {
      try {
        await writeFile(legacy, payload, 'utf8');
      } catch {
        /* 忽略兼容写错误 */
      }
    }
    return primary;
  }

  /** 生成/润色完立刻用同一套闸门验一遍 —— 面板直接显示违规，不必再切回终端。 */
  async function draftChecks(slug, targetArg = null, storeArg = null) {
    if (typeof deps.checkDraft !== 'function') return null;
    try {
      const report = await deps.checkDraft({
        target: targetArg || currentTarget,
        store: storeArg || currentStore,
        slug,
      });
      return { ok: report.result.ok, violations: report.result.violations };
    } catch {
      return null;
    }
  }

  /**
   * 起一个后台写作任务：子代理在后台「搜 → 读 → 综合」，写盘后立刻复核。
   * 三个入口（建草稿后自动写、面板重试、以后可能的定时任务）共用这一段。
   */
  function startWriteJob({ slug, target, store, projectRoot, message = '正在写正文' }) {
    if (!deps.jobs || typeof deps.generate !== 'function') return null;
    return deps.jobs.start({
      slug,
      message,
      run: async ({ signal }) => {
        try {
          // signal 一路传到模型请求：取消要真停，不是只把状态改成 cancelled
          const value = await deps.generate({ slug, store, target, projectRoot, signal });
          const checks = await draftChecks(slug, target, store);
          return { ...value, checks };
        } catch (error) {
          await deps.logError?.({ source: 'writer', slug, error });
          throw error;
        }
      },
    });
  }

  /**
   * 把域内错误码铺平成接口响应体：面板能直接拿到 code 与 message，
   * 不必从一句话里再猜。
   */
  function jobError(error) {
    return {
      code: error?.code || 'ERR_JOB',
      message: error?.message || String(error),
    };
  }


  const buildState = createStateBuilder({
    readConfig,
    configFileIn,
    getTarget: () => currentTarget,
    getStore: () => currentStore,
    getProjectRoot: () => currentProjectRoot,
    jobs: deps.jobs,
  });

  const baseRoutes = [
    {
      kind: 'exact',
      path: PREFIX,
      handler: async (req, res) => {
        if (!guard(req, res, ['GET'])) return;
        res.writeHead(302, { location: `${PREFIX}/` });
        res.end();
      },
    },
    {
      kind: 'exact',
      path: `${PREFIX}/`,
      handler: async (req, res) => {
        if (!guard(req, res, ['GET'])) return;
        try {
          sendHtml(res, await readFile(PANEL_FILE, 'utf8'));
        } catch (error) {
          sendJson(res, 500, { ok: false, message: `面板文件读取失败：${error.message}` });
        }
      },
    },
    {
      kind: 'exact',
      path: `${PREFIX}/rss.xml`,
      handler: async (req, res) => {
        if (!guard(req, res, ['GET'])) return;
        try {
          const state = await buildState();
          const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim() || 'http';
          const host = String(req.headers.host || '127.0.0.1').trim();
          const selfUrl = `${proto}://${host}${PREFIX}/rss.xml`;

          const allSources = [...(state.config.sources ?? []), ...state.builtinSources];
          const sourceNames = Object.fromEntries(
            allSources.filter((source) => source && source.id).map((source) => [source.id, sourceLabel(source)]),
          );
          const sourceUrls = Object.fromEntries(
            allSources
              .filter((source) => source && source.id && source.url)
              .map((source) => [source.id, String(source.url)]),
          );
          const items = buildFeedItems({
            digest: state.digest,
            articles: state.feed?.items ?? [],
            sourceNames,
            sourceUrls,
          });
          const candidateCount = items.filter((item) => item.kind === 'candidate').length;
          const articleCount = items.length - candidateCount;
          const stamp = state.digest
            ? `${state.digest.date} · 候选 ${candidateCount} 条 · 今日文章 ${articleCount} 条`
            : '今天还没有抓取记录';

          const xml = buildRssXml({
            title: '今日热点候选 · dsh-hotspot',
            link: selfUrl,
            selfUrl,
            description: `跨源聚合后的技术热点候选，候选排在最前，其后是今天抓到的订阅文章。${stamp}`,
            lastBuildDate: state.digest?.generatedAt || new Date().toISOString(),
            items,
          });
          res.writeHead(200, {
            'content-type': 'application/rss+xml; charset=utf-8',
            'cache-control': 'no-store',
            'content-length': Buffer.byteLength(xml),
          });
          res.end(xml);
        } catch (error) {
          sendJson(res, 500, { ok: false, message: error.message });
        }
      },
    },
    {
      kind: 'exact',
      path: `${PREFIX}/api/state`,
      handler: async (req, res) => {
        if (!guard(req, res, ['GET'])) return;
        try {
          sendJson(res, 200, { ok: true, value: await buildState() });
        } catch (error) {
          sendJson(res, 500, { ok: false, message: error.message });
        }
      },
    },
    {
      kind: 'exact',
      path: `${PREFIX}/api/jobs/cancel`,
      handler: async (req, res) => {
        if (!guard(req, res, ['POST'])) return;
        if (!deps.jobs || typeof deps.jobs.cancel !== 'function') {
          sendJson(res, 501, { ok: false, code: 'ERR_NO_JOBS', message: '当前环境没有后台任务执行器' });
          return;
        }
        let body;
        try {
          body = await readJson(req);
        } catch (e) {
          sendJson(res, 400, { ok: false, message: `JSON 解析失败: ${e.message}` });
          return;
        }
        const job = deps.jobs.cancel({
          slug: String(body?.slug ?? '').trim(),
          id: String(body?.id ?? '').trim(),
        });
        if (!job) {
          sendJson(res, 404, {
            ok: false,
            code: 'ERR_NO_RUNNING_JOB',
            message: '没有正在跑的任务（可能已经结束）',
          });
          return;
        }
        sendJson(res, 200, { ok: true, message: '已请求取消', value: job, job });
      },
    },
    {
      kind: 'exact',
      path: `${PREFIX}/api/jobs`,
      handler: async (req, res) => {
        if (!guard(req, res, ['GET', 'POST'])) return;
        if (!deps.jobs) {
          sendJson(res, 501, {
            ok: false,
            code: 'ERR_NO_JOBS',
            message: '当前环境没有后台任务执行器',
          });
          return;
        }

        if (req.method === 'GET') {
          const parsedUrl = new URL(req.url, 'http://127.0.0.1');
          const slug = parsedUrl.searchParams.get('slug') || '';
          sendJson(res, 200, { ok: true, value: deps.jobs.list({ slug }) });
          return;
        }

        // POST：失败后重试 —— 用同一个后台路径，不再走同步接口
        let body;
        try {
          body = await readJson(req);
        } catch (e) {
          sendJson(res, 400, { ok: false, message: `JSON 解析失败: ${e.message}` });
          return;
        }
        const slug = String(body?.slug ?? '').trim();
        if (!slug) {
          sendJson(res, 400, { ok: false, message: '缺少必需字段 slug' });
          return;
        }
        if (!currentTarget) {
          sendJson(res, 400, {
            ok: false,
            code: 'ERR_NO_BLOG_ROOT',
            message: '尚未配置博客项目根目录',
          });
          return;
        }
        try {
          const job = startWriteJob({
            slug,
            target: currentTarget,
            store: currentStore,
            projectRoot: currentProjectRoot,
            message: '正在重试写正文',
          });
          if (!job) {
            sendJson(res, 501, {
              ok: false,
              code: 'ERR_NO_WRITER',
              message: '当前环境没有接入写作子代理，无法重试',
            });
            return;
          }
          sendJson(res, 200, { ok: true, value: job, job });
        } catch (error) {
          sendJson(res, 409, { ok: false, ...jobError(error) });
        }
      },
    },
    {
      kind: 'exact',
      path: `${PREFIX}/api/sources`,
      handler: async (req, res) => {
        if (!guard(req, res, ['POST'])) return;
        const body = await readJson(req);
        if (body === undefined) return sendJson(res, 400, { ok: false, message: '请求体不是合法 JSON' });
        if (!Array.isArray(body.sources)) return sendJson(res, 400, { ok: false, message: 'sources 必须是数组' });

        const seen = new Set();
        const sources = [];
        for (const raw of body.sources) {
          const result = validateSource(raw);
          if (result.error) return sendJson(res, 400, { ok: false, message: result.error });
          if (seen.has(result.source.id)) {
            return sendJson(res, 400, { ok: false, message: `源 id 重复：${result.source.id}` });
          }
          seen.add(result.source.id);
          sources.push(result.source);
        }

        const config = await readConfig();
        config.sources = sources;
        await writeConfig(config);
        sendJson(res, 200, { ok: true, value: { sources } });
      },
    },
    {
      kind: 'exact',
      path: `${PREFIX}/api/config`,
      handler: async (req, res) => {
        if (!guard(req, res, ['POST'])) return;
        const body = await readJson(req);
        if (body === undefined) return sendJson(res, 400, { ok: false, message: '请求体不是合法 JSON' });

        // 换绑根目录时不能拿当前根的配置整份覆盖目标根：未绑定状态下 readConfig()
        // 就是 {}，写出去的文件只剩 {projectRoot}，目标根原有的 sources 被顶掉。
        const requestedRoot = body.projectRoot !== undefined ? String(body.projectRoot).trim() : '';
        const resolvedRequest = requestedRoot ? path.resolve(requestedRoot) : '';
        const rebinding =
          resolvedRequest !== '' &&
          (!currentProjectRoot || resolvedRequest !== path.resolve(currentProjectRoot));
        let config;
        if (rebinding) {
          try {
            config = await readConfigAt(resolvedRequest);
          } catch (error) {
            return sendJson(res, 400, { ok: false, message: error.message });
          }
        } else {
          config = await readConfig();
        }

        // 1. 博客仓库根目录与目录配置
        if (body.projectRoot !== undefined) {
          const raw = String(body.projectRoot).trim();
          if (raw) {
            const resolved = path.resolve(raw);
            if (!existsSync(resolved)) {
              return sendJson(res, 400, { ok: false, message: `指定博客根目录不存在: ${resolved}` });
            }
            config.projectRoot = resolved;
          } else {
            delete config.projectRoot;
          }
        }
        if (body.articleDir !== undefined) {
          config.articleDir = String(body.articleDir).trim() || 'docs';
        }
        if (body.draftDir !== undefined) {
          config.draftDir = String(body.draftDir).trim() || '.drafts';
        }
        if (body.digestDir !== undefined) {
          config.digestDir = String(body.digestDir).trim() || '.hotspot';
        }

        // 2. 排序与打分参数
        if (body.rank && typeof body.rank === 'object') {
          const rank = { ...(config.rank ?? {}) };
          for (const key of ['halfLifeHours', 'limit', 'sinceHours', 'clusterThreshold']) {
            const value = Number(body.rank[key]);
            if (Number.isFinite(value) && value > 0) rank[key] = value;
          }
          if (rank.clusterThreshold !== undefined) {
            rank.clusterThreshold = Math.min(0.95, Math.max(0.3, rank.clusterThreshold));
          }
          config.rank = rank;
        }

        // 3. 发布合规与安全规则
        if (body.publish && typeof body.publish === 'object') {
          const publish = { ...(config.publish ?? {}) };
          if (Number.isFinite(Number(body.publish.maxPerDay))) {
            publish.maxPerDay = Math.max(0, Math.floor(Number(body.publish.maxPerDay)));
          }
          if (Array.isArray(body.publish.allowedHosts)) {
            publish.allowedHosts = body.publish.allowedHosts
              .map((h) => String(h).trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
              .filter(Boolean);
          }
          if (Array.isArray(body.publish.autoTiers)) {
            publish.autoTiers = body.publish.autoTiers.map(String);
          }
          config.publish = publish;
        }

        // 4. 站点部署：script 必填、build 可选，空字符串视为解绑对应命令。
        // 采用「合并」语义：只传 build 时不会把已保存的 script 抹掉。
        if (body.deploy && typeof body.deploy === 'object') {
          const deploy = { ...(config.deploy ?? {}) };
          for (const key of ['script', 'build']) {
            if (!(key in body.deploy)) continue;
            const value = String(body.deploy[key] ?? '').trim();
            if (value.length > 4096) {
              return sendJson(res, 400, { ok: false, message: `deploy.${key} 过长（上限 4096 字符）` });
            }
            if (value) deploy[key] = value;
            else delete deploy[key];
          }
          if ('timeoutMs' in body.deploy) {
            const ms = Number(body.deploy.timeoutMs);
            if (Number.isFinite(ms) && ms > 0) deploy.timeoutMs = Math.min(Math.floor(ms), DEPLOY_TIMEOUT_MS);
            else delete deploy.timeoutMs;
          }
          if (Object.keys(deploy).length > 0) config.deploy = deploy;
          else delete config.deploy;
        }

        const configFile = await writeConfig(config);
        // 绑定根变了就立刻跟上：否则同一次请求里的后续读取仍指向旧根，
        // 面板刷新出来的是「保存了但没生效」。
        if (config.projectRoot) currentProjectRoot = path.resolve(config.projectRoot);

        // 4. 触发运行时刷新
        if (typeof deps.onConfigUpdated === 'function') {
          try {
            const updated = await deps.onConfigUpdated(config);
            if (updated?.projectRoot) currentProjectRoot = updated.projectRoot;
            if (updated?.store) currentStore = updated.store;
            if (updated?.target) currentTarget = updated.target;
            if (updated?.runScan) currentRunScan = updated.runScan;
          } catch (err) {
            console.warn(`[hotspot] onConfigUpdated 触发失败: ${err.message}`);
          }
        }

        sendJson(res, 200, {
          ok: true,
          value: {
            projectRoot: config.projectRoot || currentProjectRoot,
            articleDir: config.articleDir || 'docs',
            draftDir: config.draftDir || '.drafts',
            digestDir: config.digestDir || '.hotspot',
            rank: config.rank ?? {},
            publish: config.publish ?? {},
            deploy: describeDeploy(config, config.projectRoot || currentProjectRoot),
            configFile,
          },
        });
      },
    },
    {
      kind: 'exact',
      path: `${PREFIX}/api/run`,
      handler: async (req, res) => {
        if (!guard(req, res, ['POST'])) return;
        try {
          const { digest, status } = await currentRunScan();
          sendJson(res, 200, {
            ok: true,
            value: {
              date: digest.date,
              generatedAt: digest.generatedAt,
              status,
              items: digest.items.map((it) => ({ id: it.id, title: it.title, score: it.score })),
            },
          });
        } catch (error) {
          // 并发抓取会被插件里的单飞挡下：这是「稍后再试」，不是服务出错
          if (error?.code === 'ERR_SCAN_BUSY') {
            sendJson(res, 409, { ok: false, code: 'ERR_SCAN_BUSY', message: error.message });
            return;
          }
          await deps.logError?.({ source: 'scan', error });
          sendJson(res, 500, { ok: false, message: error.message });
        }
      },
    },
    {
      kind: 'exact',
      path: `${PREFIX}/api/errors`,
      handler: async (req, res) => {
        if (!guard(req, res, ['GET', 'POST', 'DELETE'])) return;
        const isRead = req.method === 'GET';
        try {
          if (isRead) {
            const parsedUrl = new URL(req.url, 'http://127.0.0.1');
            const date = parsedUrl.searchParams.get('date') || '';
            const limit = Number(parsedUrl.searchParams.get('limit') || 100);
            sendJson(res, 200, {
              ok: true,
              value: {
                date: date || (typeof deps.errorLogToday === 'function' ? deps.errorLogToday() : ''),
                entries: typeof deps.readErrors === 'function' ? await deps.readErrors({ date: date || undefined, limit }) : [],
                files: typeof deps.errorFiles === 'function' ? await deps.errorFiles() : [],
              },
            });
            return;
          }

          // 清空：POST / DELETE 都行，带 date 只清那一天，不带清全部
          let body = {};
          if (req.method === 'POST') {
            try {
              body = await readJson(req);
            } catch (e) {
              sendJson(res, 400, { ok: false, message: `JSON 解析失败: ${e.message}` });
              return;
            }
            if (body === undefined) body = {};
          }
          const date = String(body?.date ?? '');
          const removed = typeof deps.clearErrors === 'function'
            ? await deps.clearErrors(date ? { date } : {})
            : 0;
          sendJson(res, 200, {
            ok: true,
            message: removed > 0 ? `已清理 ${removed} 个日志文件` : '没有需要清理的日志',
            value: { removed, files: typeof deps.errorFiles === 'function' ? await deps.errorFiles() : [] },
          });
        } catch (error) {
          sendJson(res, 500, { ok: false, message: error.message });
        }
      },
    },
    {
      kind: 'exact',
      path: `${PREFIX}/api/scaffold`,
      handler: async (req, res) => {
        if (!guard(req, res, ['POST'])) return;
        const body = await readJson(req);
        if (body === undefined) return sendJson(res, 400, { ok: false, message: '请求体不是合法 JSON' });

        const digest = await currentStore.loadDigest('latest');
        if (!digest) return sendJson(res, 400, { ok: false, message: '还没有 digest，先跑一次抓取' });

        const key = String(body.id ?? '').replace(/^#/, '');
        const item =
          digest.items.find((it) => it.id === key || it.id.endsWith(key) || it.id.endsWith(`-${key.padStart(2, '0')}`)) ??
          (Number(key) >= 1 && Number(key) <= digest.items.length ? digest.items[Number(key) - 1] : null);
        if (!item) return sendJson(res, 404, { ok: false, message: `没有候选 ${body.id}` });

        let effectiveTarget = currentTarget;
        let targetRoot = currentProjectRoot;

        // 若请求中提供了 projectRoot，优先使用该路径，若合法还同步持久化
        if (body.projectRoot) {
          const customRoot = path.resolve(String(body.projectRoot).trim());
          if (!existsSync(customRoot)) {
            return sendJson(res, 400, { ok: false, message: `指定博客根目录不存在: ${customRoot}` });
          }
          targetRoot = customRoot;
          const config = await readConfig();
          if (!config.projectRoot || config.projectRoot !== customRoot) {
            config.projectRoot = customRoot;
            await writeConfig(config);
            if (typeof deps.onConfigUpdated === 'function') {
              try {
                const updated = await deps.onConfigUpdated(config);
                if (updated?.projectRoot) currentProjectRoot = updated.projectRoot;
                if (updated?.store) currentStore = updated.store;
                if (updated?.target) currentTarget = updated.target;
              } catch {
                /* 忽略静默更新失败 */
              }
            }
          }
          effectiveTarget =
            currentTarget && currentProjectRoot === customRoot
              ? currentTarget
              : createVitePressTarget({
                  root: customRoot,
                  articleDir: config.articleDir || 'docs',
                  draftDir: config.draftDir || '.drafts',
                });
        }

        if (!targetRoot || !effectiveTarget) {
          return sendJson(res, 400, {
            ok: false,
            code: 'ERR_NO_BLOG_ROOT',
            message: '未配置博客项目路径。必须在控制面板中配置博客根目录，或在生成草稿请求中提供 projectRoot。',
          });
        }

        // 目录名是永久 URL，必须能给出来。纯中文标题推导不出 slug（slugify 只提 ASCII），
        // 以前这里直接落到 target.scaffold 抛错、接口回 500 —— 面板点「生成草稿」就炸。
        // 现在提前判：能推导就用推导值，推导不出要求显式传，并回可操作的结构化错误。
        const requestedSlug = body.slug == null ? '' : String(body.slug).trim();
        const slug = requestedSlug || item.slugHint || slugify(item.title);
        if (!slug) {
          sendJson(res, 400, {
            ok: false,
            code: 'ERR_SLUG_REQUIRED',
            message: '这条候选的标题推导不出目录名（纯中文标题），请提供一个 slug，例如 hotspot-1105-03',
            value: { title: item.title, slugHint: item.slugHint || '', url: item.url },
          });
          return;
        }
        if (!/^[a-z0-9-]+$/.test(slug)) {
          sendJson(res, 400, {
            ok: false,
            code: 'ERR_SLUG_INVALID',
            message: `slug 只能用小写字母、数字和连字符：${slug}`,
          });
          return;
        }
        if (body.title != null && !String(body.title).trim()) {
          sendJson(res, 400, { ok: false, code: 'ERR_TITLE_EMPTY', message: '标题不能是空的' });
          return;
        }

        try {
          const existing = await effectiveTarget.exists(item);
          if (existing.exists) return sendJson(res, 409, { ok: false, message: `已经写过：${existing.reason}` });
          const result = await effectiveTarget.scaffold(item, {
            draft: true,
            slug,
            // 中文标题必须能覆盖，否则 frontmatter 会沿用英文 RSS 标题
            title: body.title == null ? undefined : String(body.title),
            description: body.description == null ? undefined : String(body.description),
          });

          // 默认只建骨架（旧面板与脚本的行为不变）；generate:true 才是「一键成稿」。
          if (body.generate !== true) {
            sendJson(res, 200, { ok: true, value: result });
            return;
          }

          let job = null;
          try {
            job = startWriteJob({
              slug: result.slug,
              target: effectiveTarget,
              store: currentStore,
              projectRoot: targetRoot,
            });
          } catch (error) {
            // 草稿已经建好了，任务起不来也要把这件事说清楚，不能回 500 让前端以为草稿没建。
            sendJson(res, 409, { ok: false, ...jobError(error), value: result });
            return;
          }

          sendJson(res, 200, {
            ok: true,
            value: result,
            job,
            message: job ? '草稿已建，正文在后台写' : '草稿已建，但当前环境没有接入写作子代理，正文待补',
          });
        } catch (error) {
          await deps.logError?.({ source: 'scaffold', error, context: { id: body?.id } });
          sendJson(res, 500, { ok: false, message: error.message });
        }
      },
    },
    {
      kind: 'exact',
      path: `${PREFIX}/api/pick-dir`,
      handler: async (req, res) => {
        if (!guard(req, res, ['GET', 'POST'])) return;
        try {
          let outcome;
          if (typeof deps.pickDirectory === 'function') {
            // 宿主自己实现了选择器（桌面应用走原生对话框），取消就是 null
            const picked = await deps.pickDirectory();
            outcome = picked
              ? { path: picked, code: 'OK', message: '' }
              : { path: null, code: 'CANCELLED', message: '' };
          } else {
            outcome = await pickNativeDirectory();
          }
          sendJson(res, 200, {
            ok: true,
            path: outcome.path || null,
            code: outcome.code || (outcome.path ? 'OK' : 'CANCELLED'),
            // 面板据此区分「用户取消」与「这台机器没有选择器」
            message: outcome.message || '',
          });
        } catch (error) {
          sendJson(res, 500, { ok: false, message: error.message });
        }
      },
    },
    {
      kind: 'exact',
      path: `${PREFIX}/api/drafts`,
      handler: async (req, res) => {
        if (!guard(req, res, ['GET'])) return;
        const state = await buildState();
        sendJson(res, 200, {
          ok: true,
          value: state.drafts,
          drafts: state.drafts,
          articles: state.drafts,
          total: state.drafts.length,
          draftTotal: state.drafts.length,
        });
      },
    },
    {
      kind: 'exact',
      path: `${PREFIX}/api/articles`,
      handler: async (req, res) => {
        if (!guard(req, res, ['GET'])) return;
        const state = await buildState();
        sendJson(res, 200, {
          ok: true,
          value: state.drafts,
          drafts: state.drafts,
          articles: state.drafts,
          total: state.drafts.length,
          draftTotal: state.drafts.length,
        });
      },
    },
    {
      kind: 'exact',
      path: `${PREFIX}/api/article`,
      handler: async (req, res) => {
        if (!guard(req, res, ['GET', 'POST'])) return;
        const target = currentTarget;
        if (!target) {
          sendJson(res, 400, {
            ok: false,
            code: 'ERR_NO_BLOG_ROOT',
            error: '尚未配置博客项目根目录',
          });
          return;
        }

        if (req.method === 'GET') {
          const parsedUrl = new URL(req.url, 'http://127.0.0.1');
          const file = parsedUrl.searchParams.get('file');
          if (!file) {
            sendJson(res, 400, { ok: false, error: '缺少必需参数 file' });
            return;
          }
          try {
            const data = await target.readArticle(file);
            const val = typeof data === 'string'
              ? { file, content: data }
              : (data || { file, content: '' });

            // 补料（证据账本）随正文一起返回：面板上要能回答"这段数字是从哪读来的"。
            // 用 slug 参数可显式指定，否则从 index.md 的父目录名反推。
            if (typeof target.readSupplements === 'function') {
              try {
                const slug = parsedUrl.searchParams.get('slug')
                  || path.basename(path.dirname(val.file || file));
                const supplements = await target.readSupplements(slug);
                val.slug = slug;
                val.supplements = {
                  count: supplements.entries.length,
                  file: supplements.file ?? null,
                  entries: supplements.entries.map((entry) => ({
                    url: entry.url,
                    host: entry.host,
                    title: entry.title,
                    kind: entry.kind,
                    fetchedAt: entry.fetchedAt,
                    chars: [...(entry.content ?? '')].length,
                    preview: (entry.content ?? '').slice(0, 160),
                  })),
                };
              } catch {
                // 补料只是附加信息，读不到不能连正文一起拖挂
                val.supplements = { count: 0, file: null, entries: [] };
              }
            }

            sendJson(res, 200, { ok: true, value: val });
          } catch (err) {
            sendJson(res, 404, { ok: false, error: err.message });
          }
          return;
        }

        if (req.method === 'POST') {
          let body;
          try {
            body = await readJson(req);
          } catch (e) {
            sendJson(res, 400, { ok: false, error: `JSON 解析失败: ${e.message}` });
            return;
          }
          const { file, content } = body || {};
          if (!file || typeof content !== 'string') {
            sendJson(res, 400, { ok: false, error: '缺少必需字段 file 或 content' });
            return;
          }
          const foreign = outsideDraftDir(target, file);
          if (foreign) {
            sendJson(res, 403, {
              ok: false,
              code: 'ERR_ARTICLE_PROTECTED',
              error: `超出管辖范围：已发布文章受保护，插件只改草稿目录（${relativeDraftDir(target)}）下的文件`,
            });
            return;
          }
          try {
            const result = await target.saveArticle(file, content);
            sendJson(res, 200, { ok: true, message: '草稿保存成功', value: result });
          } catch (err) {
            sendJson(res, 500, { ok: false, error: err.message });
          }
        }
      },
    },
    {
      kind: 'exact',
      path: `${PREFIX}/api/article-promote`,
      handler: async (req, res) => {
        if (!guard(req, res, ['POST'])) return;
        const target = currentTarget;
        if (!target) {
          sendJson(res, 400, {
            ok: false,
            code: 'ERR_NO_BLOG_ROOT',
            error: '尚未配置博客项目根目录',
          });
          return;
        }
        let body;
        try {
          body = await readJson(req);
        } catch (e) {
          sendJson(res, 400, { ok: false, error: `JSON 解析失败: ${e.message}` });
          return;
        }
        const { slug } = body || {};
        if (!slug) {
          sendJson(res, 400, { ok: false, error: '缺少必需字段 slug' });
          return;
        }
        // 转正必须过闸：闸门在 core/promote.js，CLI 与插件工具走的是同一段。
        if (typeof deps.promoteChecked !== 'function') {
          sendJson(res, 501, {
            ok: false,
            code: 'ERR_NO_GATE',
            error: '当前环境没有接入校验闸门，拒绝转正',
          });
          return;
        }
        try {
          const outcome = await deps.promoteChecked({ target, store: currentStore, slug });
          if (!outcome.ok) {
            const message = `校验未通过：${describeViolations(outcome.violations)}`;
            sendJson(res, 409, {
              ok: false,
              code: 'ERR_CHECK_FAILED',
              message,
              error: message,
              violations: outcome.violations.map((item) => ({ code: item.code, message: item.message })),
            });
            return;
          }
          sendJson(res, 200, { ok: true, message: '草稿已成功转正发布', value: outcome.promoted });
        } catch (err) {
          sendJson(res, 500, { ok: false, error: err.message });
        }
      },
    },
    {
      method: 'POST',
      kind: 'exact',
      path: `${PREFIX}/api/article-delete`,
      handler: async (req, res) => {
        if (!guard(req, res, ['POST'])) return;
        const target = currentTarget;
        if (!target) {
          sendJson(res, 400, {
            ok: false,
            code: 'ERR_NO_BLOG_ROOT',
            error: '尚未配置博客项目根目录',
          });
          return;
        }
        let body;
        try {
          body = await readJson(req);
        } catch (e) {
          sendJson(res, 400, { ok: false, error: `JSON 解析失败: ${e.message}` });
          return;
        }
        const { file } = body || {};
        if (!file || typeof file !== 'string') {
          sendJson(res, 400, { ok: false, error: '缺少必需字段 file' });
          return;
        }
        if (outsideDraftDir(target, file)) {
          sendJson(res, 403, {
            ok: false,
            code: 'ERR_ARTICLE_PROTECTED',
            error: `超出管辖范围：已发布文章受保护，插件只删草稿目录（${relativeDraftDir(target)}）下的文件`,
          });
          return;
        }
        try {
          const resDelete = await target.deleteArticle(file);
          sendJson(res, 200, { ok: true, message: '草稿已成功删除', value: resDelete });
        } catch (err) {
          sendJson(res, 500, { ok: false, error: err.message });
        }
      },
    },
    {
      kind: 'exact',
      path: `${PREFIX}/api/models`,
      handler: async (req, res) => {
        if (!guard(req, res, ['GET', 'POST'])) return;
        if (req.method === 'GET') {
          if (typeof deps.listModels !== 'function') {
            sendJson(res, 200, {
              ok: true,
              message: '当前环境没有接入模型目录',
              value: {
                providers: [],
                selection: {
                  version: 2,
                  mode: 'agent',
                  global: { provider: '', model: '' },
                  writer: { provider: '', model: '' },
                  polish: { provider: '', model: '' },
                },
                route: null,
                routes: { writer: null, polish: null },
              },
            });
            return;
          }
          try {
            const value = await deps.listModels();
            sendJson(res, 200, { ok: true, value });
          } catch (err) {
            sendJson(res, 500, { ok: false, error: err.message });
          }
          return;
        }

        if (typeof deps.saveModels !== 'function') {
          sendJson(res, 501, { ok: false, code: 'ERR_NO_MODELS', error: '当前环境无法保存模型选择' });
          return;
        }
        let body;
        try {
          body = await readJson(req);
        } catch (e) {
          sendJson(res, 400, { ok: false, error: `JSON 解析失败: ${e.message}` });
          return;
        }
        // 局部更新：只改传上来的那几段（global / writer / polish / mode），
        // 其余沿用盘上的值。形状非法时直接拒，不要落一份半坏的配置。
        const pairOf = (input) => {
          if (input == null) return undefined;
          if (typeof input !== 'object') return null;
          return {
            provider: input.provider == null ? '' : String(input.provider).trim(),
            model: input.model == null ? '' : String(input.model).trim(),
          };
        };
        const patch = {};
        for (const key of ['global', 'writer', 'polish']) {
          const pair = pairOf(body?.[key]);
          if (pair === null) {
            sendJson(res, 400, { ok: false, error: `${key} 必须是 { provider, model }` });
            return;
          }
          if (pair) patch[key] = pair;
        }
        if (body?.mode === 'direct' || body?.mode === 'agent') patch.mode = body.mode;

        if (Object.keys(patch).length === 0) {
          sendJson(res, 400, { ok: false, error: '没有可保存的字段（global / writer / polish / mode）' });
          return;
        }

        try {
          const value = await deps.saveModels(patch);
          sendJson(res, 200, { ok: true, message: '模型选择已保存', value });
        } catch (err) {
          sendJson(res, 500, { ok: false, error: err.message });
        }
      },
    },
    {
      method: 'POST',
      kind: 'exact',
      path: `${PREFIX}/api/generate`,
      handler: async (req, res) => {
        if (!guard(req, res, ['POST'])) return;
        if (typeof deps.generate !== 'function') {
          sendJson(res, 501, {
            ok: false,
            code: 'ERR_NO_WRITER',
            error: '当前环境没有接入 llm 服务，无法生成正文',
          });
          return;
        }
        const target = currentTarget;
        if (!target) {
          sendJson(res, 400, {
            ok: false,
            code: 'ERR_NO_BLOG_ROOT',
            error: '尚未配置博客项目根目录',
          });
          return;
        }
        let body;
        try {
          body = await readJson(req);
        } catch (e) {
          sendJson(res, 400, { ok: false, error: `JSON 解析失败: ${e.message}` });
          return;
        }
        const slug = String(body?.slug ?? '').trim();
        if (!slug) {
          sendJson(res, 400, { ok: false, error: '缺少必需字段 slug' });
          return;
        }
        try {
          const value = await deps.generate({
            slug,
            store: currentStore,
            target,
            projectRoot: currentProjectRoot,
            provider: body?.provider ? String(body.provider) : undefined,
            model: body?.model ? String(body.model) : undefined,
            // 没显式传 mode 时交给已保存的选择决定，不能在这里默认成 agent。
            mode: body?.mode === 'direct' ? 'direct' : body?.mode === 'agent' ? 'agent' : undefined,
          });
          const checks = await draftChecks(slug);
          sendJson(res, 200, {
            ok: true,
            message: `已生成 ${value.bodyChars} 字正文`,
            value: { ...value, checks },
          });
        } catch (err) {
          await deps.logError?.({
            source: 'writer-sync',
            error: err,
            slug,
          });
          sendJson(res, 500, { ok: false, error: err.message });
        }
      },
    },
    {
      method: 'POST',
      kind: 'exact',
      path: `${PREFIX}/api/polish`,
      handler: async (req, res) => {
        if (!guard(req, res, ['POST'])) return;
        if (typeof deps.polish !== 'function') {
          sendJson(res, 501, {
            ok: false,
            code: 'ERR_NO_POLISHER',
            error: '当前环境没有接入润色模型，无法在面板里润色正文',
          });
          return;
        }
        const target = currentTarget;
        if (!target) {
          sendJson(res, 400, {
            ok: false,
            code: 'ERR_NO_BLOG_ROOT',
            error: '尚未配置博客项目根目录',
          });
          return;
        }
        let body;
        try {
          body = await readJson(req);
        } catch (e) {
          sendJson(res, 400, { ok: false, error: `JSON 解析失败: ${e.message}` });
          return;
        }
        const slug = String(body?.slug ?? '').trim();
        if (!slug) {
          sendJson(res, 400, { ok: false, error: '缺少必需字段 slug' });
          return;
        }
        // 要求可以为空：空就是默认的「去 AI 味、整体通顺」，但长度必须可控。
        const instruction = body?.instruction == null ? '' : String(body.instruction).trim();
        if (instruction.length > 2000) {
          sendJson(res, 400, { ok: false, error: '润色要求过长（上限 2000 字），请分几次说' });
          return;
        }
        try {
          const value = await deps.polish({
            slug,
            target,
            projectRoot: currentProjectRoot,
            instruction,
            provider: body?.provider ? String(body.provider) : undefined,
            model: body?.model ? String(body.model) : undefined,
          });
          const checks = await draftChecks(slug);
          const warn = value?.factWarning ? `；注意：${value.factWarning}` : '';
          sendJson(res, 200, {
            ok: true,
            message: `已润色（${value.beforeChars} → ${value.bodyChars} 字）${warn}`,
            value: { ...value, checks },
          });
        } catch (err) {
          await deps.logError?.({
            source: 'polish',
            error: err,
            slug,
          });
          sendJson(res, 500, { ok: false, error: err.message });
        }
      },
    },
    {
      kind: 'exact',
      path: `${PREFIX}/api/deploy`,
      handler: async (req, res) => {
        if (!guard(req, res, ['POST'])) return;
        if (deployInProgress) {
          sendJson(res, 409, {
            ok: false,
            code: 'ERR_DEPLOY_BUSY',
            message: '已有部署任务在执行，请等它结束',
            error: '已有部署任务在执行，请等它结束',
          });
          return;
        }
        const config = await readConfig();
        const deploy = describeDeploy(config, config.projectRoot || currentProjectRoot);
        const rootRaw = config.projectRoot || currentProjectRoot;
        const root = rootRaw ? path.resolve(rootRaw) : '';
        const rootExists = Boolean(root) && existsSync(root);
        if (rootRaw && !rootExists) {
          const message = `博客项目根目录已失效：${root}，请重新绑定后再部署`;
          sendJson(res, 400, { ok: false, code: 'ERR_NO_BLOG_ROOT', message, error: message });
          return;
        }
        const script = deploy.script;
        if (!script) {
          const detected = deploy.detected.script;
          const hint = detected
            ? `博客根目录检测到 ${detected}，可在「策略与路径配置」里一键绑定`
            : '尚未绑定部署脚本，先在「策略与路径配置」里填写 deploy.script';
          sendJson(res, 400, {
            ok: false,
            code: 'ERR_NO_DEPLOY_SCRIPT',
            message: hint,
            error: hint,
          });
          return;
        }
        if (!rootExists) {
          sendJson(res, 400, {
            ok: false,
            code: 'ERR_NO_BLOG_ROOT',
            message: '尚未配置有效的博客项目根目录，部署脚本没有可执行的工作目录',
            error: '尚未配置有效的博客项目根目录，部署脚本没有可执行的工作目录',
          });
          return;
        }

        deployInProgress = true;
        try {
          const plan = { build: deploy.build, script, timeoutMs: deploy.timeoutMs };
          const value = await runDeployPlan(plan, root);
          const last = value.steps[value.steps.length - 1] ?? {};
          const failedLabel = value.failedStep === 'build' ? '构建' : '部署';
          const message = value.success
            ? '站点部署完成'
            : last.timedOut
              ? `${failedLabel}脚本超时`
              : `${failedLabel}脚本退出码 ${last.code ?? '未知'}`;

          await appendDeployHistory(root, config.digestDir || '.hotspot', {
            at: new Date().toISOString(),
            success: value.success,
            failedStep: value.failedStep,
            durationMs: value.durationMs,
            build: deploy.build,
            script,
            steps: value.steps.map((step) => ({
              name: step.name,
              script: step.script,
              success: step.success,
              code: step.code,
              timedOut: step.timedOut,
              durationMs: step.durationMs,
              stdout: step.stdout.slice(-4000),
              stderr: step.stderr.slice(-4000),
            })),
          });

          sendJson(res, 200, {
            ok: true,
            success: value.success,
            message,
            value: {
              ...last,
              success: value.success,
              failedStep: value.failedStep,
              steps: value.steps,
              durationMs: value.durationMs,
              script,
              build: deploy.build,
              cwd: root,
            },
          });
        } finally {
          deployInProgress = false;
        }
      },
    },
  ];

  const allRoutes = [];
  for (const r of baseRoutes) {
    allRoutes.push(r);
    if (r.path.startsWith(PREFIX)) {
      allRoutes.push({
        ...r,
        path: r.path.replace(PREFIX, LEGACY_PREFIX),
      });
    }
  }
  return allRoutes;
}
