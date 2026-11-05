/**
 * 归一化：URL 规范化、标题比对键、slug。
 *
 * 这里的每个函数都必须是纯函数 —— 去重质量全靠它们，
 * 有 IO 就没法用夹具跑回归。
 */

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'ref_src', 'referrer', 'fbclid', 'gclid', 'msclkid', 'spm',
  'share', 'share_token', 'from', 'source', 'src', 'campaign',
]);

/**
 * @param {string} raw
 * @returns {string}
 */
export function canonicalUrl(raw) {
  const input = String(raw ?? '').trim();
  if (!input) return '';
  let u;
  try {
    u = new URL(input);
  } catch {
    return input;
  }
  u.hash = '';
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
  for (const key of [...u.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (TRACKING_PARAMS.has(lower) || lower.startsWith('utm_')) u.searchParams.delete(key);
  }
  u.searchParams.sort();
  const path = u.pathname.replace(/\/+$/, '') || '/';
  const query = u.searchParams.toString();
  const port = u.port && u.port !== '80' && u.port !== '443' ? `:${u.port}` : '';
  return `${u.protocol}//${u.hostname}${port}${path}${query ? `?${query}` : ''}`;
}

/**
 * 比对用的标题键：去掉一切分隔符与大小写差异，只留字母数字。
 * 中文标题走同一条路，"发布" 这类词不会被当作噪声删掉 —— 那属于关键词权重的事。
 *
 * @param {string} title
 * @returns {string}
 */
export function titleKey(title) {
  return String(title ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * 字符二元组。中文没有空格分词，用 bigram 比用空格分词可靠得多。
 * @param {string} key
 * @returns {Set<string>}
 */
export function bigrams(key) {
  const s = String(key ?? '');
  if (s.length <= 1) return new Set(s ? [s] : []);
  const out = new Set();
  for (let i = 0; i < s.length - 1; i += 1) out.add(s.slice(i, i + 2));
  return out;
}

/**
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {number}
 */
export function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const x of small) if (large.has(x)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * 只从 ASCII 实体名生成 slug，中文一律丢弃。
 * 这是刻意的：拼音 slug 后面还得手工重命名，不如留空让人起。
 *
 * @param {string} input
 * @param {{ max?: number }} [opts]
 * @returns {string}
 */
export function slugify(input, opts = {}) {
  const max = opts.max ?? 48;
  const ascii = String(input ?? '').replace(/[^\x00-\x7F]+/g, ' ');
  const slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, max)
    .replace(/-$/g, '');
  return slug;
}

/**
 * 建议 slug。至少要有 3 个字母才给建议，否则一律返回空串。
 * @param {string} title
 * @returns {string}
 */
export function extractSlugHint(title) {
  const slug = slugify(title);
  const letters = slug.replace(/[^a-z]/g, '').length;
  return letters >= 3 ? slug : '';
}

/**
 * 时区无关的日期标签（Asia/Shanghai）。
 * @param {Date} date
 * @returns {string} YYYY-MM-DD
 */
export function dateLabel(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
