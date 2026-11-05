/**
 * 最小 RSS 2.0 / Atom 解析器。零依赖是刻意的：
 * 这个包要能在 DSH 里、在 CLI 里、在 CI 里跑，不该因为一个 XML 库被拖住。
 *
 * 不做的事：命名空间解析、DTD、XPath。只按标签名做一次"够用的抓取"。
 * 已知取舍：CDATA 先解包再解实体，对双重转义的源是宽松的；对正常源无影响。
 */

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

function fromCodePoint(code) {
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

function decodeEntities(input) {
  return String(input)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, inner) => inner)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => fromCodePoint(Number(dec)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (match, name) => NAMED_ENTITIES[name] ?? match);
}

function stripTags(input) {
  return String(input).replace(/<[^>]*>/g, ' ');
}

function clean(raw) {
  return stripTags(decodeEntities(raw)).replace(/\s+/g, ' ').trim();
}

function textOf(block, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = block.match(re);
  return match ? clean(match[1]) : '';
}

function atomHref(block) {
  const tags = block.match(/<link\b[^>]*\/?>/gi) ?? [];
  const parsed = tags
    .map((tag) => ({
      href: (tag.match(/href\s*=\s*"([^"]*)"/i) ?? tag.match(/href\s*=\s*'([^']*)'/i))?.[1] ?? '',
      rel: (tag.match(/rel\s*=\s*["']([^"']*)["']/i)?.[1] ?? '').toLowerCase(),
    }))
    .filter((l) => l.href);
  if (parsed.length === 0) return '';
  const alternate = parsed.find((l) => l.rel === 'alternate');
  const bare = parsed.find((l) => !l.rel);
  return decodeEntities((alternate ?? bare ?? parsed[0]).href);
}

function firstDate(block) {
  for (const tag of ['pubDate', 'published', 'updated', 'dc:date', 'date']) {
    const value = textOf(block, tag);
    if (!value) continue;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return '';
}

/**
 * 正文尽量留全。digest 里只展示前 400 字，但数字校验需要足够长的原文 ——
 * release notes 里的版本号往往在很靠后的位置，只留 400 字会误报。
 */
function firstContent(block) {
  for (const tag of ['content:encoded', 'content', 'description', 'summary']) {
    const value = textOf(block, tag);
    if (value) return value.slice(0, 4000);
  }
  return '';
}

/**
 * @param {string} xml
 * @param {{ sourceId: string, sourceKind?: string }} meta
 * @returns {Array<{ title: string, url: string, publishedAt: string, summary: string, source: string, sourceKind: string }>}
 */
export function parseFeed(xml, meta) {
  const body = String(xml ?? '');
  const isAtom = /<feed[\s>]/i.test(body) && !/<rss[\s>]/i.test(body);
  const isRss = /<rss[\s>]/i.test(body) || /<channel[\s>]/i.test(body);
  if (!isAtom && !isRss) return [];

  const blockTag = isAtom ? 'entry' : 'item';
  const blockRe = new RegExp(`<${blockTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${blockTag}>`, 'gi');
  const items = [];

  for (const match of body.matchAll(blockRe)) {
    const block = match[1];
    const title = textOf(block, 'title');
    const url = isAtom ? atomHref(block) : (textOf(block, 'link') || atomHref(block));
    if (!url) continue;
    const content = firstContent(block);
    items.push({
      title: title || url,
      url,
      publishedAt: firstDate(block),
      summary: content.slice(0, 400),
      content,
      source: meta.sourceId,
      sourceKind: meta.sourceKind ?? (isAtom ? 'atom' : 'rss'),
    });
  }

  return items;
}

/**
 * GitHub 的 releases.atom 里，entry 的 updated 是发布时间，
 * 但同一页面里还夹着 `media:thumbnail` 等无关标签。上面按标签名抓取已经足够了，
 * 这里只补一个便利函数，避免调用方自己拼 URL。
 *
 * @param {string} repo 形如 deepseek-ai/deepseek-harness
 */
export function githubReleasesFeed(repo) {
  return `https://github.com/${repo}/releases.atom`;
}
