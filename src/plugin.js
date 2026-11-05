import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { createPipeline } from './core/pipeline.js';
import { resolveSources } from './core/sources.js';
import { rankClusters } from './core/rank.js';
import { renderMarkdown } from './core/digest.js';
import { createSources } from './adapters/source-rss.js';
import { createFsStore } from './adapters/store-fs.js';
import { createMemoryStore } from './adapters/store-memory.js';
import { pickCandidate } from './core/candidates.js';
import { createVitePressTarget } from './adapters/target-vitepress.js';
import { registerCandidateSources } from './core/supplement.js';
import { checkDraft } from './core/checks.js';
import { describeViolations, promoteChecked } from './core/promote.js';
import {
  createPolisher,
  createWriter,
  listCatalog,
  readWriterSelection,
  saveWriterSelection,
} from './server/generate.js';
import { resolveRoute } from './core/writer-route.js';
import { createRoutes, PREFIX } from './server/api.js';

/**
 * DSH 插件入口。
 *
 * 接口来自已安装插件的真实源码（dsh-free-search 0.9.15 + @deepseek-ai/dsh-tools）：
 *   - 导出 `apply(ctx, config)`，不用 export default
 *   - 工具用 defineTool({ name, description, parameters, output: { schema, render }, execute })
 *   - 注册走 ctx.inject(['tools'], (sctx) => sctx.effect(() => sctx.tools.register(def)))
 *   - output.render 必须返回 ContentBlock[]，返回裸字符串会让 post-execute 的消费方崩
 *
 * 刻意不做的事：不注册 /slash 命令、不注册定时任务。
 * 前者需要猜命令 outcome 的契约；后者宿主已有「自动化任务」，让它调 hotspot_run 就行 ——
 * 少一处耦合，也就少一处随 DSH 版本改动而失效的地方。
 */

const appliedContexts = new WeakSet();

function textBlocks(text) {
  return [{ type: 'text', text: String(text ?? '') }];
}

export function apply(ctx, config = {}) {
  // 同一个 ctx 上 apply 可能被调多次（boot 重入），重复注册会撞进注册表
  if (appliedContexts.has(ctx)) {
    ctx.logger?.warn?.('dsh-hotspot: apply() 已在当前 ctx 执行过，跳过重复注册');
    return;
  }
  appliedContexts.add(ctx);

  const log = (...args) => {
    ctx.logger?.info?.(...args);
    // 宿主的 info 级日志默认不进 stdout，排查加载问题时用 verbose 打开
    if (config.verbose) console.log('[dsh-hotspot]', ...args);
  };
  const warn = ctx.logger?.warn?.bind(ctx.logger) ?? ((...args) => console.warn('[dsh-hotspot]', ...args));

  // 默认不提供写死目录。未配置有效 projectRoot 时进入未绑定状态，不可执行草稿落地。
  const configuredRoot = config.projectRoot ? path.resolve(config.projectRoot) : '';
  let projectRoot = '';
  let target = null;
  // 运行时目录名：面板改过之后，带 projectRoot 参数的工具调用也要跟着走，
  // 不能再用启动时的 config.articleDir（那条路径会写错目录）。
  let articleDir = config.articleDir;
  let draftDir = config.draftDir;
  if (configuredRoot && existsSync(configuredRoot)) {
    projectRoot = configuredRoot;
    target = createVitePressTarget({ root: projectRoot, articleDir, draftDir });
  } else if (configuredRoot) {
    ctx.logger?.warn?.(`dsh-hotspot: projectRoot 不存在（${configuredRoot}），进入未配置状态`);
  }

  const baseDigestDir = config.digestDir ?? '.hotspot';
  let currentDigestDir = baseDigestDir;
  let store = createFsStore({
    dir: projectRoot ? path.join(projectRoot, baseDigestDir) : path.join(process.cwd(), baseDigestDir),
  });

  // 未绑定根目录时用一份进程内 store：抓到的 digest 本次会话内可读（hotspot_get 照常），
  // 但不往任何目录写文件 —— 插件不该往自己没管辖权的目录写 .hotspot/。
  const unboundStore = createMemoryStore();
  function activeStore() {
    return projectRoot ? store : unboundStore;
  }

  function updateRuntime(newConfig = {}) {
    if (newConfig.projectRoot) {
      const resolved = path.resolve(newConfig.projectRoot);
      if (existsSync(resolved)) {
        projectRoot = resolved;
      } else {
        projectRoot = '';
      }
    } else if (newConfig.projectRoot === '') {
      projectRoot = '';
    }
    const digestDir = newConfig.digestDir || config.digestDir || '.hotspot';
    currentDigestDir = digestDir;
    articleDir = newConfig.articleDir || config.articleDir || 'docs';
    draftDir = newConfig.draftDir || config.draftDir || 'docs/draft';
    store = createFsStore({
      dir: projectRoot ? path.join(projectRoot, digestDir) : path.join(process.cwd(), digestDir),
    });
    target = projectRoot ? createVitePressTarget({ root: projectRoot, articleDir, draftDir }) : null;
    log(`dsh-hotspot: 运行时配置已更新，projectRoot=${projectRoot || '(未配置)'}`);
    return { projectRoot, store, target, runScan };
  }

  // 若存在工作区根目录的 dsh-hotspot.config.json 或 hotspot.config.json，尝试加载其配置
  try {
    const p1 = path.join(process.cwd(), 'dsh-hotspot.config.json');
    const p2 = path.join(process.cwd(), 'hotspot.config.json');
    const localCfgPath = existsSync(p1) ? p1 : existsSync(p2) ? p2 : null;
    if (localCfgPath) {
      const localCfg = JSON.parse(readFileSync(localCfgPath, 'utf8'));
      if (localCfg.projectRoot) {
        updateRuntime(localCfg);
      }
    }
  } catch {
    /* 忽略读取错误 */
  }

  function projectConfigPath() {
    const baseDir = projectRoot || process.cwd();
    const p1 = path.join(baseDir, 'dsh-hotspot.config.json');
    const p2 = path.join(baseDir, 'hotspot.config.json');
    return existsSync(p1) ? p1 : existsSync(p2) ? p2 : p1;
  }

  async function readProjectConfig() {
    try {
      return JSON.parse(await readFile(projectConfigPath(), 'utf8'));
    } catch {
      return {};
    }
  }

  // 扫描专用读取：配置文件坏了必须报出来。以前的实现把 JSON 解析错误吞成 {}，
  // 用户看到的是「没有配置任何 sources」，而真相是文件写坏了 —— 报错完全指错方向。
  async function readProjectConfigForScan() {
    const cfgPath = projectConfigPath();
    if (!existsSync(cfgPath)) return { config: {}, file: cfgPath };
    try {
      return { config: JSON.parse(await readFile(cfgPath, 'utf8')), file: cfgPath };
    } catch (error) {
      throw new Error(`配置文件解析失败：${cfgPath}（${error.message}）`);
    }
  }

  /**
   * 工具里指定 projectRoot 时的目标解析。返回 { target } 或 { error }。
   * 目录名用运行时值（面板改过之后启动值已经过期）。
   */
  function resolveTarget(projectRootOverride) {
    if (projectRootOverride) {
      const pr = path.resolve(String(projectRootOverride));
      if (!existsSync(pr)) return { error: `指定博客根目录不存在：${pr}` };
      return { target: createVitePressTarget({ root: pr, articleDir, draftDir }) };
    }
    if (!target) {
      return {
        error: '尚未配置博客项目根目录。请在控制面板填写博客路径，或在参数中指定 projectRoot。',
      };
    }
    return { target };
  }

  /** 跑一次闸门，把违规摊成可读字符串。工具与面板共用同一段 core/checks.js。 */
  async function runCheck(effectiveTarget, slug) {
    const cfg = await readProjectConfig();
    const report = await checkDraft({
      target: effectiveTarget,
      store: activeStore(),
      slug,
      allowedHosts: cfg.publish?.allowedHosts ?? [],
    });
    return {
      ok: report.result.ok,
      violations: report.result.violations.map((item) => `[${item.code}] ${item.message}`),
      report,
    };
  }

  async function runScan(limitOverride) {
    // 未绑定根目录不再直接抛错：能抓就抓，只是没有画像（排序退回新鲜度 + 源数），
    // digest 落在进程内存里，本次会话能读、重启就没了。
    const bound = Boolean(projectRoot);
    const { config: projectConfig, file: cfgPath } = await readProjectConfigForScan();
    // 与面板同一套判定：配置里有源用配置，一个都没有就用内置默认源。
    const { sources: sourceConfigs, mode } = resolveSources(projectConfig);
    const sources = createSources(sourceConfigs);
    if (sources.length === 0) {
      throw new Error(`没有可用的采集源：${cfgPath} 的 sources 为空，且内置默认源也没能创建`);
    }
    if (mode === 'builtin') {
      log(`dsh-hotspot: ${cfgPath} 没有配置 sources，本次使用内置默认源`);
    }

    const profile = bound && target
      ? await target.profile()
      : { tagVocabulary: [], keywords: [], articles: [] };
    const pipeline = createPipeline({
      sources,
      ranker: { rank: (clusters, c) => Promise.resolve(rankClusters(clusters, c)) },
      store: activeStore(),
      clock: { now: () => new Date() },
    });
    const result = await pipeline.run({
      profile,
      // 优先级：显式参数 > 项目配置的 rank.limit > 插件配置的 limit。
      // 以前 config.limit 在前，而 cordis.patch.yml 默认就写着 15 —— 面板里改的上限永远不生效。
      limit: limitOverride ?? projectConfig.rank?.limit ?? config.limit ?? 15,
      sinceHours: projectConfig.rank?.sinceHours ?? 36,
      clusterThreshold: projectConfig.rank?.clusterThreshold ?? 0.6,
    });
    return { ...result, persisted: bound, projectRoot };
  }

  ctx.inject(['tools'], (sctx) => {
    sctx.effect(() => {
      let disposers = [];
      try {
        disposers = [
        sctx.tools.register(
          defineTool({
            name: 'hotspot_run',
            description:
              '抓取配置文件（dsh-hotspot.config.json 或 hotspot.config.json）里配置的源（RSS / GitHub releases / Hacker News）；一个源都没配置时使用内置默认源。去重后按确定性公式排序，生成当日热点候选并落盘。返回候选表。',
            parameters: {
              limit: {
                type: 'number',
                description: '返回候选数量上限，默认 15',
              },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  markdown: { type: 'string' },
                  feedsOk: { type: 'number' },
                  feedsTotal: { type: 'number' },
                  itemsRaw: { type: 'number' },
                  itemsDeduped: { type: 'number' },
                  candidates: { type: 'number' },
                  degraded: { type: 'boolean' },
                  failedSources: { type: 'array', items: { type: 'string' } },
                  persisted: { type: 'boolean' },
                  message: { type: 'string' },
                },
              },
              render(_args, value) {
                const head = `抓取 ${value.feedsOk}/${value.feedsTotal} 源 · 原始 ${value.itemsRaw} 条 · 去重后 ${value.itemsDeduped} 条 · 候选 ${value.candidates} 条${value.degraded ? ' · 严重降级' : ''}`;
                return textBlocks(`${head}\n\n${value.markdown}${value.message ? `\n> ${value.message}` : ''}`);
              },
            },
            async execute(args) {
              const { digest, status, persisted } = await runScan(args?.limit);
              return {
                markdown: renderMarkdown(digest),
                feedsOk: status.feedsOk,
                feedsTotal: status.feedsTotal,
                itemsRaw: status.itemsRaw,
                itemsDeduped: status.itemsDeduped,
                candidates: status.candidates,
                degraded: status.degraded,
                failedSources: status.failedSources,
                persisted,
                message: persisted
                  ? ''
                  : '未绑定博客根目录：候选只存在于本次会话（不落盘），也没算入你的画像。要取原文、建草稿、跑校验，先在面板「设置」里绑定博客项目。',
              };
            },
          }),
        ),

        sctx.tools.register(
          defineTool({
            name: 'hotspot_get',
            description:
              '按候选 id（如 h-20261105-03 或 #3）读取完整条目，包含多个来源的原文。写文章前用它核对事实，不要凭记忆写版本号。读不到时按提示先跑 hotspot_run。',
            parameters: {
              id: {
                type: 'string',
                description: '候选 id（必填），可用完整 id 或序号（#3）',
              },
              registerSlug: {
                type: 'string',
                description:
                  '可选：传草稿 slug，则把该候选的全部来源原文一次性登记为补料（写正文前先固化证据账本，避免 digest 隔天滚动后来源丢失）',
              },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  found: { type: 'boolean' },
                  id: { type: 'string' },
                  title: { type: 'string' },
                  url: { type: 'string' },
                  text: { type: 'string' },
                  registered: { type: 'number' },
                  registerFailed: { type: 'array', items: { type: 'string' } },
                },
              },
              render(_args, value) {
                return textBlocks(value.text);
              },
            },
            async execute(args) {
              const scanStore = activeStore();
              const digest = await scanStore.loadDigest('latest');
              if (!digest) return { found: false, text: '还没有 digest，先跑 hotspot_run' };

              const item = pickCandidate(digest, args?.id);
              if (!item) return { found: false, text: `没有候选 ${args?.id}` };

              const raw = await scanStore.loadRaw(digest.date);
              const blocks = [`${item.id}  ${item.title}`, item.url, `分数 ${item.score}（${JSON.stringify(item.scoreParts)}）`];
              for (const source of item.sources ?? []) {
                const match = raw.find((r) => r.url === source.url);
                blocks.push(`\n## ${source.source}\n${(match?.content || source.title).slice(0, 1500)}`);
              }

              // 一键把候选的多源原文固化进草稿的证据账本：digest 会按天滚动，
              // 隔天再写这篇草稿时来源可能已经不在 latest 里了
              const registerSlug = String(args?.registerSlug ?? '').trim();
              let registered = 0;
              const registerFailed = [];
              if (registerSlug) {
                if (!target) {
                  registerFailed.push('尚未配置博客项目根目录');
                } else {
                  // 传上候选本体：登记正文的同时把 candidate.id 记进 sources.json，
                  // 之后 check 才能按 id 定位证据，而不是靠标题猜
                  const outcome = await registerCandidateSources(target, registerSlug, item.sources, raw, {
                    id: item.id,
                    url: item.url,
                  });
                  registered = outcome.registered.length;
                  for (const miss of outcome.failed) {
                    registerFailed.push(`${miss.url}（${miss.reason}）`);
                  }
                  blocks.push(
                    `\n已登记 ${registered} 条候选来源为补料（草稿 ${registerSlug}）` +
                      (registerFailed.length ? `；未登记 ${registerFailed.length} 条` : ''),
                  );
                }
              }

              return {
                found: true,
                id: item.id,
                title: item.title,
                url: item.url,
                text: blocks.join('\n'),
                registered,
                registerFailed,
              };
            },
          }),
        ),

        sctx.tools.register(
          defineTool({
            name: 'hotspot_scaffold',
            description:
              '按候选 id 在目标博客里生成草稿（docs/draft/<slug>/index.md），自带 sitemap:false，不会进博客列表也不会被搜索引擎收录。' +
              '传 body 就是一次成型：正文随草稿落盘，文件里不留占位；不传 body 只得到骨架（正文待写）。' +
              '推荐做法：先用 hotspot_get 取一手源、联网补料写好正文，再把正文传给本工具。',
            parameters: {
              id: { type: 'string', description: '候选 id（必填）' },
              slug: { type: 'string', description: '目录名；中文标题必须显式指定' },
              title: { type: 'string', description: '可选：frontmatter 与 H1 的标题（正文是中文时通常要传，避免沿用英文 RSS 标题）' },
              description: { type: 'string', description: '可选：frontmatter description（缺省取候选摘要，上限 118 字）' },
              body: { type: 'string', description: '可选：正文 Markdown（含 # 标题时原样使用；不传则写入「（正文待写）」占位）' },
              projectRoot: { type: 'string', description: '可选：博客项目根目录（未配置全局路径时必须提供）' },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  ok: { type: 'boolean' },
                  file: { type: 'string' },
                  slug: { type: 'string' },
                  bodyWritten: { type: 'boolean' },
                  violations: { type: 'array', items: { type: 'string' } },
                  message: { type: 'string' },
                },
              },
              render(_args, value) {
                if (!value.ok) return textBlocks(value.message);
                const kind = value.bodyWritten ? '草稿（含正文）' : '草稿骨架（正文待写）';
                const checks = (value.violations ?? []).length
                  ? `\n\n✖ 校验未过（${value.violations.length} 项）：\n${value.violations.join('\n')}`
                  : value.bodyWritten
                    ? '\n\n✓ 三道校验全过，可以 hotspot_promote'
                    : '';
                return textBlocks(`${kind}：${value.file}\nslug: ${value.slug}${checks}`);
              },
            },
            async execute(args) {
              const resolved = resolveTarget(args?.projectRoot);
              if (resolved.error) return { ok: false, message: resolved.error };
              const effectiveTarget = resolved.target;

              const digest = await activeStore().loadDigest('latest');
              if (!digest) return { ok: false, message: '还没有 digest，先跑 hotspot_run' };

              const item = pickCandidate(digest, args?.id);
              if (!item) return { ok: false, message: `没有候选 ${args?.id}` };

              const existing = await effectiveTarget.exists(item);
              if (existing.exists) {
                return {
                  ok: false,
                  message: `已经写过：${existing.reason}\n改稿走 hotspot_write，不要重建草稿`,
                };
              }

              const result = await effectiveTarget.scaffold(item, {
                draft: true,
                slug: args?.slug,
                title: args?.title,
                description: args?.description,
                body: args?.body,
              });

              // 正文随草稿落盘时立刻跑闸门（与 CLI scaffold 一致）：违规当场列出来，
              // 不等到 promote 才发现。骨架没正文，校验没有意义。
              let violations = [];
              if (result.bodyWritten) {
                const report = await runCheck(effectiveTarget, result.slug);
                violations = report.violations;
              }
              return {
                ok: true,
                file: result.file,
                slug: result.slug,
                bodyWritten: result.bodyWritten,
                violations,
                message: '',
              };
            },
          }),
        ),

        sctx.tools.register(
          defineTool({
            name: 'hotspot_supplement',
            description:
              '登记写正文时联网补到的证据（URL + 原文）。登记后 hotspot check 会把它的原文并入数字比对（版本号、日期不再被判成编造），并把它的域名加入外链白名单。边搜边登记，不要等 check 报错再补。',
            parameters: {
              slug: { type: 'string', description: '草稿 slug（必填）' },
              url: { type: 'string', description: '页面地址（必填，http/https）' },
              title: { type: 'string', description: '页面标题，缺省用域名' },
              content: { type: 'string', description: '页面正文或关键段落，建议 1000-3000 字；超过 4000 字会被截断' },
              kind: { type: 'string', description: 'official / blog / issue / docs / other' },
              projectRoot: { type: 'string', description: '可选：博客项目根目录（未配置全局路径时必须提供）' },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  ok: { type: 'boolean' },
                  url: { type: 'string' },
                  count: { type: 'number' },
                  file: { type: 'string' },
                  message: { type: 'string' },
                },
              },
              render(_args, value) {
                return textBlocks(
                  value.ok
                    ? `补料已登记：${value.url}\n共 ${value.count} 条 · ${value.file}`
                    : value.message,
                );
              },
            },
            async execute(args) {
              const resolved = resolveTarget(args?.projectRoot);
              if (resolved.error) return { ok: false, message: resolved.error };
              const effectiveTarget = resolved.target;
              if (!args?.url) return { ok: false, message: '缺 url' };

              try {
                const result = await effectiveTarget.addSupplement(String(args.slug ?? ''), {
                  url: String(args.url),
                  title: args.title,
                  kind: args.kind,
                  content: args.content,
                });
                return { ok: true, url: result.entry.url, count: result.entries.length, file: result.file };
              } catch (error) {
                return { ok: false, message: error instanceof Error ? error.message : String(error) };
              }
            },
          }),
        ),

        sctx.tools.register(
          defineTool({
            name: 'hotspot_check',
            description:
              '跑发布前的三道机械校验：数字字面比对、站内链接、外链白名单，外加 frontmatter 规则。改完正文就重跑，不要等到 promote 才知道。违规逐条列出（code + 说明）。',
            parameters: {
              slug: { type: 'string', description: '草稿 slug（必填）' },
              projectRoot: { type: 'string', description: '可选：博客项目根目录（未配置全局路径时必须提供）' },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  ok: { type: 'boolean' },
                  slug: { type: 'string' },
                  file: { type: 'string' },
                  digestDate: { type: 'string' },
                  evidence: { type: 'number' },
                  violations: { type: 'array', items: { type: 'string' } },
                  message: { type: 'string' },
                },
              },
              render(_args, value) {
                return textBlocks(value.message);
              },
            },
            async execute(args) {
              const slug = String(args?.slug ?? '').trim();
              const empty = { ok: false, slug, file: '', digestDate: '', evidence: 0, violations: [], message: '缺 slug' };
              if (!slug) return empty;

              const resolved = resolveTarget(args?.projectRoot);
              if (resolved.error) return { ...empty, message: resolved.error };

              const outcome = await runCheck(resolved.target, slug);
              const report = outcome.report;
              const evidence = report.supplements?.entries?.length ?? 0;
              const head = `校验 ${slug}（${path.relative(resolved.target.root, report.file)}）`;
              const boundary =
                `证据：候选 ${report.candidate?.id ?? '未定位'} · digest ${report.digestDate ?? '—'} · 补料 ${evidence} 条`;
              const message = outcome.ok
                ? `✓ 三道检查全过\n${head}\n${boundary}\n下一步：hotspot_promote ${slug}`
                : `✖ 校验未通过（${outcome.violations.length} 项）\n${head}\n${boundary}\n${outcome.violations.join('\n')}\n\n数字对不上就登记读过的那页：hotspot_supplement（url + content）；外链不认可一并登记它。`;

              return {
                ok: outcome.ok,
                slug,
                file: path.relative(resolved.target.root, report.file),
                digestDate: String(report.digestDate ?? ''),
                evidence,
                violations: outcome.violations,
                message,
              };
            },
          }),
        ),

        sctx.tools.register(
          defineTool({
            name: 'hotspot_promote',
            description:
              '把草稿转正到文章目录（去掉 sitemap:false，sources.json 一起搬）。转正前强制跑三道校验：有违规就拒绝，草稿留在 docs/draft/。不要用它绕过校验。',
            parameters: {
              slug: { type: 'string', description: '草稿 slug（必填）' },
              projectRoot: { type: 'string', description: '可选：博客项目根目录（未配置全局路径时必须提供）' },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  ok: { type: 'boolean' },
                  slug: { type: 'string' },
                  file: { type: 'string' },
                  violations: { type: 'array', items: { type: 'string' } },
                  message: { type: 'string' },
                },
              },
              render(_args, value) {
                return textBlocks(value.message);
              },
            },
            async execute(args) {
              const slug = String(args?.slug ?? '').trim();
              if (!slug) return { ok: false, slug, file: '', violations: [], message: '缺 slug' };
              const resolved = resolveTarget(args?.projectRoot);
              if (resolved.error) return { ok: false, slug, file: '', violations: [], message: resolved.error };

              const effectiveTarget = resolved.target;
              const cfg = await readProjectConfig();
              const outcome = await promoteChecked({
                target: effectiveTarget,
                store: activeStore(),
                slug,
                allowedHosts: cfg.publish?.allowedHosts ?? [],
              });

              if (!outcome.ok) {
                const violations = outcome.violations.map((v) => `[${v.code}] ${v.message}`);
                return {
                  ok: false,
                  slug,
                  file: '',
                  violations,
                  message:
                    `✖ 校验未通过（${describeViolations(outcome.violations)}），未转正；草稿仍在 ` +
                    `${path.relative(effectiveTarget.root, path.join(effectiveTarget.draftDir, slug))}\n` +
                    `${violations.join('\n')}\n\n改稿走 hotspot_write，缺证据走 hotspot_supplement，然后重跑 hotspot_check。`,
                };
              }

              const promoted = outcome.promoted;
              return {
                ok: true,
                slug,
                file: path.relative(effectiveTarget.root, promoted.file),
                violations: [],
                message:
                  `✓ 已转正：${path.relative(effectiveTarget.root, promoted.from)} → ` +
                  `${path.relative(effectiveTarget.root, promoted.to)}\n已移除 sitemap: false，文章会进博客列表与 sitemap。`,
              };
            },
          }),
        ),

        sctx.tools.register(
          defineTool({
            name: 'hotspot_write',
            description:
              '把写好的正文写进已有草稿（保留 frontmatter），写完立刻跑三道校验并返回违规清单。scaffold 只能用于新建草稿，改稿一律走它。',
            parameters: {
              slug: { type: 'string', description: '草稿 slug（必填）' },
              body: { type: 'string', description: '正文 Markdown（必填；自带 # 标题时原样使用）' },
              projectRoot: { type: 'string', description: '可选：博客项目根目录（未配置全局路径时必须提供）' },
            },
            output: {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  ok: { type: 'boolean' },
                  file: { type: 'string' },
                  chars: { type: 'number' },
                  violations: { type: 'array', items: { type: 'string' } },
                  message: { type: 'string' },
                },
              },
              render(_args, value) {
                return textBlocks(value.message);
              },
            },
            async execute(args) {
              const slug = String(args?.slug ?? '').trim();
              if (!slug) return { ok: false, file: '', chars: 0, violations: [], message: '缺 slug' };
              const resolved = resolveTarget(args?.projectRoot);
              if (resolved.error) return { ok: false, file: '', chars: 0, violations: [], message: resolved.error };
              const body = String(args?.body ?? '').trim();
              if (!body) return { ok: false, file: '', chars: 0, violations: [], message: 'body 是空的' };

              try {
                const written = await resolved.target.writeBody(slug, body);
                // 写盘就复核：改稿是迭代的，把违规当场交回去比等人去跑 check 快
                const outcome = await runCheck(resolved.target, slug);
                const head = `✓ 正文已写入 ${written.file}（${written.chars} 字）`;
                return {
                  ok: true,
                  file: written.file,
                  chars: written.chars,
                  violations: outcome.violations,
                  message: outcome.ok
                    ? `${head}\n✓ 三道校验全过，可以 hotspot_promote ${slug}`
                    : `${head}\n✖ 校验未过（${outcome.violations.length} 项）：\n${outcome.violations.join('\n')}`,
                };
              } catch (error) {
                return {
                  ok: false,
                  file: '',
                  chars: 0,
                  violations: [],
                  message: error instanceof Error ? error.message : String(error),
                };
              }
            },
          }),
        ),
        ];
      } catch (error) {
        // Cordis 会把 inject 回调里的异常静默掉，这里必须自己喊出来，
        // 否则表现就是"插件加载了但工具不存在"，最难查
        console.warn(`[dsh-hotspot] 工具注册失败：${error?.message ?? error}`);
        console.warn(error?.stack ?? '');
        return () => {};
      }

      log(
        `已注册 ${disposers.length} 个工具：hotspot_run / hotspot_get / hotspot_scaffold / hotspot_supplement / hotspot_check / hotspot_promote / hotspot_write`,
      );

      return () => {
        for (const dispose of disposers) {
          try {
            dispose?.();
          } catch (error) {
            warn(`dsh-hotspot: 卸载工具失败 ${error?.message ?? error}`);
          }
        }
      };
    });
  });

  // 管理界面：一个零依赖 HTML + 一组 JSON 接口，自行校验 loopback / 同源。
  ctx.inject(['webServer'], (sctx) => {
    sctx.effect(() => {
      const disposers = [];
      // 面板的「AI 生成正文」走宿主的子代理：模型能力、工具面、上下文都由宿主给，
      // 插件只负责编排与落盘。宿主没装 subagents 时 generate 会抛错，面板照常可用。
      // 模型选择与产物都跟着博客项目走，不能落在进程 cwd（插件可能从别处启动）。
      const writerConfigDir = () =>
        projectRoot ? path.join(projectRoot, currentDigestDir) : path.join(process.cwd(), currentDigestDir);
      const writer = createWriter({
        getSubagents: () => (typeof ctx.get === 'function' ? ctx.get('subagents') : null),
        // 面板是 HTTP 路由，没有 exec.agent；子代理要挂到一个活着的父代理上，
        // 只能从 agents 注册表取（宿主要求引用相等，不能传 id）
        getAgents: () => (typeof ctx.get === 'function' ? ctx.get('agents') : null),
        getLlm: () => (typeof ctx.get === 'function' ? ctx.get('llm') : null),
        digestDir: writerConfigDir,
        log,
      });
      // 润色只改表达，走一次 completion；模型选择与写正文共用 .hotspot/writer-config.json，
      // 免得面板里出现两套「用哪个模型」的选择。
      const polisher = createPolisher({
        getLlm: () => (typeof ctx.get === 'function' ? ctx.get('llm') : null),
        digestDir: writerConfigDir,
        log,
      });
      for (const route of createRoutes({
        projectRoot,
        store,
        target,
        runScan,
        onConfigUpdated: updateRuntime,
        generate: writer,
        polish: polisher,
        // 面板的模型下拉：目录来自宿主的 llm 服务，选择存在 .hotspot/writer-config.json。
        listModels: async () => {
          const llm = typeof ctx.get === 'function' ? ctx.get('llm') : null;
          const providers = await listCatalog(llm);
          const selection = await readWriterSelection(writerConfigDir());
          return { providers, selection, route: resolveRoute(providers, selection) };
        },
        saveModels: async (selection) => {
          const saved = await saveWriterSelection(writerConfigDir(), selection);
          const llm = typeof ctx.get === 'function' ? ctx.get('llm') : null;
          const providers = await listCatalog(llm);
          return { ...saved, route: resolveRoute(providers, saved) };
        },
        checkDraft: async (opts) => {
          const cfg = await readProjectConfig();
          return checkDraft({ ...opts, allowedHosts: cfg.publish?.allowedHosts ?? [] });
        },
        // 面板「转正」与 CLI / 插件工具共用同一道闸门（core/promote.js）
        promoteChecked: async (opts) => {
          const cfg = await readProjectConfig();
          return promoteChecked({ ...opts, allowedHosts: cfg.publish?.allowedHosts ?? [] });
        },
      })) {
        try {
          disposers.push(sctx.webServer.register(route));
        } catch (error) {
          console.warn(`[dsh-hotspot] 路由 ${route.path} 注册失败：${error?.message ?? error}`);
        }
      }
      log(`已注册 ${disposers.length} 条路由，管理页 ${PREFIX}/`);
      return () => {
        for (const dispose of disposers) {
          try {
            dispose?.();
          } catch {
            /* 卸载失败不影响主流程 */
          }
        }
      };
    });
  });

  log(`dsh-hotspot: 插件已加载，projectRoot=${projectRoot}`);

  if (config.verbose) {
    let probe = 'n/a';
    try {
      probe = typeof ctx.get === 'function' ? String(Boolean(ctx.get('tools'))) : 'no-ctx.get';
    } catch (error) {
      probe = `err:${error?.message ?? error}`;
    }
    console.log(`[dsh-hotspot] tools 服务就绪=${probe}`);
  }
}
