import path from 'node:path';
import { pickCandidate } from './core/candidates.js';
import { renderMarkdown } from './core/digest.js';
import { registerCandidateSources } from './core/supplement.js';
import { describeViolations, promoteChecked } from './core/promote.js';

/**
 * 插件的七个工具。
 *
 * 从 plugin.js 里搬出来的原因：那 500 行是「对外的能力面」，而 plugin.js 应该只剩
 * 「把 core 的端口接到宿主上」——两者混在一起时，想确认「agent 到底能做什么」得先
 * 跳过一堆装配代码。
 *
 * 依赖都是注入的：defineTool 由调用方从宿主拿（这样这个文件在测试里也能跑），
 * store / target / 目录解析 / 闸门 / 抓取全都是函数或取值器 —— 目标与 store 会随
 * 面板换绑而变，传快照会让工具一直对着旧仓库。
 */

/** collect 的 ContentBlock 形状；返回裸字符串会让宿主 post-execute 的消费方崩。 */
const textBlocks = (text) => [{ type: 'text', text: String(text ?? '') }];

export function createHotspotTools({
  defineTool,
  store,
  getTarget,
  resolveTarget,
  readProjectConfig,
  runScan,
  runCheck,
}) {
  return [
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
            if (!getTarget()) {
              registerFailed.push('尚未配置博客项目根目录');
            } else {
              // 传上候选本体：登记正文的同时把 candidate.id 记进 sources.json，
              // 之后 check 才能按 id 定位证据，而不是靠标题猜
              const outcome = await registerCandidateSources(getTarget(), registerSlug, item.sources, raw, {
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
  ];
}
