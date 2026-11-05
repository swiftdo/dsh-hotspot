import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { createVitePressTarget } from '../adapters/target-vitepress.js';

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

export const BUILTIN_SOURCES = [
  {
    id: 'sopilot-hottweets',
    name: 'SoPilot AI 爆款推文',
    kind: 'rss',
    url: 'https://sopilot.net/rss/hottweets',
    description: '追踪 Twitter/X 今日 AI 起爆帖，自动洞察技术前沿讨论',
  },
];

const VALID_KINDS = new Set(['rss', 'atom', 'github-release', 'hn']);

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

  function getConfigFile() {
    if (!currentProjectRoot) return '';
    const dshCfg = path.join(currentProjectRoot, 'dsh-hotspot.config.json');
    if (existsSync(dshCfg)) return dshCfg;
    const legacyCfg = path.join(currentProjectRoot, 'hotspot.config.json');
    if (existsSync(legacyCfg)) return legacyCfg;
    return dshCfg;
  }

  async function readConfig() {
    try {
      const file = getConfigFile();
      if (!file) return {};
      return JSON.parse(await readFile(file, 'utf8'));
    } catch {
      return {};
    }
  }

  async function writeConfig(config) {
    if (!currentProjectRoot) return;
    const primary = path.join(currentProjectRoot, 'dsh-hotspot.config.json');
    const legacy = path.join(currentProjectRoot, 'hotspot.config.json');
    const payload = `${JSON.stringify(config, null, 2)}\n`;
    await writeFile(primary, payload, 'utf8');
    if (existsSync(legacy)) {
      try {
        await writeFile(legacy, payload, 'utf8');
      } catch {
        /* 忽略兼容写错误 */
      }
    }
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

    const activeSources = (Array.isArray(config.sources) && config.sources.length > 0)
      ? config.sources
      : BUILTIN_SOURCES.map(({ id, name, kind, url }) => ({ id, name, kind, url }));

    return {
      configured: hasConfiguredRoot,
      projectRoot: activeProjectRoot,
      builtinSources: BUILTIN_SOURCES,
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
        sources: activeSources,
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
      },
      profile: {
        tags: (profile?.tagVocabulary || []).slice(0, 30),
        keywords: (profile?.keywords || []).slice(0, 30).map((k) => k.term),
        articleCount: (profile?.articles || []).length,
      },
      articles: (profile?.articles || [])
        .map((a) => ({
          slug: a.slug,
          title: a.title,
          tags: a.tags || [],
          date: a.date || '',
          description: a.description || '',
          file: a.file || '',
          mtime: a.mtime || 0,
        }))
        .sort((a, b) => {
          if (a.date && b.date && a.date !== b.date) return b.date.localeCompare(a.date);
          if (b.mtime !== a.mtime) return b.mtime - a.mtime;
          return a.slug.localeCompare(b.slug);
        }),
      drafts: drafts || [],
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

        const config = await readConfig();

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

        await writeConfig(config);

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
      path: `${PREFIX}/api/articles`,
      handler: async (req, res) => {
        if (!guard(req, res, ['GET'])) return;
        const state = await buildState();
        sendJson(res, 200, {
          ok: true,
          value: state.articles,
          articles: state.articles,
          drafts: state.drafts,
          total: state.articles.length,
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
          try {
            const result = await target.saveArticle(file, content);
            sendJson(res, 200, { ok: true, message: '文章保存成功', value: result });
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
