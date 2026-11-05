/**
 * 候选解析：把 `#3` / `3` / `h-20261105-03` 收敛成同一个函数。
 *
 * 之前这段逻辑在 plugin.js 里复制了两份、cli.js 一份，三份都长这样：
 *
 *   items.find((it) => it.id === key || it.id.endsWith(key) || it.id.endsWith(`-${key.padStart(2, '0')}`))
 *
 * `endsWith(key)` 排在补零之前，于是 `#3` 会先命中 `h-20261105-13` —— 序号越大越容易撞，
 * 而候选表里正好有 15 条。这里按「精确 id → 补零后缀 → 序号」的确定顺序重写，并抽出来共用。
 */

/** 只认纯数字序号（1..999），避免把 `h-20261105-03` 当序号解析。 */
function asIndex(key) {
  if (!/^\d{1,3}$/.test(key)) return 0;
  const n = Number(key);
  return Number.isInteger(n) && n >= 1 ? n : 0;
}

/**
 * @param {{ items?: Array<{ id?: string }> } | null | undefined} digest
 * @param {string} rawId  `#3` / `3` / `h-20261105-03`
 * @returns {object | null}
 */
export function pickCandidate(digest, rawId) {
  const items = Array.isArray(digest?.items) ? digest.items : [];
  const key = String(rawId ?? '').trim().replace(/^#/, '');
  if (!key || items.length === 0) return null;

  const exact = items.find((item) => item.id === key);
  if (exact) return exact;

  const index = asIndex(key);
  if (index) {
    // 补零后缀是候选表的规范写法（h-YYYYMMDD-NN），优先于按位置取
    const padded = items.find((item) => String(item.id ?? '').endsWith(`-${String(index).padStart(2, '0')}`));
    if (padded) return padded;
    return index <= items.length ? items[index - 1] : null;
  }

  // 完整 id 的尾段（h-20261105-03 的 `20261105-03`）也认，但必须带 `-`，
  // 否则 `13` 这样的裸序号会重新落回上面的歧义里
  return items.find((item) => String(item.id ?? '').endsWith(`-${key}`)) ?? null;
}

/**
 * 在若干份 digest 里按候选 id 找它当时所在的那份（带 date）。
 *
 * 用途：digest 按天滚动，`latest` 只保留最近一次抓取。草稿是昨天写的时候，
 * check 要拿到的原文和来源都在昨天那份 digest 与 raw 里 —— 拿 latest 去猜，
 * 猜不到就只能把当天全部原文当证据（那等于没有闸门）。
 *
 * @param {Array<{ date?: string, items?: Array<{ id?: string }> }>} digests
 * @param {string} id
 */
export function findCandidateDigest(digests, id) {
  const wanted = String(id ?? '').trim();
  if (!wanted) return null;
  for (const digest of Array.isArray(digests) ? digests : []) {
    const candidate = (digest?.items ?? []).find((item) => item.id === wanted);
    if (candidate) return { digest, candidate };
  }
  return null;
}
