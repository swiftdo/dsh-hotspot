import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { createPipeline } from './core/pipeline.js';
import { rankClusters } from './core/rank.js';
import { renderMarkdown } from './core/digest.js';
import { createSources } from './adapters/source-rss.js';
import { createFsStore } from './adapters/store-fs.js';
import { createVitePressTarget } from './adapters/target-vitepress.js';
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
  if (configuredRoot && existsSync(configuredRoot)) {
    projectRoot = configuredRoot;
    target = createVitePressTarget({
      root: projectRoot,
      articleDir: config.articleDir,
      draftDir: config.draftDir,
    });
  } else if (configuredRoot) {
    ctx.logger?.warn?.(`dsh-hotspot: projectRoot 不存在（${configuredRoot}），进入未配置状态`);
  }

  const baseDigestDir = config.digestDir ?? '.hotspot';
  let store = createFsStore({
    dir: projectRoot ? path.join(projectRoot, baseDigestDir) : path.join(process.cwd(), baseDigestDir),
  });

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
    const articleDir = newConfig.articleDir || config.articleDir || 'docs';
    const draftDir = newConfig.draftDir || config.draftDir || 'docs/draft';
    store = createFsStore({
      dir: projectRoot ? path.join(projectRoot, digestDir) : path.join(process.cwd(), digestDir),
    });
    target = projectRoot
      ? createVitePressTarget({
          root: projectRoot,
          articleDir,
          draftDir,
        })
      : null;
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

  async function readProjectConfig() {
    try {
      const baseDir = projectRoot || process.cwd();
      const p1 = path.join(baseDir, 'dsh-hotspot.config.json');
      const p2 = path.join(baseDir, 'hotspot.config.json');
      const cfgPath = existsSync(p1) ? p1 : existsSync(p2) ? p2 : p1;
      return JSON.parse(await readFile(cfgPath, 'utf8'));
    } catch {
      return {};
    }
  }

  async function runScan(limitOverride) {
    const projectConfig = await readProjectConfig();
    const sources = createSources(projectConfig.sources ?? []);
    if (sources.length === 0) throw new Error('hotspot.config.json 里没有配置任何 sources');

    const profile = target
      ? await target.profile()
      : { tagVocabulary: [], keywords: [], articles: [] };
    const pipeline = createPipeline({
      sources,
      ranker: { rank: (clusters, c) => Promise.resolve(rankClusters(clusters, c)) },
      store,
      clock: { now: () => new Date() },
    });
    return pipeline.run({
      profile,
      limit: limitOverride ?? config.limit ?? projectConfig.rank?.limit ?? 15,
      sinceHours: projectConfig.rank?.sinceHours ?? 36,
      clusterThreshold: projectConfig.rank?.clusterThreshold ?? 0.6,
    });
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
              '抓取 hotspot.config.json 里配置的所有源（RSS / GitHub releases / Hacker News），去重后按确定性公式排序，生成当日热点候选并落盘。返回候选表。',
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
                },
              },
              render(_args, value) {
                const head = `抓取 ${value.feedsOk}/${value.feedsTotal} 源 · 原始 ${value.itemsRaw} 条 · 去重后 ${value.itemsDeduped} 条 · 候选 ${value.candidates} 条${value.degraded ? ' · 严重降级' : ''}`;
                return textBlocks(`${head}\n\n${value.markdown}`);
              },
            },
            async execute(args) {
              const { digest, status } = await runScan(args?.limit);
              return {
                markdown: renderMarkdown(digest),
                feedsOk: status.feedsOk,
                feedsTotal: status.feedsTotal,
                itemsRaw: status.itemsRaw,
                itemsDeduped: status.itemsDeduped,
                candidates: status.candidates,
                degraded: status.degraded,
                failedSources: status.failedSources,
              };
            },
          }),
        ),

        sctx.tools.register(
          defineTool({
            name: 'hotspot_get',
            description:
              '按候选 id（如 h-20261105-03 或 #3）读取完整条目，包含多个来源的原文。写文章前用它核对事实，不要凭记忆写版本号。',
            parameters: {
              id: {
                type: 'string',
                description: '候选 id（必填），可用完整 id 或序号（#3）',
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
                },
              },
              render(_args, value) {
                return textBlocks(value.text);
              },
            },
            async execute(args) {
              const digest = await store.loadDigest('latest');
              if (!digest) return { found: false, text: '还没有 digest，先跑 hotspot_run' };

              const key = String(args?.id ?? '').replace(/^#/, '');
              const item =
                digest.items.find((it) => it.id === key || it.id.endsWith(key) || it.id.endsWith(`-${key.padStart(2, '0')}`)) ??
                (Number(key) >= 1 && Number(key) <= digest.items.length ? digest.items[Number(key) - 1] : null);
              if (!item) return { found: false, text: `没有候选 ${args?.id}` };

              const raw = await store.loadRaw(digest.date);
              const blocks = [`${item.id}  ${item.title}`, item.url, `分数 ${item.score}（${JSON.stringify(item.scoreParts)}）`];
              for (const source of item.sources ?? []) {
                const match = raw.find((r) => r.url === source.url);
                blocks.push(`\n## ${source.source}\n${(match?.content || source.title).slice(0, 1500)}`);
              }
              return {
                found: true,
                id: item.id,
                title: item.title,
                url: item.url,
                text: blocks.join('\n'),
              };
            },
          }),
        ),

        sctx.tools.register(
          defineTool({
            name: 'hotspot_scaffold',
            description:
              '按候选 id 在目标博客里生成草稿骨架（docs/draft/<slug>/index.md），自带 sitemap:false，不会进博客列表也不会被搜索引擎收录。',
            parameters: {
              id: { type: 'string', description: '候选 id（必填）' },
              slug: { type: 'string', description: '目录名；中文标题必须显式指定' },
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
                  message: { type: 'string' },
                },
              },
              render(_args, value) {
                return textBlocks(value.ok ? `草稿已生成：${value.file}\nslug: ${value.slug}` : value.message);
              },
            },
            async execute(args) {
              let effectiveTarget = target;
              if (args?.projectRoot) {
                const pr = path.resolve(args.projectRoot);
                if (!existsSync(pr)) {
                  return { ok: false, message: `指定博客根目录不存在：${pr}` };
                }
                effectiveTarget = createVitePressTarget({
                  root: pr,
                  articleDir: config.articleDir || 'docs',
                  draftDir: config.draftDir || 'docs/draft',
                });
              }
              if (!effectiveTarget) {
                return {
                  ok: false,
                  message: '尚未配置博客项目根目录。请在控制面板填写博客路径，或在参数中指定 projectRoot。',
                };
              }

              const digest = await store.loadDigest('latest');
              if (!digest) return { ok: false, message: '还没有 digest，先跑 hotspot_run' };

              const key = String(args?.id ?? '').replace(/^#/, '');
              const item =
                digest.items.find((it) => it.id === key || it.id.endsWith(key) || it.id.endsWith(`-${key.padStart(2, '0')}`)) ??
                (Number(key) >= 1 && Number(key) <= digest.items.length ? digest.items[Number(key) - 1] : null);
              if (!item) return { ok: false, message: `没有候选 ${args?.id}` };

              const existing = await effectiveTarget.exists(item);
              if (existing.exists) return { ok: false, message: `已经写过：${existing.reason}` };

              const result = await effectiveTarget.scaffold(item, { draft: true, slug: args?.slug });
              return { ok: true, file: result.file, slug: result.slug };
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

      log(`已注册 ${disposers.length} 个工具：hotspot_run / hotspot_get / hotspot_scaffold`);

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
      for (const route of createRoutes({
        projectRoot,
        store,
        target,
        runScan,
        onConfigUpdated: updateRuntime,
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
