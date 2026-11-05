import path from 'node:path';
import { existsSync } from 'node:fs';
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
    ctx.logger?.warn?.('hotspot: apply() 已在当前 ctx 执行过，跳过重复注册');
    return;
  }
  appliedContexts.add(ctx);

  const log = (...args) => {
    ctx.logger?.info?.(...args);
    // 宿主的 info 级日志默认不进 stdout，排查加载问题时用 verbose 打开
    if (config.verbose) console.log('[hotspot]', ...args);
  };
  const warn = ctx.logger?.warn?.bind(ctx.logger) ?? ((...args) => console.warn('[hotspot]', ...args));

  // projectRoot 通常来自 cordis.patch.yml 的 config。它指向别人机器上不存在的路径时，
  // 退回 process.cwd() 并明确告警 —— 否则表现是"抓取成功但一个源都没有"，
  // 而真正的原因只是配置里的路径没改。
  const configuredRoot = config.projectRoot ? path.resolve(config.projectRoot) : '';
  let projectRoot = configuredRoot || process.cwd();
  if (configuredRoot && !existsSync(configuredRoot)) {
    ctx.logger?.warn?.(
      `hotspot: projectRoot 不存在（${configuredRoot}），已退回 ${projectRoot}。请改 cordis.patch.yml 里的 config.projectRoot`,
    );
    projectRoot = process.cwd();
  }
  const store = createFsStore({ dir: path.join(projectRoot, config.digestDir ?? '.hotspot') });
  const target = createVitePressTarget({
    root: projectRoot,
    articleDir: config.articleDir,
    draftDir: config.draftDir,
  });

  async function readProjectConfig() {
    const { readFile } = await import('node:fs/promises');
    try {
      return JSON.parse(await readFile(path.join(projectRoot, 'hotspot.config.json'), 'utf8'));
    } catch {
      return {};
    }
  }

  async function runScan(limitOverride) {
    const projectConfig = await readProjectConfig();
    const sources = createSources(projectConfig.sources ?? []);
    if (sources.length === 0) throw new Error('hotspot.config.json 里没有配置任何 sources');

    const profile = await target.profile();
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
              const digest = await store.loadDigest('latest');
              if (!digest) return { ok: false, message: '还没有 digest，先跑 hotspot_run' };

              const key = String(args?.id ?? '').replace(/^#/, '');
              const item = digest.items.find((it) => it.id.endsWith(key) || it.id.endsWith(`-${key.padStart(2, '0')}`));
              if (!item) return { ok: false, message: `没有候选 ${args?.id}` };

              const existing = await target.exists(item);
              if (existing.exists) return { ok: false, message: `已经写过：${existing.reason}` };

              const result = await target.scaffold(item, { draft: true, slug: args?.slug });
              return { ok: true, file: result.file, slug: result.slug };
            },
          }),
        ),
        ];
      } catch (error) {
        // Cordis 会把 inject 回调里的异常静默掉，这里必须自己喊出来，
        // 否则表现就是"插件加载了但工具不存在"，最难查
        console.warn(`[hotspot] 工具注册失败：${error?.message ?? error}`);
        console.warn(error?.stack ?? '');
        return () => {};
      }

      log(`已注册 ${disposers.length} 个工具：hotspot_run / hotspot_get / hotspot_scaffold`);

      return () => {
        for (const dispose of disposers) {
          try {
            dispose?.();
          } catch (error) {
            warn(`hotspot: 卸载工具失败 ${error?.message ?? error}`);
          }
        }
      };
    });
  });

  // 管理界面：一个零依赖 HTML + 一组 JSON 接口，自行校验 loopback / 同源。
  ctx.inject(['webServer'], (sctx) => {
    sctx.effect(() => {
      const disposers = [];
      for (const route of createRoutes({ projectRoot, store, target, runScan })) {
        try {
          disposers.push(sctx.webServer.register(route));
        } catch (error) {
          console.warn(`[hotspot] 路由 ${route.path} 注册失败：${error?.message ?? error}`);
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

  log(`hotspot: 插件已加载，projectRoot=${projectRoot}`);

  if (config.verbose) {
    let probe = 'n/a';
    try {
      probe = typeof ctx.get === 'function' ? String(Boolean(ctx.get('tools'))) : 'no-ctx.get';
    } catch (error) {
      probe = `err:${error?.message ?? error}`;
    }
    console.log(`[hotspot] tools 服务就绪=${probe}`);
  }
}
