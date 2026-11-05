#!/usr/bin/env node
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

import { createPipeline } from './core/pipeline.js';
import { rankClusters } from './core/rank.js';
import { renderMarkdown } from './core/digest.js';
import { validateArticle, parseFrontmatter } from './core/validate.js';
import { dateLabel } from './core/normalize.js';
import { createSources } from './adapters/source-rss.js';
import { createFsStore } from './adapters/store-fs.js';
import { createVitePressTarget } from './adapters/target-vitepress.js';

const USAGE = `
hotspot —— 热点采集 → 去重 → 确定性排序 → 草稿落地

  hotspot init [--root <dir>]              扫描目标项目，生成 hotspot.config.json
  hotspot run [--dry-run]                 抓取并生成 digest
  hotspot show [<date>|latest]            打印已有 digest
  hotspot scaffold <id|#3> [--slug x]     按候选生成草稿到 docs/draft/
  hotspot check <slug>                    草稿发布前三道机械校验
  hotspot promote <slug>                  草稿转正到 docs/article/
  hotspot publish <slug> [--yes]          校验 → 构建 → 提交 → 推送 → 上传
  hotspot doctor [--online] [--root <dir>] 自检：配置、目标项目、源、DSH 安装状态

  --root <dir>   目标项目根目录，默认当前目录
  --online       doctor 时真的去连每个源（会发网络请求）
`;

function parseArgs(argv) {
  const flags = new Map();
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const [key, inline] = token.slice(2).split('=');
      if (inline !== undefined) flags.set(key, inline);
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        flags.set(key, argv[i + 1]);
        i += 1;
      } else flags.set(key, true);
    } else {
      positional.push(token);
    }
  }
  return { flags, positional };
}

const { flags, positional } = parseArgs(process.argv.slice(2));
const command = positional[0];
const cwd = path.resolve(String(flags.get('root') ?? process.cwd()));

function log(...args) {
  console.log(...args);
}

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function width(text) {
  let n = 0;
  for (const ch of String(text)) n += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1;
  return n;
}

function pad(text, target) {
  const s = String(text);
  return s + ' '.repeat(Math.max(0, target - width(s)));
}

async function loadConfig() {
  const p1 = path.join(cwd, 'dsh-hotspot.config.json');
  const p2 = path.join(cwd, 'hotspot.config.json');
  const file = existsSync(p1) ? p1 : existsSync(p2) ? p2 : null;
  if (!file) fail(`找不到 dsh-hotspot.config.json 或 hotspot.config.json，先跑 dsh-hotspot init`);
  const raw = JSON.parse(await readFile(file, 'utf8'));
  const targetConfig = { root: cwd, ...(raw.target ?? {}) };
  return {
    raw,
    target: createVitePressTarget(targetConfig),
    store: createFsStore({ dir: path.resolve(cwd, raw.store?.dir ?? '.hotspot') }),
    rank: { halfLifeHours: 24, limit: 15, sinceHours: 36, clusterThreshold: 0.6, ...(raw.rank ?? {}) },
    publish: { maxPerDay: 1, autoTiers: [], allowedHosts: [], ...(raw.publish ?? {}) },
  };
}

function memoryStore() {
  let latest = null;
  return {
    dir: '(memory)',
    async saveDigest(digest) {
      latest = digest;
      return '(memory)';
    },
    async saveRaw() {},
    async loadRaw() {
      return [];
    },
    async loadDigest() {
      return latest;
    },
    async loadState(_name, fallback) {
      return fallback;
    },
    async saveState() {},
  };
}

async function cmdInit() {
  const target = createVitePressTarget({ root: cwd });
  if (!existsSync(path.join(cwd, 'docs'))) fail(`${cwd} 下没有 docs/，这不是一个 VitePress 项目`);

  const profile = await target.profile();
  const configFile = path.join(cwd, 'hotspot.config.json');
  const config = {
    target: { kind: 'vitepress', articleDir: 'docs/article', draftDir: 'docs/draft' },
    sources: [
      { id: 'dsh-releases', kind: 'github-release', repo: 'deepseek-ai/deepseek-harness' },
    ],
    rank: { halfLifeHours: 24, limit: 15, sinceHours: 36, clusterThreshold: 0.6 },
    store: { dir: '.hotspot' },
    publish: { maxPerDay: 1, autoTiers: [], allowedHosts: ['github.com'] },
  };

  if (existsSync(configFile)) {
    log(`已存在 ${path.relative(cwd, configFile)}，未覆盖`);
  } else {
    await writeFile(configFile, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    log(`✓ 写入 ${path.relative(cwd, configFile)}`);
  }

  const gitignore = path.join(cwd, '.gitignore');
  const current = existsSync(gitignore) ? await readFile(gitignore, 'utf8') : '';
  if (!/^\.hotspot\/?$/m.test(current)) {
    await writeFile(gitignore, `${current}${current.endsWith('\n') || !current ? '' : '\n'}.hotspot/\n`, 'utf8');
    log('✓ .gitignore 加入 .hotspot/');
  }

  log('');
  log(`画像归纳自 ${profile.articles.length} 篇文章 + ${profile.topDirs.length} 个目录`);
  log(`受控 tag 词表（前 12）：${profile.tagVocabulary.slice(0, 12).join('、') || '（空）'}`);
  log(`关键词：${profile.keywords.slice(0, 12).map((k) => k.term).join('、')}`);
  log('');
  log('下一步：编辑 hotspot.config.json 的 sources，然后 hotspot run --dry-run');
}

async function buildPipeline(target, store, rank) {
  const config = JSON.parse(await readFile(path.join(cwd, 'hotspot.config.json'), 'utf8'));
  if (!Array.isArray(config.sources) || config.sources.length === 0) {
    fail('config.sources 是空的，先填几个源');
  }
  const sources = createSources(config.sources);
  const ranker = { rank: (clusters, ctx) => Promise.resolve(rankClusters(clusters, { ...ctx, ...rank })) };
  const clock = { now: () => new Date() };
  return {
    config,
    pipeline: createPipeline({ sources, ranker, store, clock }),
    target,
  };
}

async function cmdRun() {
  const { target, store, rank } = await loadConfig();
  const dryRun = Boolean(flags.get('dry-run'));
  const effectiveStore = dryRun ? memoryStore() : store;
  const { pipeline, config } = await buildPipeline(target, effectiveStore, rank);
  const profile = await target.profile();

  log(`抓取中…${dryRun ? '（dry-run，不落盘）' : ''}`);
  const { digest, path: outPath } = await pipeline.run({
    profile,
    sinceHours: rank.sinceHours,
    limit: rank.limit,
    clusterThreshold: rank.clusterThreshold,
  });

  const s = digest.status;
  const health = s.degraded ? '严重降级' : s.feedsOk === s.feedsTotal ? '正常' : '部分降级';
  log('');
  log(`抓取 ${s.feedsOk}/${s.feedsTotal} 源 · 原始 ${s.itemsRaw} 条 · 去重后 ${s.itemsDeduped} 条 · 候选 ${s.candidates} 条 · ${health}`);
  if (s.failedSources.length > 0) log(`失败：${s.failedSources.join('、')}`);
  log('');

  if (digest.items.length === 0) {
    log('今天没有候选。');
  } else {
    log(`${pad('#', 4)}${pad('分', 7)}${pad('源', 4)}${pad('标题', 22)}标签`);
    for (const item of digest.items) {
      const id = item.id.slice(-2);
      log(
        `${pad(id, 4)}${pad(item.score.toFixed(1), 7)}${pad(item.sourceCount, 4)}${pad(
          [...item.title].slice(0, 26).join(''),
          34,
        )}${item.tags.slice(0, 3).join(' ')}`,
      );
    }
    log('');
    log('排序依据：3.0×log2(1+源数) + 1.5×新鲜度 + 2.0×关键词命中 − 5.0×黑名单');
  }

  if (!dryRun) log(`\n→ ${path.relative(cwd, outPath)}`);
  if (s.degraded) {
    log('\n✖ 存活源不足一半，这份候选不可信，不要据此发布');
    process.exitCode = 2;
  }
}

async function cmdShow() {
  const { store } = await loadConfig();
  const date = positional[1] ?? 'latest';
  const digest = await store.loadDigest(date);
  log(renderMarkdown(digest));
}

function pickCandidate(digest, rawId) {
  const key = String(rawId).replace(/^#/, '');
  const byId = digest.items.find((it) => it.id === key || it.id.endsWith(key) || it.id.endsWith(`-${key.padStart(2, '0')}`));
  if (byId) return byId;
  const byIndex = Number(key);
  if (Number.isInteger(byIndex) && byIndex >= 1 && byIndex <= digest.items.length) {
    return digest.items[byIndex - 1];
  }
  return null;
}

async function cmdScaffold() {
  const id = positional[1];
  if (!id) fail('用法：hotspot scaffold <id|#3>');
  const { target, store } = await loadConfig();
  const digest = await store.loadDigest(String(flags.get('date') ?? 'latest'));
  const candidate = pickCandidate(digest, id);
  if (!candidate) fail(`digest 里找不到候选 ${id}`);

  const existing = await target.exists(candidate);
  if (existing.exists) fail(`这个题已经写过了：${existing.reason}`);

  const result = await target.scaffold(candidate, { draft: true, slug: flags.get('slug') });
  log(`✓ 草稿：${path.relative(cwd, result.file)}`);
  log(`  slug: ${result.slug}`);
  log('  写完正文后：hotspot check ' + result.slug + ' → hotspot promote ' + result.slug);
}

async function runChecks(slug) {
  const { target, store, publish } = await loadConfig();
  const draftFile = path.join(target.draftDir, slug, 'index.md');
  const articleFile = path.join(target.articleDir, slug, 'index.md');
  const file = existsSync(draftFile) ? draftFile : articleFile;
  if (!existsSync(file)) fail(`找不到 ${slug} 的 index.md`);

  const markdown = await readFile(file, 'utf8');
  const digest = await store.loadDigest(String(flags.get('date') ?? 'latest'));
  const raw = typeof store.loadRaw === 'function' ? await store.loadRaw(digest.date) : [];

  const { data } = parseFrontmatter(markdown);
  const candidate =
    digest.items.find((it) => it.slugHint && it.slugHint === slug) ??
    digest.items.find((it) => it.title === String(data.title ?? ''));

  const sourceTexts = [];
  const allowedUrls = new Set();
  if (candidate) {
    for (const source of candidate.sources ?? []) {
      allowedUrls.add(source.url);
      const match = raw.find((r) => r.url === source.url);
      sourceTexts.push(`${source.title} ${match?.content ?? ''}`);
    }
    sourceTexts.push(candidate.title, candidate.summary ?? '');
  } else {
    for (const item of raw) sourceTexts.push(`${item.title} ${item.content ?? ''}`);
  }

  const profile = await target.profile();
  const siteUrls = await target.siteUrls();
  const result = validateArticle({
    markdown,
    sourceTexts,
    siteUrls,
    tagVocabulary: profile.tagVocabulary,
    allowedUrls,
    allowedHosts: publish.allowedHosts ?? [],
    allowNumbers: String(flags.get('allow') ?? '').split(',').filter(Boolean),
  });

  return { result, file, candidate };
}

async function cmdCheck() {
  const slug = positional[1];
  if (!slug) fail('用法：hotspot check <slug>');
  const { result, file } = await runChecks(slug);
  log(`校验 ${path.relative(cwd, file)}`);
  if (result.ok) {
    log('✓ 三道检查全过');
    return;
  }
  for (const v of result.violations) log(`✖ [${v.code}] ${v.message}`);
  process.exitCode = 1;
}

async function cmdPromote() {
  const slug = positional[1];
  if (!slug) fail('用法：hotspot promote <slug>');
  const { target } = await loadConfig();
  const result = await target.promote(slug);
  log(`✓ ${path.relative(cwd, result.from)} → ${path.relative(cwd, result.to)}`);
  log('  已移除 sitemap: false，文章会进博客列表与 sitemap');
}

function run(cmd, args, opts = {}) {
  log(`\n$ ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: false, ...opts });
  if (result.status !== 0) fail(`${cmd} 失败（退出码 ${result.status}）`);
}

async function cmdPublish() {
  const slug = positional[1];
  if (!slug) fail('用法：hotspot publish <slug> --yes');
  const confirmed = Boolean(flags.get('yes'));
  const { result } = await runChecks(slug);

  if (!result.ok) {
    for (const v of result.violations) log(`✖ [${v.code}] ${v.message}`);
    fail('校验未通过，不能发布');
  }

  const inDraft = existsSync(path.join(cwd, 'docs/draft', slug, 'index.md'));
  if (inDraft) fail('还在 docs/draft/，先 hotspot promote ' + slug);

  const rel = path.relative(cwd, path.join(cwd, 'docs/article', slug));
  const steps = [
    ['yarn', ['build']],
    ['git', ['add', rel]],
    ['git', ['commit', '-m', `post(auto): ${slug}`]],
    ['git', ['push', 'origin', 'HEAD']],
    ['./deploy.sh', ['--no-git', '--skip-build']],
  ];

  if (!confirmed) {
    log('将要执行（加 --yes 才会真的跑）：');
    for (const [cmd, args] of steps) log(`  ${cmd} ${args.join(' ')}`);
    log('\n注意：只 git add 这一篇文章的目录，不会 add -A，避免把工作区的半成品一起提交');
    return;
  }

  for (const [cmd, args] of steps) {
    if (cmd === './deploy.sh') {
      run('bash', ['./deploy.sh', ...args]);
    } else {
      run(cmd, args);
    }
  }
  log('\n✓ 发布完成');
}

function line(state, label, detail = '') {
  const symbol = state === 'ok' ? '✓' : state === 'warn' ? '!' : '✗';
  log(`  ${symbol} ${pad(label, 16)}${detail}`);
}

/**
 * 自检。分两层：这里能跑的是「插件外面」的一切 —— 配置、目标项目、源的连通性、
 * 有没有装进 DSH profile。真正「装进 DSH 后能不能用」要在 App 里看管理页，
 * 因为那需要 DSH 运行时。
 */
async function cmdDoctor() {
  const online = Boolean(flags.get('online'));
  const results = [];
  const add = (state, label, detail) => {
    results.push({ state, label });
    line(state, label, detail);
  };

  log(`\nhotspot doctor  ${cwd}\n`);

  let config = null;
  const configFile = path.join(cwd, 'hotspot.config.json');
  if (!existsSync(configFile)) {
    add('fail', '配置文件', '找不到 hotspot.config.json，先跑 hotspot init');
  } else {
    try {
      config = JSON.parse(await readFile(configFile, 'utf8'));
      add('ok', '配置文件', `${config.sources?.length ?? 0} 个源 · 排序参数${config.rank ? '已设置' : '用默认'}`);
    } catch (error) {
      add('fail', '配置文件', `解析失败：${error.message}`);
    }
  }

  if (!existsSync(path.join(cwd, 'docs'))) {
    add('fail', '目标项目', '当前目录下没有 docs/');
  } else {
    const target = createVitePressTarget({
      root: cwd,
      articleDir: config?.target?.articleDir,
      draftDir: config?.target?.draftDir,
    });
    const profile = await target.profile();
    add(
      profile.articles.length > 0 ? 'ok' : 'warn',
      '已发布文章',
      profile.articles.length > 0 ? `${profile.articles.length} 篇` : '0 篇，画像是空的，排序会退化成只看新鲜度',
    );
    add(
      profile.tagVocabulary.length > 0 ? 'ok' : 'warn',
      '受控 tag',
      profile.tagVocabulary.length > 0
        ? `${profile.tagVocabulary.length} 个：${profile.tagVocabulary.slice(0, 8).join('、')}`
        : '没有 tag 词表，新草稿只能用空标签',
    );
    const drafts = await target.listDrafts();
    add('ok', '草稿目录', `${path.relative(cwd, target.draftDir)}/ · ${drafts.length} 篇`);
  }

  if (Array.isArray(config?.sources)) {
    const problems = [];
    for (const source of config.sources) {
      if (!source.id) problems.push('有源缺 id');
      else if (source.kind === 'rss' || source.kind === 'atom') {
        if (!source.url) problems.push(`${source.id} 缺 url`);
      } else if (source.kind === 'github-release') {
        if (!source.repo) problems.push(`${source.id} 缺 repo`);
      } else if (source.kind !== 'hn') problems.push(`${source.id} 的 kind 未知：${source.kind}`);
    }
    add(problems.length === 0 ? 'ok' : 'fail', '源字段', problems.length ? problems.join('；') : '必需字段齐全');
  }

  if (online && Array.isArray(config?.sources) && config.sources.length > 0) {
    let sources;
    try {
      sources = createSources(config.sources);
    } catch (error) {
      add('fail', '源连通', `构造源失败：${error.message}`);
      sources = [];
    }
    if (sources.length > 0) {
      const since = new Date(Date.now() - 7 * 86400000);
      const fetched = await Promise.all(
        sources.map(async (source) => {
          try {
            const items = await source.fetch(since, { timeoutMs: 15000 });
            return { id: source.id, count: items.length, error: null };
          } catch (error) {
            return { id: source.id, count: 0, error: error.message };
          }
        }),
      );
      const okCount = fetched.filter((r) => !r.error).length;
      add(
        okCount === fetched.length ? 'ok' : okCount > 0 ? 'warn' : 'fail',
        '源连通',
        fetched.map((r) => (r.error ? `${r.id} ✗ ${r.error}` : `${r.id} ${r.count} 条`)).join(' · '),
      );
    }
  } else if (Array.isArray(config?.sources) && config.sources.length > 0) {
    add('ok', '源连通', `跳过（加 --online 会真的连一次，${config.sources.length} 个源）`);
  }

  const store = createFsStore({ dir: path.resolve(cwd, config?.store?.dir ?? '.hotspot') });
  let digest = null;
  try {
    digest = await store.loadDigest('latest');
  } catch {
    digest = null;
  }
  if (!digest) {
    add('warn', 'digest', '还没有，跑一次 hotspot run');
  } else {
    const today = dateLabel(new Date());
    add(
      digest.date === today ? 'ok' : 'warn',
      'digest',
      `${digest.date} · 候选 ${digest.items.length} 条 · 源 ${digest.status.feedsOk}/${digest.status.feedsTotal}` +
        (digest.date === today ? '' : '（不是今天的）'),
    );
  }

  const profilesDir = path.join(os.homedir(), '.dsh', 'profiles');
  if (!existsSync(profilesDir)) {
    add('warn', 'DSH 安装', '没有 ~/.dsh/profiles，这台机器上好像没装 DSH');
  } else {
    const names = (await readdir(profilesDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    const installed = [];
    for (const name of names) {
      try {
        const pkg = JSON.parse(await readFile(path.join(profilesDir, name, 'package.json'), 'utf8'));
        const bundles = pkg?.dsh?.profile?.bundles ?? [];
        const isInstalled = bundles.includes('dsh-hotspot') || bundles.includes('hotspot');
        if (!isInstalled) continue;
        const resolvable =
          existsSync(path.join(profilesDir, name, 'node_modules', 'dsh-hotspot')) ||
          existsSync(path.join(profilesDir, name, 'node_modules', 'hotspot'));
        installed.push(`${name}${resolvable ? '' : '（bundles 里有，但 node_modules 解析不到）'}`);
      } catch {
        /* 没有 package.json 的 profile 跳过 */
      }
    }
    if (installed.length === 0) {
      add('warn', 'DSH 安装', `没装进任何 profile（现有：${names.join('、') || '无'}）`);
    } else {
      add('ok', 'DSH 安装', installed.join(' · '));
    }
  }

  const failed = results.filter((r) => r.state === 'fail').length;
  const warned = results.filter((r) => r.state === 'warn').length;
  log('');
  if (failed > 0) {
    log(`✗ ${failed} 项失败${warned ? `，${warned} 项警告` : ''} —— 修掉失败项再继续`);
    process.exitCode = 1;
  } else if (warned > 0) {
    log(`! 全部通过，但有 ${warned} 项警告`);
  } else {
    log('✓ 全部通过');
  }
  log('  装进 DSH 后，还要打开 <DSH 地址>/dsh-hotspot/ 看管理页才能确认运行时可用\n');
}

async function main() {
  switch (command) {
    case 'init': return cmdInit();
    case 'run': return cmdRun();
    case 'show': return cmdShow();
    case 'scaffold': return cmdScaffold();
    case 'check': return cmdCheck();
    case 'promote': return cmdPromote();
    case 'publish': return cmdPublish();
    case 'doctor': return cmdDoctor();
    case undefined:
    case '-h':
    case '--help':
      log(USAGE);
      return;
    default:
      fail(`未知命令：${command}`);
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
