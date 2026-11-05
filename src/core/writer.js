/**
 * 正文收尾的一点点纯函数。
 *
 * 这里以前还有「子代理任务书 + 产物 JSON 解析」——那套契约随「不再用子代理」一起删了：
 * 写正文现在是一次 completion，模型直接返回 Markdown，没有产物文件要解析。
 */

/** 正文自带一级标题时去掉它 —— 宿主会按 frontmatter 的 title 补一个，两个 H1 会让目录结构乱掉。 */
export function stripH1(body) {
  return String(body ?? '')
    .replace(/^\s*#\s+[^\n]*\n+/, '')
    .trim();
}
