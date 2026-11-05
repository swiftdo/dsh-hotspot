import path from 'node:path';
import { renderBrief } from './brief.js';

/**
 * 「让 agent 写正文」的契约层 —— 只有提示词模板和产物解析，不碰磁盘、不碰模型。
 *
 * 设计取舍：模型只负责「查 + 写」，落盘与校验留在宿主侧。
 * 子代理把结果写成一份 JSON（正文 + 用到的来源原文），宿主读回来做三件事：
 *   ① 把来源登记成补料（数字闸门才认这些版本号）；
 *   ② 把正文写进草稿（保留 scaffold 生成的 frontmatter）；
 *   ③ 跑三道校验，违规照常报出来。
 * 这样模型再能胡说，也进不了「已校验通过」的状态。
 */

export const WRITER_ARTIFACT_VERSION = 1;

/** 每条来源原文最多留这么多字 —— 再多对数字比对没有增量，只是撑爆上下文。 */
export const MAX_SOURCE_CONTENT = 4000;

/** 产物文件放在 digest 目录旁边，跟 store 同生命周期。 */
export function writerArtifactPath(digestDir, slug) {
  return path.join(String(digestDir || '.hotspot'), 'writer', `${slug}.json`);
}

/**
 * 子代理的任务书。写成「可执行清单」而不是「请你写一篇」，
 * 因为后者最容易得到一篇没有出处、全是形容词的东西。
 */
export function buildWriterPrompt({
  title,
  url = '',
  sources = [],
  brief = null,
  artifactPath,
  minChars = 800,
  maxChars = 1400,
} = {}) {
  const lines = [];
  lines.push('你是技术博客作者。任务：为下面这条选题写一篇正文，并把你实际读过的来源交回来。');
  lines.push('');
  lines.push(`选题：${String(title ?? '').trim()}`);
  if (url) lines.push(`一手源：${url}`);
  lines.push('');
  if (brief) {
    // 摘要 / tags / 一手源原文节选：这些是「这篇热点现在知道什么」，
    // 子代理不必从零搜，但也绝不能把它们直接改写一遍就当交付。
    lines.push(...renderBrief(brief));
  } else {
    const list = (sources ?? []).filter((s) => s && s.url);
    if (list.length > 0) {
      lines.push('候选源（只当线索，不能当作唯一依据）：');
      for (const source of list.slice(0, 8)) {
        const name = String(source.title ?? '').trim() || source.url;
        lines.push(`- ${name} — ${source.url}`);
      }
      lines.push('');
    }
  }
  lines.push('做法：');
  lines.push('1. 先用搜索工具找 3–6 篇互相独立的报道或一手公告，逐一打开读原文，不要只看摘要。');
  lines.push('2. 同一个事实至少要有两个独立来源；只有一处提到的，写成「据报道」或干脆不写。上面给的素材只是起点，不能成段搬运。');
  lines.push('3. 不编造数字、日期、引语、人名和职位。拿不准的地方就写「尚未披露」。');
  lines.push(`4. 正文用中文，${minChars}–${maxChars} 字，Markdown。不要写一级标题（# 由宿主补），小标题用 ##。`);
  lines.push('5. 结尾用「## 参考」列出你真正读过的链接，每条一行。');
  lines.push('');
  lines.push('交付方式（必须照做，否则这次生成作废）：');
  lines.push(`把你写好的内容写成 JSON，存到：${artifactPath}`);
  lines.push('结构：');
  lines.push('{');
  lines.push('  "body": "正文 Markdown（不含一级标题）",');
  lines.push('  "sources": [');
  lines.push(`    { "url": "https://…", "title": "页面标题", "content": "从原文摘录的关键段落，最多 ${MAX_SOURCE_CONTENT} 字" }`);
  lines.push('  ]');
  lines.push('}');
  lines.push('');
  lines.push('sources 里每条都必须是你在本次任务里真正打开过的页面，content 要包含你在正文里引用的数字与事实所在的句子。');
  lines.push('除了这个 JSON 文件，不要改动项目里的任何其它文件。写完回复一句「已写入」即可。');
  return lines.join('\n');
}

/**
 * 解析产物。容忍三种常见跑偏：
 *   ① 模型把 JSON 包在 ```json 代码块里；
 *   ② 模型在 JSON 前后加了解释文字；
 *   ③ body 里自带一级标题（宿主会去掉，避免出现两个 H1）。
 */
export function parseWriterArtifact(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: false, error: '产物是空的' };

  const candidates = [];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1]);
  const brace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (brace !== -1 && lastBrace > brace) candidates.push(text.slice(brace, lastBrace + 1));
  candidates.push(text);

  for (const candidate of candidates) {
    let parsed;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object') continue;
    const body = stripH1(String(parsed.body ?? '').trim());
    if (!body) continue;
    const sources = [];
    const invalid = [];
    for (const entry of Array.isArray(parsed.sources) ? parsed.sources : []) {
      if (!entry || typeof entry !== 'object') continue;
      const url = String(entry.url ?? '').trim();
      if (!/^https?:\/\//i.test(url)) {
        invalid.push({ url, reason: '不是 http(s) 链接' });
        continue;
      }
      const content = String(entry.content ?? '').trim().slice(0, MAX_SOURCE_CONTENT);
      sources.push({
        url,
        title: String(entry.title ?? '').trim() || url,
        content,
      });
    }
    return { ok: true, body, sources, invalid };
  }
  return { ok: false, error: '产物不是合法 JSON，或 body 为空' };
}

/** 正文自带一级标题时去掉它 —— 宿主会按 frontmatter 的 title 补一个，两个 H1 会让目录结构乱掉。 */
export function stripH1(body) {
  return String(body ?? '')
    .replace(/^\s*#\s+[^\n]*\n+/, '')
    .trim();
}
