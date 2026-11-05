/**
 * 发布前的机械校验。三道检查都不依赖模型自觉，全部可复现：
 *
 *  1. 数字字面比对 —— 文章里出现的版本号式数字必须在一手源里出现过
 *  2. 站内链接集合 —— 必须命中站点真实存在的 URL
 *  3. 外链白名单   —— 必须来自候选源或已登记的域名
 *
 * 任何一道不过，文章只能留在 docs/draft/，不许转正。
 */

/**
 * 极简 frontmatter 解析：只认 `key: value` 与 `key:` + 缩进列表两种形态。
 * 够用即可 —— 站点真正解析的是 VitePress 自己的 YAML 解析器，这里只是为了校验。
 *
 * @param {string} markdown
 * @returns {{ data: Record<string, string | string[]>, body: string }}
 */
export function parseFrontmatter(markdown) {
  const text = String(markdown ?? '');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, body: text };

  const data = {};
  let currentKey = '';
  for (const rawLine of match[1].split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const listItem = rawLine.match(/^\s*-\s+(.*)$/);
    if (listItem && currentKey) {
      const value = unquote(listItem[1]);
      if (!Array.isArray(data[currentKey])) data[currentKey] = [];
      data[currentKey].push(value);
      continue;
    }
    const pair = rawLine.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) continue;
    currentKey = pair[1];
    const value = pair[2].trim();
    data[currentKey] = value === '' ? [] : unquote(value);
  }
  return { data, body: text.slice(match[0].length) };
}

function unquote(value) {
  const trimmed = String(value).trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * 版本号式数字：至少带一个小数点。`24.9`、`0.2.2`、`2026.11` 都会命中；
 * `18 天`、`第 3 条` 不会。
 *
 * @param {string} text
 * @returns {Set<string>}
 */
export function numberTokens(text) {
  const out = new Set();
  for (const match of String(text ?? '').matchAll(/(?<![\d.])\d+(?:\.\d+)+/g)) {
    out.add(match[0]);
  }
  return out;
}

/**
 * @param {string} body
 * @param {string[]} sourceTexts
 * @param {{ allow?: string[] }} [opts]
 */
export function checkNumbers(body, sourceTexts, opts = {}) {
  const allow = new Set(opts.allow ?? []);
  const known = new Set();
  for (const text of sourceTexts) for (const token of numberTokens(text)) known.add(token);

  const violations = [];
  for (const token of numberTokens(body)) {
    if (known.has(token) || allow.has(token)) continue;
    violations.push({
      code: 'number-not-in-source',
      message: `文章里的 ${token} 在一手源中找不到`,
    });
  }
  return violations;
}

function collectLinks(body) {
  const internal = [];
  const external = [];
  for (const match of String(body ?? '').matchAll(/\]\(([^)\s]+)\)/g)) {
    const url = match[1];
    if (url.startsWith('/')) internal.push(url);
    else if (/^https?:\/\//i.test(url)) external.push(url);
  }
  return { internal, external };
}

function variants(url) {
  const clean = url.split('#')[0].split('?')[0];
  const bare = clean.replace(/\/+$/, '');
  return [clean, bare, `${bare}/`, `${bare}/index.html`];
}

/**
 * @param {string} body
 * @param {Iterable<string>} siteUrls
 */
export function checkInternalLinks(body, siteUrls) {
  const known = new Set();
  for (const url of siteUrls) for (const v of variants(url)) known.add(v);

  const violations = [];
  for (const url of collectLinks(body).internal) {
    if (variants(url).some((v) => known.has(v))) continue;
    violations.push({ code: 'internal-link-missing', message: `站内链接不存在：${url}` });
  }
  return violations;
}

/**
 * @param {string} body
 * @param {{ allowedUrls?: Iterable<string>, allowedHosts?: Iterable<string> }} opts
 */
export function checkExternalLinks(body, opts = {}) {
  const allowedHosts = new Set(opts.allowedHosts ?? []);
  const allowedUrls = new Set();
  for (const url of opts.allowedUrls ?? []) {
    for (const v of variants(url)) allowedUrls.add(v);
  }

  const violations = [];
  for (const url of collectLinks(body).external) {
    if (variants(url).some((v) => allowedUrls.has(v))) continue;
    let host = '';
    try {
      host = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      host = '';
    }
    if (host && allowedHosts.has(host)) continue;
    violations.push({ code: 'external-link-untrusted', message: `外链不在白名单：${url}` });
  }
  return violations;
}

/**
 * @param {Record<string, any>} data
 * @param {{ tagVocabulary?: string[], maxDescription?: number }} [opts]
 */
export function checkFrontmatter(data, opts = {}) {
  const maxDescription = opts.maxDescription ?? 120;
  const vocabulary = opts.tagVocabulary ?? [];
  const violations = [];

  if (!data.title) violations.push({ code: 'fm-title', message: 'frontmatter 缺少 title' });

  const description = String(data.description ?? '');
  if (!description) violations.push({ code: 'fm-description', message: 'frontmatter 缺少 description' });
  else if ([...description].length > maxDescription) {
    violations.push({
      code: 'fm-description-length',
      message: `description 有 ${[...description].length} 字，超过 ${maxDescription}`,
    });
  }

  if (data.permalink) {
    violations.push({ code: 'fm-permalink', message: 'permalink 在 VitePress 下不生效，URL 由目录名决定' });
  }

  const date = String(data.date ?? '');
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    violations.push({ code: 'fm-date', message: `date 必须是 YYYY-MM-DD，当前是 ${date}` });
  }

  const tags = Array.isArray(data.tags) ? data.tags : [];
  if (vocabulary.length > 0) {
    for (const tag of tags) {
      if (!vocabulary.includes(tag)) {
        violations.push({ code: 'fm-tag-uncontrolled', message: `tag「${tag}」不在受控词表里` });
      }
    }
  }

  return violations;
}

/**
 * 汇总校验。sources 传候选的 cluster 原文，用于数字比对。
 *
 * @param {{
 *   markdown: string,
 *   sourceTexts?: string[],
 *   siteUrls?: Iterable<string>,
 *   tagVocabulary?: string[],
 *   allowedHosts?: Iterable<string>,
 *   allowedUrls?: Iterable<string>,
 *   allowNumbers?: string[],
 * }} input
 */
export function validateArticle(input) {
  const { data, body } = parseFrontmatter(input.markdown);
  const violations = [
    ...checkFrontmatter(data, { tagVocabulary: input.tagVocabulary }),
    ...checkNumbers(body, input.sourceTexts ?? [], { allow: input.allowNumbers }),
    ...checkInternalLinks(body, input.siteUrls ?? []),
    ...checkExternalLinks(body, {
      allowedUrls: input.allowedUrls,
      allowedHosts: input.allowedHosts,
    }),
  ];
  return { ok: violations.length === 0, violations, data, body };
}
