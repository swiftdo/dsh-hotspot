/**
 * 领域类型。这里只放数据形状与常量，不放任何 IO。
 *
 * 关键约束：
 * - 所有时间在磁盘上一律是 UTC ISO 8601，展示层才转 Asia/Shanghai。
 * - Digest 带 schemaVersion，站点 / agent / CLI 三方按版本读字段，不靠猜。
 */

export const SCHEMA_VERSION = 1;

/**
 * @typedef {object} Item
 * @property {string} id            稳定 hash（canonicalUrl + 发布时间的近似值）
 * @property {string} title         源里的原始标题，不加工
 * @property {string} url           canonical URL
 * @property {string} source        源 id
 * @property {string} sourceKind    rss | github-release | hn
 * @property {string} publishedAt   UTC ISO 8601
 * @property {string} summary       源给的原文摘要（≤400 字），用于 digest 展示
 * @property {string} [content]     源给的正文全文（≤4000 字），只用于数字校验
 */

/**
 * @typedef {object} Cluster
 * @property {string} id
 * @property {Item[]} items             合并后的同源条目，保留全部原文
 * @property {number} sourceCount       涉及多少个不同源
 * @property {string} title             代表标题（取最早出现的那条）
 * @property {string} url               代表 URL
 * @property {string} firstSeen
 * @property {string} lastSeen
 */

/**
 * @typedef {object} ScoreParts
 * @property {number} cooccurrence   跨源共现
 * @property {number} freshness      新鲜度
 * @property {number} relevance      关键词命中
 * @property {number} penalty        黑名单惩罚
 */

/**
 * @typedef {object} Candidate
 * @property {string} id                h-YYYYMMDD-NN，稳定、可直接引用
 * @property {string} title
 * @property {string} url
 * @property {string[]} sourceIds
 * @property {number} sourceCount
 * @property {string} firstSeen
 * @property {string} summary
 * @property {string} slugHint          从英文实体名提取的建议 slug，中文标题可能为空
 * @property {string[]} tags            命中画像后映射到的受控 tag
 * @property {number} score
 * @property {ScoreParts} scoreParts
 */

/**
 * @typedef {object} DigestStatus
 * @property {number} feedsTotal
 * @property {number} feedsOk
 * @property {number} itemsRaw
 * @property {number} itemsDeduped
 * @property {number} candidates
 * @property {string[]} failedSources
 * @property {boolean} degraded         存活源 < 50% 时为 true，下游不应据此发布
 */

/**
 * @typedef {object} Digest
 * @property {number} schemaVersion
 * @property {string} date              YYYY-MM-DD（Asia/Shanghai）
 * @property {string} generatedAt       UTC ISO 8601
 * @property {DigestStatus} status
 * @property {Candidate[]} items
 */

export const AUTONOMY = /** @type {const} */ ({
  AUTO: 'auto',
  DRAFT: 'draft',
  MANUAL: 'manual',
});
