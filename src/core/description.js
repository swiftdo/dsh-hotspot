/**
 * 「按定稿标题写简介」的提示词与清洗。
 *
 * 为什么按标题写而不是沿用候选摘要：标题定稿后（通常是中文、模型起的），
 * 摘要还留着 RSS 里那段英文摘要的痕迹 —— 标题与简介各说各的。
 * 这里只做纯函数：拼提示词、把模型输出洗成能直接写进 frontmatter 的一段话。
 */

/** 与 `target-vitepress.js` 的 cleanText 上限一致：超了会被静默截断，不如在这里截明白。 */
export const DEFAULT_DESCRIPTION_MAX = 118;

/**
 * @param {{ title?: string, summary?: string, tags?: string[],
 *           sources?: Array<{ title?: string, url?: string, content?: string }> }} input
 */
export function buildDescriptionPrompt({ title = '', summary = '', tags = [], sources = [] } = {}) {
  const lines = [];
  lines.push('定稿标题：' + String(title || '（无）').trim());
  if (summary) lines.push('候选摘要：' + String(summary).replace(/\s+/g, ' ').trim());
  if (Array.isArray(tags) && tags.length > 0) lines.push('标签：' + tags.slice(0, 8).join(' / '));

  const excerpts = (Array.isArray(sources) ? sources : []).filter((source) => source && (source.title || source.content));
  if (excerpts.length > 0) {
    lines.push('', '一手来源：');
    for (const source of excerpts.slice(0, 4)) {
      const head = [source.title, source.url].filter(Boolean).join(' · ');
      lines.push(`- ${head}`.trim());
      const content = String(source.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
      if (content) lines.push(`  ${content}`);
    }
  }

  lines.push(
    '',
    '请按上面的定稿标题，为这篇中文技术博客写一段简介（frontmatter 的 description）。',
    '要求：',
    '1. 60–110 字，两句话：第一句交代事实，第二句说为什么值得读。',
    '2. 只用上面材料里有的事实，不新增数字、版本号或结论。',
    '3. 不要重复标题原句，不出现「本文」「小编」「我们」这类词。',
    '4. 不加引号、书名号，也不写「简介：」这类前缀；只输出简介正文一段话。',
  );

  return lines.join('\n');
}

/**
 * 把模型输出洗成一段能直接落盘的简介。
 *
 * 模型很爱加「简介：」前缀、给整段套引号、或者分行写成两段 —— 这些都会让
 * frontmatter 里的 `description: "..."` 变难看，或者让长度校验莫名其妙地超。
 *
 * @param {string} text
 * @param {{ max?: number }} [opts]
 */
export function cleanDescription(text, { max = DEFAULT_DESCRIPTION_MAX } = {}) {
  let out = String(text ?? '');
  // 去掉可能的 ```text 代码块围栏
  out = out.replace(/^\s*```[a-zA-Z]*\s*\n?/, '').replace(/\n?\s*```\s*$/, '');
  out = out.replace(/^\s*(?:简介|摘要|描述|description|summary)\s*[:：]\s*/i, '');
  out = out.replace(/\s+/g, ' ').trim();
  // 整段被引号 / 书名号包住：只剥外层，不动正文里的引号
  out = out.replace(/^["'“”「『《]+|["'“”」』》]+$/g, '').trim();
  if ([...out].length > max) out = [...out].slice(0, max).join('').trim();
  return out;
}
