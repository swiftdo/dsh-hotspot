import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseFrontmatter, validateArticle } from './validate.js';
import { collectSupplementEvidence } from './supplement.js';

/**
 * 三道校验的公共入口。CLI（hotspot check）和面板（生成正文后立刻复核）走同一段代码，
 * 免得两边对「什么算违规」有各自的说法。
 *
 * 证据边界 = 候选源原文 + 已登记的补料原文 + 配置白名单，三层叠加；
 * 这里不做任何放行判断，违规码原样返回给调用方决定怎么呈现。
 */
export async function checkDraft({ target, store, slug, allowedHosts = [], allowNumbers = [], date = 'latest' }) {
  const clean = String(slug ?? '').trim();
  if (!clean) throw new Error('缺少 slug');

  const draftFile = path.join(target.draftDir, clean, 'index.md');
  const articleFile = path.join(target.articleDir, clean, 'index.md');
  const file = existsSync(draftFile) ? draftFile : articleFile;
  if (!existsSync(file)) throw new Error(`找不到 ${clean} 的 index.md`);

  const markdown = await readFile(file, 'utf8');
  const digest = await store.loadDigest(date);
  const raw = typeof store.loadRaw === 'function' ? await store.loadRaw(digest.date) : [];

  const { data } = parseFrontmatter(markdown);
  const candidate =
    digest.items.find((it) => it.slugHint && it.slugHint === clean) ??
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

  // 补料并入证据边界：登记过的页面，其原文参与数字比对，其 URL 与域名进入白名单。
  // 这不是放宽闸门 —— 是让「读过什么」成为可审计的输入，而不是靠 --allow 手工放行。
  const supplements = await target.readSupplements(clean);
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

  return { result, file, candidate, supplements };
}
