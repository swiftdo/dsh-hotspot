import { slugify } from './normalize.js';

/**
 * 「AI 起标题」的提示词与解析。
 *
 * 为什么单独一层：模型输出的形状永远不可信（有人加代码块、有人写成编号列表、
 * 有人把 slug 写成中文），而这些容错逻辑要能单测。落盘与调用模型都不在这一层。
 *
 * 标题与 slug 一起要：纯中文标题用 `slugify` 推导不出目录名（那是现有硬伤，
 * 只能退成 hotspot-1105-03），让模型顺带给一个英文 slug 正好把它补上。
 */

export const MAX_TITLE_SUGGESTIONS = 3;

/** 标题党词表：模型很爱写这些，但博客标题里它们是噪音。 */
const CLICKBAIT = /震惊|必看|干货|炸裂|重磅|速看|深度好文|不可错过|一文读懂/;

/**
 * @param {{ title?: string, url?: string, summary?: string, tags?: string[],
 *           sources?: Array<{ title?: string, url?: string, content?: string }> }} input
 */
export function buildTitlePrompt({ title = '', url = '', summary = '', tags = [], sources = [] } = {}) {
  const lines = [];
  lines.push('候选原文标题：' + String(title || '（无）').trim());
  if (url) lines.push('链接：' + String(url).trim());
  if (summary) lines.push('摘要：' + String(summary).replace(/\s+/g, ' ').trim());
  if (Array.isArray(tags) && tags.length > 0) lines.push('标签：' + tags.slice(0, 8).join(' / '));

  const excerpts = (Array.isArray(sources) ? sources : []).filter((source) => source && (source.title || source.content));
  if (excerpts.length > 0) {
    lines.push('', '一手来源：');
    for (const source of excerpts.slice(0, 4)) {
      const head = [source.title, source.url].filter(Boolean).join(' · ');
      lines.push(`- ${head}`.trim());
      const content = String(source.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 500);
      if (content) lines.push(`  ${content}`);
    }
  }

  lines.push(
    '',
    `请为这篇中文技术博客文章起 ${MAX_TITLE_SUGGESTIONS} 个标题，并给每个标题配一个英文目录名（slug）。`,
    '要求：',
    '1. 三个标题风格要不同：一个直接陈述结论，一个点出冲突或疑问，一个给出读者能拿走的判断。',
    '2. 每个标题 12–26 个汉字，具体、可读；不堆形容词，不用「震惊 / 必看 / 干货」这类标题党词。',
    '3. 只用上面材料里有的事实，不新增数字、版本号或结论。',
    '4. slug 用 3–6 个英文小写单词，连字符分隔，只含 a-z、0-9 和 -，能从标题读出主题。',
    '5. 只输出 JSON 数组，不要解释、不要代码块：',
    '[{"title":"中文标题","slug":"english-slug"}, ...]',
  );

  return lines.join('\n');
}

/** 去掉编号、项目符号、引号、加粗记号 —— 模型经常顺手加上这些。 */
function cleanTitle(value) {
  return String(value ?? '')
    .replace(/^\s*(?:[-*•]|\d+[.、)])\s*/, '')
    .replace(/^\*+|\*+$/g, '')
    .replace(/^["'“”「『]+|["'“”」』]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeEntry(entry) {
  const rawTitle = typeof entry === 'string' ? entry : entry?.title;
  const title = cleanTitle(rawTitle);
  if (!title) return null;
  const rawSlug = typeof entry === 'string' ? '' : entry?.slug;
  const slug = slugify(String(rawSlug ?? '')) || slugify(title);
  return { title, slug, clickbait: CLICKBAIT.test(title) };
}

/**
 * 从模型输出里抠出标题建议。
 *
 * 认三种写法：标准 JSON 数组、```json 代码块、逐行「1. 标题 | slug」。
 * 认不出来就返回空数组 —— 调用方据此回退原文标题，而不是把半截垃圾写进 frontmatter。
 *
 * @param {string} text
 * @param {{ limit?: number }} [opts]
 * @returns {Array<{ title: string, slug: string, clickbait: boolean }>}
 */
export function parseTitleSuggestions(text, { limit = MAX_TITLE_SUGGESTIONS } = {}) {
  const source = String(text ?? '').trim();
  if (!source) return [];

  const entries = [];
  const firstBracket = source.indexOf('[');
  const lastBracket = source.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    try {
      const parsed = JSON.parse(source.slice(firstBracket, lastBracket + 1));
      if (Array.isArray(parsed)) entries.push(...parsed);
    } catch {
      /* 落到逐行解析 */
    }
  }

  if (entries.length === 0) {
    for (const line of source.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('```')) continue;
      if (!/^(?:[-*•]|\d+[.、)])/.test(trimmed)) continue;
      const body = trimmed.replace(/^(?:[-*•]|\d+[.、)])\s*/, '');
      // 分隔符：| ｜ — – 或 「（slug: xxx）」括号写法
      const pipe = body.split(/\s*[|｜]\s*/);
      if (pipe.length >= 2) {
        entries.push({ title: pipe[0], slug: pipe.slice(1).join('-') });
        continue;
      }
      const bracketed = body.match(/^(.*?)[（(]\s*(?:slug\s*[:：]\s*)?([a-zA-Z0-9-]+)\s*[)）]\s*$/);
      if (bracketed) {
        entries.push({ title: bracketed[1], slug: bracketed[2] });
        continue;
      }
      entries.push(body);
    }
  }

  const seen = new Set();
  const out = [];
  for (const entry of entries) {
    const normalized = normalizeEntry(entry);
    if (!normalized) continue;
    if (seen.has(normalized.title)) continue;
    seen.add(normalized.title);
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}
