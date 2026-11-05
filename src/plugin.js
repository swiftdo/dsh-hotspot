import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { createPipeline } from './core/pipeline.js';
import { resolveSources } from './core/sources.js';
import { rankClusters } from './core/rank.js';
import { createSources } from './adapters/source-rss.js';
import { createFsStore } from './adapters/store-fs.js';
import { createMemoryStore } from './adapters/store-memory.js';
import { createVitePressTarget } from './adapters/target-vitepress.js';
import { checkDraft } from './core/checks.js';
import { promoteChecked } from './core/promote.js';
import {
  createPolisher,
  createWriter,
  listCatalog,
  readWriterConfig,
  saveWriterConfig,
} from './server/generate.js';
import { resolveRoute, resolveWriterSelection } from './core/writer-route.js';
import { createRoutes, PREFIX } from './server/api.js';
import { createJobRunner } from './server/jobs.js';
import { createSingleFlight } from './core/lock.js';
import { createErrorLog } from './server/errors.js';
import { pickDirs } from './core/project-config.js';
import { createHotspotTools } from './tools.js';

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

  /**
   * 博客仓库自己写的目录配置。宿主的插件配置里通常没有这三项，真正的目录约定
   * 往往写在仓库里（`dsh-hotspot.config.json`）—— 以前这里不读，于是 panel 显示
   * 一套目录、实际按默认目录找文件。
   */
  function readProjectDirs(root) {
    if (!root) return {};
    for (const name of ['dsh-hotspot.config.json', 'hotspot.config.json']) {
      const file = path.join(root, name);
      if (!existsSync(file)) continue;
      try {
        return JSON.parse(readFileSync(file, 'utf8'));
      } catch {
        /* 配置写坏了不该拦住插件启动：面板里会显示目录不一致 */
        return {};
      }
    }
    return {};
  }

  // 默认不提供写死目录。未配置有效 projectRoot 时进入未绑定状态，不可执行草稿落地。
  const configuredRoot = config.projectRoot ? path.resolve(config.projectRoot) : '';
  let projectRoot = '';
  let target = null;
  // 运行时目录名：面板改过之后，带 projectRoot 参数的工具调用也要跟着走，
  // 不能再用启动时的 config.articleDir（那条路径会写错目录）。
  let bootDirs = pickDirs({ panel: config, project: readProjectDirs(configuredRoot) });
  let articleDir = bootDirs.articleDir;
  let draftDir = bootDirs.draftDir;
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
  /**
   * 错误日志：跟 writer 配置同目录（跟着博客项目走），默认只留当天。
   * 放在 apply 顶层是因为工具注册失败的时间点比 webServer 注入更早。
   */
  const errorLogDir = () =>
    projectRoot ? path.join(projectRoot, currentDigestDir) : path.join(process.cwd(), currentDigestDir);
  const errorLog = createErrorLog({
    dir: errorLogDir,
    keepDays: Number(config.log?.keepDays) > 0 ? Number(config.log.keepDays) : 1,
    log,
  });
  const logError = (input) => errorLog.record(input).catch(() => {});

  const unboundStore = createMemoryStore();
  function activeStore() {
    return projectRoot ? store : unboundStore;
  }

  /**
   * 抓取入口包一层单飞：一次 run 会写当天的 digest 与 raw，两次并发会互相覆盖，
   * 候选 id（h-YYYYMMDD-NN）按排序现场分配，覆盖后「#3」可能指向另一条。
   * 面板双击、agent 连着调两次都能触发，所以挡在入口。
   *
   * runScan 定义在下面，这里先拿一个转发函数——updateRuntime 在启动早期就会被调用，
   * 直接引用常量会撞上 TDZ。
   */
  let scanHandler = null;
  const runScanOnce = createSingleFlight((limit) => scanHandler(limit), {
    message: '已有一次抓取在跑，等它结束再试',
    code: 'ERR_SCAN_BUSY',
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
    currentDigestDir = digestDir;
    // 面板刚保存的值 > 博客仓库配置 > 默认；不读博客仓库那份的话，
    // 面板顶部的目录与实际使用的目录会对不上（草稿列表空、删除说路径不对）
    const merged = pickDirs({
      panel: newConfig,
      project: readProjectDirs(projectRoot),
      fallback: {
        articleDir: config.articleDir || 'docs',
        draftDir: config.draftDir || '.drafts',
      },
    });
    articleDir = merged.articleDir;
    draftDir = merged.draftDir;
    store = createFsStore({
      dir: projectRoot ? path.join(projectRoot, digestDir) : path.join(process.cwd(), digestDir),
    });
    target = projectRoot ? createVitePressTarget({ root: projectRoot, articleDir, draftDir }) : null;
    log(`dsh-hotspot: 运行时配置已更新，projectRoot=${projectRoot || '(未配置)'}`);
    return { projectRoot, store, target, runScan: runScanOnce };
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
    // 抓完顺手清掉过期的 digest / raw（raw 是完整正文，一天几 MB）
    if (typeof activeStore().prune === 'function') {
      try {
        await activeStore().prune({ keepDays: projectConfig.store?.keepDays ?? config.keepDays ?? 30 });
      } catch {
        /* 清理失败不影响本次抓取 */
      }
    }

    return { ...result, persisted: bound, projectRoot };
  }

  // runScan 定义完了，把单飞转发函数接上真实实现
  scanHandler = runScan;

  ctx.inject(['tools'], (sctx) => {
    sctx.effect(() => {
      let disposers = [];
      try {
        const tools = createHotspotTools({
          defineTool,
          store: activeStore,
          getTarget: () => target,
          resolveTarget,
          readProjectConfig,
          runScan: runScanOnce,
          runCheck,
        });
        for (const tool of tools) disposers.push(sctx.tools.register(tool));
      } catch (error) {
        // Cordis 会把 inject 回调里的异常静默掉，这里必须自己喊出来，
        // 否则表现就是"插件加载了但工具不存在"，最难查
        void logError?.({ source: 'tools', error, message: `工具注册失败：${error?.message ?? error}` });
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
      // 后台写作任务：状态落到 <digestDir>/jobs/<slug>.json，
      // 面板刷新或宿主重启后仍能看出「上次写作失败的原因」。
      const jobs = createJobRunner({
        log,
        persist: async (job) => {
          const file = path.join(writerConfigDir(), 'jobs', `${job.slug}.json`);
          await mkdir(path.dirname(file), { recursive: true });
          await writeFile(file, `${JSON.stringify(job, null, 2)}\n`, 'utf8');
        },
      });
      for (const route of createRoutes({
        jobs,
        logError,
        readErrors: (opts) => errorLog.list(opts),
        clearErrors: (opts) => errorLog.clear(opts),
        errorFiles: () => errorLog.files(),
        errorLogToday: () => errorLog.today(),
        projectRoot,
        store,
        target,
        runScan: runScanOnce,
        onConfigUpdated: updateRuntime,
        generate: writer,
        polish: polisher,
        // 面板的模型选择：目录来自宿主的 llm 服务，选择存在 .hotspot/writer-config.json。
        // 返回 selection（global/writer/polish 完整结构）与两个用途实际解析到的路由，
        // 面板据此显示「这个用途到底会用哪个模型」。
        listModels: async () => {
          const llm = typeof ctx.get === 'function' ? ctx.get('llm') : null;
          const providers = await listCatalog(llm);
          const selection = await readWriterConfig(writerConfigDir());
          return {
            providers,
            selection,
            route: resolveRoute(providers, resolveWriterSelection(selection, 'writer')),
            routes: {
              writer: resolveRoute(providers, resolveWriterSelection(selection, 'writer')),
              polish: resolveRoute(providers, resolveWriterSelection(selection, 'polish')),
            },
          };
        },
        saveModels: async (patch) => {
          const saved = await saveWriterConfig(writerConfigDir(), patch);
          const llm = typeof ctx.get === 'function' ? ctx.get('llm') : null;
          const providers = await listCatalog(llm);
          return {
            selection: saved,
            routes: {
              writer: resolveRoute(providers, resolveWriterSelection(saved, 'writer')),
              polish: resolveRoute(providers, resolveWriterSelection(saved, 'polish')),
            },
          };
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
          void logError?.({ source: 'routes', error, context: { path: route.path } });
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
