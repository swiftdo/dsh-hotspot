import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseFrontmatter, validateArticle } from './validate.js';
import { collectSupplementEvidence } from './supplement.js';
import { findCandidateDigest, pickCandidate } from './candidates.js';
import { canonicalUrl } from './normalize.js';

/**
 * 三道校验的公共入口。CLI（hotspot check）、面板（生成正文后立刻复核）
 * 和插件工具（hotspot_check / hotspot_promote）走同一段代码，
 * 免得三方对「什么算违规」有各自的说法。
 *
 * 证据边界 = 候选源原文 + 已登记的补料原文 + 配置白名单，三层叠加；
 * 这里不做任何放行判断，违规码原样返回给调用方决定怎么呈现。
 */

/** 隔天写稿时 digest 早已滚动，往回找多少天够用。 */
const CANDIDATE_LOOKBACK_DAYS = 14;

/**
 * 在单份 digest 里找候选：精确 id → slugHint → 标题。
 *
 * 后两级是给本次改动之前落的草稿留的兼容路径（那时候还没有 sources.json 的
 * candidate 字段）。它们只在 latest 里碰运气，不再退回「全部原文」。
 */
function pickFromDigest(digest, id, slug, title) {
  const items = Array.isArray(digest?.items) ? digest.items : [];
  if (id) {
    const byId = items.find((item) => item.id === id);
    if (byId) return byId;
  }
  const bySlug = items.find((item) => item.slugHint && item.slugHint === slug);
  if (bySlug) return bySlug;
  const wanted = String(title ?? '');
  return wanted ? (items.find((item) => item.title === wanted) ?? null) : null;
}

/**
 * 定位这份草稿对应的候选，以及候选当时所在的那份 digest。
 *
 * 为什么不能只用 `latest`：digest 按天滚动，`latest` 只保留最近一次抓取。
 * 昨天写的草稿今天再 check，候选已经不在 latest 里 —— 老实现这时会把当天
 * 全部 raw 当成证据边界，闸门等于没有。现在按 sources.json 记的 id 往回找，
 * 找不到就明确判违规，而不是悄悄放宽。
 *
 * @returns {{ digest: any, candidate: any, reason?: string, missingId?: string }}
 */
export async function resolveCandidate({ store, slug, title, meta, date = 'latest' }) {
  const wantedId = String(meta?.id ?? '').trim();
  const explicit = date && date !== 'latest' ? await store.loadDigest(date) : null;

  if (explicit) {
    const candidate = pickFromDigest(explicit, wantedId, slug, title);
    return candidate
      ? { digest: explicit, candidate }
      : { digest: explicit, candidate: null, reason: `指定的 ${date} digest 里找不到这条候选` };
  }

  const latest = await store.loadDigest('latest');

  if (wantedId) {
    if (latest) {
      const direct = pickCandidate(latest, wantedId);
      if (direct) return { digest: latest, candidate: direct };
    }
    if (typeof store.loadRecent === 'function') {
      const hit = findCandidateDigest(await store.loadRecent(CANDIDATE_LOOKBACK_DAYS), wantedId);
      if (hit) return { digest: hit.digest, candidate: hit.candidate };
    }
    return {
      digest: latest,
      candidate: null,
      missingId: wantedId,
      reason: `sources.json 记的候选 ${wantedId} 不在最近 ${CANDIDATE_LOOKBACK_DAYS} 天的 digest 里`,
    };
  }

  const guessed = pickFromDigest(latest, '', slug, title);
  if (guessed) return { digest: latest, candidate: guessed };

  return {
    digest: latest,
    candidate: null,
    reason: '这份草稿没有候选记录（sources.json 缺 candidate 字段），latest 里也按 slug / 标题匹配不到',
  };
}

/**
 * @param {{ target: any, store: any, slug: string, allowedHosts?: string[], allowNumbers?: string[], date?: string }} input
 */
export async function checkDraft({ target, store, slug, allowedHosts = [], allowNumbers = [], date = 'latest' }) {
  const clean = String(slug ?? '').trim();
  if (!clean) throw new Error('缺少 slug');

  const draftFile = path.join(target.draftDir, clean, 'index.md');
  const articleFile = path.join(target.articleDir, clean, 'index.md');
  const file = existsSync(draftFile) ? draftFile : articleFile;
  if (!existsSync(file)) throw new Error(`找不到 ${clean} 的 index.md`);

  const markdown = await readFile(file, 'utf8');
  const { data } = parseFrontmatter(markdown);

  // 补料先读：里面的 candidate 字段是定位候选的第一手线索
  const supplements = await target.readSupplements(clean);
  const meta = supplements.candidate ?? null;

  const { digest, candidate, reason, missingId } = await resolveCandidate({
    store,
    slug: clean,
    title: data.title,
    meta,
    date,
  });

  if (!candidate) {
    // 定位不到候选就不做数字与链接校验 —— 证据边界不明时跑出来的违规全是噪声，
    // 而把全部原文当证据才是真正的问题。这里把它变成一条明确的违规。
    const hint = missingId
      ? `先 hotspot_get ${missingId} --registerSlug 重新固化来源，或用 hotspot scaffold 重写草稿`
      : '用 hotspot scaffold 生成草稿（会把候选 id 写进 sources.json），或先补登来源';
    return {
      result: {
        ok: false,
        data,
        body: markdown,
        violations: [{ code: 'candidate-unresolved', message: `${reason}。${hint}` }],
      },
      file,
      candidate: null,
      supplements,
      digestDate: digest?.date ?? null,
    };
  }

  const raw = digest && typeof store.loadRaw === 'function' ? await store.loadRaw(digest.date) : [];

  const sourceTexts = [];
  const allowedUrls = new Set();
  for (const source of candidate.sources ?? []) {
    const url = canonicalUrl(source.url) || source.url;
    if (url) allowedUrls.add(url);
    const match = raw.find((r) => canonicalUrl(r.url) === canonicalUrl(source.url) || r.url === source.url);
    sourceTexts.push(`${source.title} ${match?.content ?? ''}`);
  }
  sourceTexts.push(candidate.title, candidate.summary ?? '');
  // 候选记录里记过来源 URL 的话一并放行：raw 可能已经被同一天的重跑覆盖，
  // 但「这篇是从这些来源写的」这个事实仍然成立。
  for (const url of meta?.sources ?? []) {
    const value = canonicalUrl(url) || url;
    if (value) allowedUrls.add(value);
  }

  const profile = await target.profile();
  const siteUrls = await target.siteUrls();

  // 补料并入证据边界：登记过的页面，其原文参与数字比对，其 URL 与域名进入白名单。
  // 这不是放宽闸门 —— 是让「读过什么」成为可审计的输入，而不是靠 --allow 手工放行。
  const evidence = collectSupplementEvidence(supplements.entries, { allowedHosts });
  sourceTexts.push(...evidence.sourceTexts);
  for (const url of evidence.allowedUrls) allowedUrls.add(url);

  const result = validateArticle({
    markdown,
    sourceTexts,
    siteUrls,
    tagVocabulary: profile.tagVocabulary,
    allowedUrls,
    allowedHosts: evidence.allowedHosts,
    allowNumbers,
  });

  return { result, file, candidate, supplements, digestDate: digest?.date ?? null };
}
