import { existsSync } from 'node:fs';
import path from 'node:path';
import { canonicalUrl } from '../core/normalize.js';
import { BUILTIN_SOURCES, configuredSources, resolveSources } from '../core/sources.js';
import { describeDeploy, readDeployHistory } from './deploy.js';
import { PREFIX } from './prefix.js';

/**
 * 面板首页那块状态：配置、生效源、草稿、当天 digest 与订阅文章、后台任务。
 *
 * 它是一个大聚合：/api/state、/api/rss.xml 与面板的「今日概览」读的都是这一份。
 * 从路由文件里抽出来，是为了让「状态怎么拼」和「路由怎么注册」互不干扰；
 * 而它依赖的目标 / store / 根目录都是会随配置换绑的，所以这里要的是取值器
 * （getTarget / getStore / getProjectRoot），不能是某一刻的快照。
 */

// 「今日订阅文章」单次最多返回这么多条：raw 一天可能上千条，面板一次全给会卡。
const FEED_LIMIT = 300;

/**
 * 源的展示名：配置里有 name 就用 name；github-release / hn 没有 name，
 * 按 kind 拼一个可读的名字，实在不行退回域名，避免页面和 RSS 里直接出现源 id。
 *
 * @param {any} source
 * @returns {string}
 */
export function sourceLabel(source) {
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

/** 绝对目录 → 相对仓库根；拿不到就回空串，让调用方退回配置值。 */
function relativeDir(root, dir) {
  if (!dir) return '';
  // 已经是相对路径（测试替身或某些适配器会这么给）就原样返回
  if (!path.isAbsolute(dir)) return dir;
  if (!root) return '';
  const rel = path.relative(root, dir);
  return rel && !rel.startsWith('..') ? rel : '';
}

export function createStateBuilder({ readConfig, configFileIn, getTarget, getStore, getProjectRoot, jobs }) {
  async function buildState() {
    const config = await readConfig();
    const hasConfiguredRoot = Boolean(
      (config.projectRoot && existsSync(path.resolve(config.projectRoot))) ||
      (getProjectRoot() && existsSync(path.resolve(getProjectRoot())))
    );
    const activeProjectRoot = hasConfiguredRoot
      ? path.resolve(config.projectRoot || getProjectRoot())
      : '';

    const [profile, drafts, digest] = await Promise.all([
      getTarget()?.profile().catch(() => ({ tagVocabulary: [], keywords: [], articles: [] })),
      getTarget()?.listDrafts().catch(() => []),
      getStore()?.loadDigest('latest').catch(() => null),
    ]);

    // 有效源与扫描共用同一套判定（core/sources.js）。config.sources 只回配置文件里的
    // 真实内容（可能为空），有效集合另给 sourcesMode / activeSources —— 以前把兜底值
    // 写进 config.sources，面板于是认为内置源「已启用」，扫描却按真实配置报
    // 「没有配置任何 sources」，两边说法相反。
    const { sources: activeSources, mode: sourcesMode } = resolveSources(config);
    const sourceList = configuredSources(config);

    // digest 只留聚合后的候选；raw 里才有当天每个源的全部条目。
    // 面板据此在候选之后补一段「今日订阅文章」，候选标记出来避免重复展示。
    const rawItems = digest && typeof getStore()?.loadRaw === 'function'
      ? await getStore().loadRaw(digest.date).catch(() => [])
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
      // 以 target 的实际目录为准：它才是读写文件时用的那套路径。
      // 反过来（配置优先）会出现「面板显示 .drafts，实际去 docs/draft 找」的错觉。
      blog: {
        configured: hasConfiguredRoot,
        projectRoot: activeProjectRoot,
        articleDir: relativeDir(activeProjectRoot, getTarget()?.articleDir) || config.articleDir || 'docs/article',
        draftDir: relativeDir(activeProjectRoot, getTarget()?.draftDir) || config.draftDir || '.drafts',
        digestDir: config.digestDir || '.hotspot',
      },
      config: {
        projectRoot: config.projectRoot || '',
        articleDir: config.articleDir || 'docs',
        draftDir: config.draftDir || '.drafts',
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
        configFile: configFileIn(activeProjectRoot || getProjectRoot()),
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
      // 后台写作任务的当前状态：面板据此给草稿卡片标「写作中 / 失败可重试」。
      jobs: typeof jobs?.list === 'function' ? jobs.list() : [],
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

  return buildState;
}
