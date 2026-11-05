import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { createVitePressTarget } from '../adapters/target-vitepress.js';
import { canonicalUrl } from '../core/normalize.js';
import { buildFeedItems, buildRssXml } from '../core/rss.js';
import { BUILTIN_SOURCES, configuredSources, resolveSources } from '../core/sources.js';

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
export const PREFIX = '/dsh-hotspot';
export const LEGACY_PREFIX = '/hotspot';
const MAX_BODY = 64 * 1024;
// 「今日订阅文章」单次最多返回这么多条：raw 一天可能上千条，面板一次全给会卡。
const FEED_LIMIT = 300;

export { BUILTIN_SOURCES };

const VALID_KINDS = new Set(['rss', 'atom', 'github-release', 'hn']);

// 站点部署：命令来自项目配置的 deploy 段（build 可选、script 必填），
// 在博客根目录下用「用户登录 shell」执行。
//
// 为什么不用 /bin/sh -c：面板跑在 DSH 进程里，GUI 从 Finder 启动时 PATH 只有
// launchd 的最小集合，yarn / nvm / corepack / ssh-agent 都不在里面。用户在终端
// 里能跑通的部署脚本，面板一点就 command not found —— 这是「部署逻辑没打通」
// 最常见的原因。用 -l 让登录 shell 重新加载用户的 PATH，与终端行为对齐。
const DEPLOY_TIMEOUT_MS = 10 * 60 * 1000;
const DEPLOY_OUTPUT_LIMIT = 64 * 1024;
const DEPLOY_HISTORY_LIMIT = 10;

function tail(text, limit = DEPLOY_OUTPUT_LIMIT) {
  if (text.length <= limit) return text;
  return `…（输出超过 ${limit} 字符，已保留末尾）\n${text.slice(-limit)}`;
}

/** 优先用用户的登录 shell；找不到就退回 /bin/sh。 */
export function resolveLoginShell() {
  for (const candidate of [process.env.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh']) {
    if (typeof candidate === 'string' && candidate.startsWith('/') && existsSync(candidate)) {
      return candidate;
    }
  }
  return '/bin/sh';
}

/**
 * 执行单条命令，永不 reject：失败也把 stdout/stderr/退出码交回给调用方。
 * @param {string} script
 * @param {string} cwd
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{ success: boolean, code: number|null, signal: string|null, stdout: string, stderr: string, durationMs: number, timedOut: boolean }>}
 */
export function runDeployScript(script, cwd, options = {}) {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEPLOY_TIMEOUT_MS;
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let timer = null;

    const finish = (code, signal, error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({
        success: !timedOut && !error && code === 0,
        code,
        signal: signal ?? null,
        stdout: tail(stdout),
        stderr: tail(stderr),
        durationMs: Date.now() - startedAt,
        timedOut,
      });
    };

    let child;
    try {
      child = spawn(resolveLoginShell(), ['-l', '-c', script], {
        cwd,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      stderr = error.message;
      finish(null, null, error);
      return;
    }

    timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* 进程可能已经退出 */
      }
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      if (stdout.length > DEPLOY_OUTPUT_LIMIT * 2) stdout = stdout.slice(-DEPLOY_OUTPUT_LIMIT);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > DEPLOY_OUTPUT_LIMIT * 2) stderr = stderr.slice(-DEPLOY_OUTPUT_LIMIT);
    });
    child.on('error', (error) => finish(null, null, error));
    child.on('close', (code, signal) => finish(code, signal));
  });
}

/**
 * 探测博客根目录里现成的部署入口，给面板一个「一键绑定」的建议值。
 * 只做只读判断，不改配置、不执行任何东西。
 */
export function detectDeployPlan(root) {
  const detected = { script: '', build: '' };
  if (!root || !existsSync(root)) return detected;

  for (const rel of ['deploy.sh', 'scripts/deploy.sh', 'bin/deploy.sh']) {
    if (existsSync(path.join(root, rel))) {
      detected.script = `./${rel}`;
      break;
    }
  }

  try {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    if (pkg?.scripts?.build) {
      if (existsSync(path.join(root, 'pnpm-lock.yaml'))) detected.build = 'pnpm run build';
      else if (existsSync(path.join(root, 'yarn.lock'))) detected.build = 'yarn build';
      else detected.build = 'npm run build';
    }
  } catch {
    /* 没有 package.json 就不是前端站点，留空即可 */
  }
  return detected;
}

/**
 * 把配置里的 deploy 段摊平成面板与接口共用的一份描述。
 * 未配置 timeoutMs 时用默认值，配置值不允许超过默认上限。
 */
export function describeDeploy(config, root) {
  const script = String(config?.deploy?.script ?? '').trim();
  const build = String(config?.deploy?.build ?? '').trim();
  const rawTimeout = Number(config?.deploy?.timeoutMs);
  const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0
    ? Math.min(Math.floor(rawTimeout), DEPLOY_TIMEOUT_MS)
    : DEPLOY_TIMEOUT_MS;
  return {
    script,
    build,
    timeoutMs,
    configured: Boolean(script),
    detected: detectDeployPlan(root),
  };
}

/**
 * 按 build → script 的顺序执行部署计划，任一步失败即停。
 * 顶层字段取「最后执行的那一步」，并额外带 steps，兼容旧的单脚本调用方。
 */
export async function runDeployPlan(plan, cwd) {
  const startedAt = Date.now();
  const steps = [];

  const runOne = async (name, script) => {
    const result = await runDeployScript(script, cwd, { timeoutMs: plan.timeoutMs });
    steps.push({ name, script, ...result });
    return result;
  };

  if (plan.build) {
    const built = await runOne('build', plan.build);
    if (!built.success) {
      return { success: false, failedStep: 'build', steps, durationMs: Date.now() - startedAt };
    }
  }

  const deployed = await runOne('deploy', plan.script);
  return {
    success: deployed.success,
    failedStep: deployed.success ? null : 'deploy',
    steps,
    durationMs: Date.now() - startedAt,
  };
}

function deployHistoryFile(root, digestDir) {
  return path.join(root, digestDir || '.hotspot', 'deploy-history.json');
}

/** 部署历史只是面板的辅助信息，读写失败不能影响部署结果本身。 */
export async function readDeployHistory(root, digestDir) {
  if (!root) return [];
  try {
    const raw = await readFile(deployHistoryFile(root, digestDir), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, DEPLOY_HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

async function appendDeployHistory(root, digestDir, entry) {
  if (!root) return [];
  const file = deployHistoryFile(root, digestDir);
  const history = [entry, ...(await readDeployHistory(root, digestDir))].slice(0, DEPLOY_HISTORY_LIMIT);
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
  } catch {
    /* 历史写不进去不影响本次部署 */
  }
  return history;
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendHtml(res, html) {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(html),
  });
  res.end(html);
}

function readJson(req) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.destroy();
        resolve(undefined);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve(undefined);
      }
    });
    req.on('error', () => resolve(undefined));
  });
}

function isLoopback(req) {
  const address = req.socket?.remoteAddress ?? '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function isAllowed(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  const host = req.headers.host;
  const origin = req.headers.origin;
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return false;
    } catch {
      return false;
    }
  }
  return isLoopback(req);
}

function guard(req, res, methods) {
  if (!isAllowed(req)) {
    sendJson(res, 403, { ok: false, message: '只接受本机同源请求' });
    return false;
  }
  if (methods && !methods.includes(req.method)) {
    sendJson(res, 405, { ok: false, message: `不支持 ${req.method}` });
    return false;
  }
  return true;
}

export async function pickNativeDirectory() {
  const platform = process.platform;
  return new Promise((resolve) => {
    if (platform === 'darwin') {
      const script = 'POSIX path of (choose folder with prompt "请选择博客项目根目录")';
      execFile('osascript', ['-e', script], { timeout: 60000 }, (error, stdout) => {
        if (error) return resolve(null);
        const dir = (stdout || '').trim();
        resolve(dir || null);
      });
    } else if (platform === 'win32') {
      const psCmd =
        '[System.Reflection.Assembly]::LoadWithPartialName("System.windows.forms") | Out-Null; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = "请选择博客项目根目录"; if($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){ Write-Output $f.SelectedPath }';
      execFile('powershell', ['-NoProfile', '-Command', psCmd], { timeout: 60000 }, (error, stdout) => {
        if (error) return resolve(null);
        const dir = (stdout || '').trim();
        resolve(dir || null);
      });
    } else {
      execFile(
        'zenity',
        ['--file-selection', '--directory', '--title=请选择博客项目根目录'],
        { timeout: 60000 },
        (error, stdout) => {
          if (error) return resolve(null);
          const dir = (stdout || '').trim();
          resolve(dir || null);
        }
      );
    }
  });
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
  async function draftChecks(slug) {
    if (typeof deps.checkDraft !== 'function') return null;
    try {
      const report = await deps.checkDraft({ target: currentTarget, store: currentStore, slug });
      return { ok: report.result.ok, violations: report.result.violations };
    } catch {
      return null;
    }
  }

/**
 * 源的展示名：配置里有 name 就用 name；github-release / hn 没有 name，
 * 按 kind 拼一个可读的名字，实在不行退回域名，避免页面和 RSS 里直接出现源 id。
 *
 * @param {any} source
 * @returns {string}
 */
function sourceLabel(source) {
  if (!source) return '';
  if (source.name) return String(source.name);
  if (source.kind === 'github-release' && source.repo) return `GitHub · ${source.repo}`;
  if (source.kind === 'hn') return 'Hacker News';
  if (source.url) {
    try {
      return new URL(String(source.url)).hostname.replace(/^www\./, '');
    } catch {
      /* 非法 url 退回 id */
    }
  }
  return String(source.id || '');
}

  async function buildState() {
    const config = await readConfig();
    const hasConfiguredRoot = Boolean(
      (config.projectRoot && existsSync(path.resolve(config.projectRoot))) ||
      (currentProjectRoot && existsSync(path.resolve(currentProjectRoot)))
    );
    const activeProjectRoot = hasConfiguredRoot
      ? path.resolve(config.projectRoot || currentProjectRoot)
      : '';

    const [profile, drafts, digest] = await Promise.all([
      currentTarget?.profile().catch(() => ({ tagVocabulary: [], keywords: [], articles: [] })),
      currentTarget?.listDrafts().catch(() => []),
      currentStore?.loadDigest('latest').catch(() => null),
    ]);

    // 有效源与扫描共用同一套判定（core/sources.js）。config.sources 只回配置文件里的
    // 真实内容（可能为空），有效集合另给 sourcesMode / activeSources —— 以前把兜底值
    // 写进 config.sources，面板于是认为内置源「已启用」，扫描却按真实配置报
    // 「没有配置任何 sources」，两边说法相反。
    const { sources: activeSources, mode: sourcesMode } = resolveSources(config);
    const sourceList = configuredSources(config);

    // digest 只留聚合后的候选；raw 里才有当天每个源的全部条目。
    // 面板据此在候选之后补一段「今日订阅文章」，候选标记出来避免重复展示。
    const rawItems = digest && typeof currentStore?.loadRaw === 'function'
      ? await currentStore.loadRaw(digest.date).catch(() => [])
      : [];
    // 源的 id → 展示名 / 源地址：面板与 RSS 都要标「这条来自哪个源」。
    const sourceNames = Object.fromEntries(
      // 配置里的源排在后面：同名 id 时以用户的配置为准，内置源只做兜底。
      [...BUILTIN_SOURCES, ...activeSources]
        .filter((source) => source && source.id)
        .map((source) => [source.id, sourceLabel(source)]),
    );
    const candidateUrls = new Set();
    for (const item of digest?.items ?? []) {
      candidateUrls.add(canonicalUrl(item.url));
      for (const source of item.sources ?? []) candidateUrls.add(canonicalUrl(source.url));
    }
    const feed = {
      date: digest?.date ?? '',
      // 候选条数按 digest 计，面板与 RSS 用同一个数，不各自去数一遍。
      candidateCount: Array.isArray(digest?.items) ? digest.items.length : 0,
      rssPath: `${PREFIX}/rss.xml`,
      items: (Array.isArray(rawItems) ? rawItems : [])
        .map((item) => ({
          id: item.id ?? '',
          title: item.title ?? '',
          url: item.url ?? '',
          source: item.source ?? '',
          sourceName: sourceNames[item.source] || item.source || '',
          sourceKind: item.sourceKind ?? '',
          publishedAt: item.publishedAt ?? '',
          summary: String(item.summary ?? '').slice(0, 200),
          candidate: candidateUrls.has(canonicalUrl(item.url)),
        }))
        .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
        .slice(0, FEED_LIMIT),
    };

    return {
      configured: hasConfiguredRoot,
      projectRoot: activeProjectRoot,
      builtinSources: BUILTIN_SOURCES,
      // 'config' = 抓配置里的源；'builtin' = 配置没写源，正在用内置默认源。
      sourcesMode,
      activeSources,
      blog: {
        configured: hasConfiguredRoot,
        projectRoot: activeProjectRoot,
        articleDir: config.articleDir || (currentTarget?.articleDir || 'docs'),
        draftDir: config.draftDir || (currentTarget?.draftDir || 'docs/draft'),
        digestDir: config.digestDir || '.hotspot',
      },
      config: {
        projectRoot: config.projectRoot || '',
        articleDir: config.articleDir || 'docs',
        draftDir: config.draftDir || 'docs/draft',
        digestDir: config.digestDir || '.hotspot',
        sources: sourceList,
        rank: {
          limit: 15,
          sinceHours: 36,
          halfLifeHours: 24,
          clusterThreshold: 0.6,
          ...(config.rank ?? {}),
        },
        publish: {
          maxPerDay: 3,
          allowedHosts: ['sopilot.net', 'github.com'],
          autoTiers: ['tier-1', 'tier-2'],
          ...(config.publish ?? {}),
        },
        // 面板据此显示「配置保存到哪个文件」，避免用户保存后不知道写去了哪里。
        configFile: configFileIn(activeProjectRoot || currentProjectRoot),
        // deploy.script 为空时面板不渲染「部署站点」按钮 —— 没绑定命令就不给入口。
        // detected 只是只读探测出来的建议值，面板可据此一键绑定。
        deploy: {
          ...describeDeploy(config, activeProjectRoot),
          history: await readDeployHistory(activeProjectRoot, config.digestDir || '.hotspot'),
        },
      },
      profile: {
        tags: (profile?.tagVocabulary || []).slice(0, 30),
        keywords: (profile?.keywords || []).slice(0, 30).map((k) => k.term),
        articleCount: (profile?.articles || []).length,
      },
      // 插件管辖范围明确收敛至草稿（生成、修改、转正、删除），不将已发布文章作为管理对象
      articles: (drafts || []).map((d) => ({
        ...d,
        isDraft: true,
        status: 'draft',
      })),
      drafts: drafts || [],
      feed,
      digest: digest
        ? {
            date: digest.date,
            generatedAt: digest.generatedAt,
            status: digest.status,
            items: digest.items.map((it) => ({
              id: it.id,
              title: it.title,
              url: it.url,
              score: it.score,
              scoreParts: it.scoreParts,
              sourceCount: it.sourceCount,
              tags: it.tags,
              slugHint: it.slugHint,
              summary: it.summary,
              sources: it.sources,
            })),
          }
        : null,
    };
  }

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
          config.draftDir = String(body.draftDir).trim() || 'docs/draft';
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
            draftDir: config.draftDir || 'docs/draft',
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
                  draftDir: config.draftDir || 'docs/draft',
                });
        }

        if (!targetRoot || !effectiveTarget) {
          return sendJson(res, 400, {
            ok: false,
            code: 'ERR_NO_BLOG_ROOT',
            message: '未配置博客项目路径。必须在控制面板中配置博客根目录，或在生成草稿请求中提供 projectRoot。',
          });
        }

        try {
          const existing = await effectiveTarget.exists(item);
          if (existing.exists) return sendJson(res, 409, { ok: false, message: `已经写过：${existing.reason}` });
          const result = await effectiveTarget.scaffold(item, { draft: true, slug: body.slug });
          sendJson(res, 200, { ok: true, value: result });
        } catch (error) {
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
          let picked = null;
          if (typeof deps.pickDirectory === 'function') {
            picked = await deps.pickDirectory();
          } else {
            picked = await pickNativeDirectory();
          }
          sendJson(res, 200, { ok: true, path: picked });
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
          const normalizedFile = String(file).replace(/\\/g, '/');
          if (!normalizedFile.includes('draft') && !normalizedFile.includes('docs/draft')) {
            sendJson(res, 403, {
              ok: false,
              code: 'ERR_ARTICLE_PROTECTED',
              error: '超出管辖范围：已发布文章受保护，插件仅支持修改草稿（docs/draft）下的文件',
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
        try {
          const resPromote = await target.promote(slug);
          sendJson(res, 200, { ok: true, message: '草稿已成功转正发布', value: resPromote });
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
        const normalizedFile = String(file).replace(/\\/g, '/');
        if (!normalizedFile.includes('draft') && !normalizedFile.includes('docs/draft')) {
          sendJson(res, 403, {
            ok: false,
            code: 'ERR_ARTICLE_PROTECTED',
            error: '超出管辖范围：已发布文章受保护，插件仅支持删除草稿（docs/draft）下的文件',
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
              value: { providers: [], selection: { provider: '', model: '', mode: 'agent' }, route: null },
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
        try {
          const value = await deps.saveModels({
            provider: body?.provider ? String(body.provider) : '',
            model: body?.model ? String(body.model) : '',
            // 没显式传 mode 时交给已保存的选择决定，不能在这里默认成 agent。
            mode: body?.mode === 'direct' ? 'direct' : body?.mode === 'agent' ? 'agent' : undefined,
          });
          sendJson(res, 200, { ok: true, message: '写作模型已保存', value });
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
            error: '当前环境没有接入写作子代理，无法在面板里生成正文',
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
