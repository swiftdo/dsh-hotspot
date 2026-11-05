/**
 * 「正文润色」的契约层 —— 纯函数：提示词、产物清洗、事实保全比对。
 *
 * 与写正文（writer.js）的区别：写正文要查要读要落来源；润色只在已有正文上做表达层的重写，
 * 一不许引入新事实，二不许丢已有事实。所以这里的核心除了提示词，就是 compareFacts：
 * 润色前后把数字、链接抽出来对一遍，缺了就在面板上报出来，让人决定要不要留。
 */

/** 喂给模型的正文上限：再长也不会因为多几千字变得更通顺，只会挤掉要求本身。 */
export const MAX_POLISH_BODY_CHARS = 24000;

/** 用户没填要求时的默认取向 —— 不是「什么都改」，而是「去 AI 味的通顺」。 */
export const DEFAULT_POLISH_INSTRUCTION = '整体润色：去掉 AI 腔和空话，像懂行的人在讲，句子长短有起伏，不要每段都同一个节奏。';

export function buildPolishPrompt({ title = '', body = '', instruction = '' } = {}) {
  const text = String(body ?? '').trim().slice(0, MAX_POLISH_BODY_CHARS);
  const ask = String(instruction ?? '').trim() || DEFAULT_POLISH_INSTRUCTION;
  const lines = [];
  lines.push('你是一名中文技术博客编辑。下面这篇草稿已经写完，你的任务是润色它，不是重写它。');
  lines.push('');
  if (title) lines.push(`文章标题：${String(title).trim()}`);
  lines.push('');
  lines.push('本次润色要求（优先执行，与下面的通用要求冲突时以它为准）：');
  lines.push(ask);
  lines.push('');
  lines.push('通用要求：');
  lines.push('1. 只改表达，不改事实。所有数字、版本号、日期、百分比、引用的原话、人名、公司名、职位、链接，必须原样保留。');
  lines.push('2. 不许新增原文没有的信息，也不许把「据报道」改成肯定句。原文没说的，润色后也不能有。');
  lines.push('3. 不丢信息：可以合并句子、删冗余的形容词和套话，但每个事实、每个论点都要还在。');
  lines.push('4. 保持结构：正文第一行的一级标题原样保留；## 小标题的层级与顺序不要动（要求里明确让调结构时才动）；文末「## 参考」里的链接一条都不能少。');
  lines.push('5. 保持中文 Markdown 排版：段落之间空一行，列表、代码块、表格语法不变；不要加新的 Markdown 语法花样。');
  lines.push('6. 篇幅与原文相当（允许 ±15%）；要求里点名要精简或扩写时按要求的幅度来。');
  lines.push('');
  lines.push('输出格式：只输出润色后的完整正文 Markdown，从一级标题那行开始。不要解释你改了什么，不要用代码围栏把整篇包起来，不要写「以下是润色后的版本」这类开场白。');
  lines.push('');
  lines.push('正文：');
  lines.push('<<<');
  lines.push(text);
  lines.push('>>>');
  return lines.join('\n');
}

/**
 * 把模型返回的东西削成「正文本身」。容忍两种常见跑偏：
 *   ① 整篇被 ```markdown 围栏包住；
 *   ② 前面加了一句「以下是润色后的正文：」。
 * 只削这两类，别的一律不动 —— 多削一刀就可能把正文第一段削掉。
 */
export function cleanPolishedBody(raw) {
  let text = String(raw ?? '').trim();
  if (!text) return '';

  const fenced = text.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i);
  if (fenced) text = fenced[1].trim();

  const preamble = /^(?:以下是|这是|下面是|润色后|修改后|已按[^\n]*?)(?:润色|修改|调整)?[^\n]{0,30}[:：]\s*\n+/;
  const stripped = text.replace(preamble, '');
  // 只有「削完还像正文」时才采纳，避免把正文第一句误判成开场白。
  if (stripped !== text && stripped.trim()) text = stripped.trim();

  return text;
}

/** 正文里是否真的还有内容：剥掉 frontmatter、一级标题、引用块与空行后看有没有字。 */
export function hasBodyContent(text, frontmatterRe = /^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/) {
  const body = String(text ?? '').replace(frontmatterRe, '');
  const kept = body
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:#|>|$)/.test(line))
    .join('')
    .trim();
  if (/（正文待写）|\(正文待写\)/.test(body) && kept.replace(/（正文待写）|\(正文待写\)/g, '').trim() === '') {
    return false;
  }
  return kept.length > 0;
}

const MAX_REPORTED = 12;

function uniqueSorted(list) {
  return [...new Set(list)].sort();
}

function capped(list) {
  return { items: list.slice(0, MAX_REPORTED), total: list.length };
}

/**
 * 润色前后的事实对照：数字与链接是最容易被「顺手改通顺」弄丢的东西，
 * 这里只报不拦 —— 拦死会让「把 3 个例子并成 2 个」这种合理润色也失败，
 * 但必须在面板上说出来，用户看一眼就知道该不该接受。
 */
export function compareFacts(before, after) {
  // 列表序号与小标题里的编号属于排版，不是事实：先削掉再比对，否则「合并两条列表」会误报数字丢失。
  const stripOrdinals = (text) => String(text ?? '').replace(/^\s*(?:#{1,6}\s*)?\d+[.)]\s+/gm, '');
  const numbersOf = (text) => uniqueSorted(stripOrdinals(text).match(/\d+(?:\.\d+)*(?:[%％]|\b)/g) ?? []);
  const urlsOf = (text) =>
    uniqueSorted((String(text ?? '').match(/https?:\/\/[^\s<>()[\]]+/g) ?? []).map((u) => u.replace(/[.,;:]+$/, '')));

  const beforeNumbers = numbersOf(before);
  const afterNumbers = numbersOf(after);
  const beforeUrls = urlsOf(before);
  const afterUrls = urlsOf(after);

  const missingNumbers = capped(beforeNumbers.filter((n) => !afterNumbers.includes(n)));
  const addedNumbers = capped(afterNumbers.filter((n) => !beforeNumbers.includes(n)));
  const missingUrls = capped(beforeUrls.filter((u) => !afterUrls.includes(u)));
  const addedUrls = capped(afterUrls.filter((u) => !beforeUrls.includes(u)));

  const ok = missingNumbers.total === 0 && addedNumbers.total === 0 && missingUrls.total === 0;
  return {
    ok,
    numbers: { missing: missingNumbers, added: addedNumbers },
    urls: { missing: missingUrls, added: addedUrls },
  };
}

/** 把比对结果压成一句人话，面板 toast 与接口 message 共用。 */
export function describeFactDiff(diff) {
  if (!diff || diff.ok) return '';
  const parts = [];
  if (diff.numbers.missing.total > 0) {
    parts.push(`少了 ${diff.numbers.missing.total} 个数字（如 ${diff.numbers.missing.items.slice(0, 3).join('、')}）`);
  }
  if (diff.numbers.added.total > 0) {
    parts.push(`多了 ${diff.numbers.added.total} 个原文没有的数字（如 ${diff.numbers.added.items.slice(0, 3).join('、')}）`);
  }
  if (diff.urls.missing.total > 0) {
    parts.push(`少了 ${diff.urls.missing.total} 条链接`);
  }
  return parts.join('；');
}
