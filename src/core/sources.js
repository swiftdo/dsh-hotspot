/**
 * 「本次扫描到底抓哪些源」的唯一判定。
 *
 * 之前面板和扫描各算各的：面板在配置为空时按兜底显示内置源（看起来有源），
 * 扫描只读配置文件（判定为零个源）——于是出现「面板明明列着源，抓取却报
 * hotspot.config.json 里没有配置任何 sources」。这里收成一个函数，两边都调它。
 *
 * 语义：配置里写了源就以配置为准；一个都没写时退回内置默认源。
 * 清空自定义源即回到默认源，想彻底不抓就别建草稿（而不是留一个空源列表）。
 */

export const BUILTIN_SOURCES = [
  {
    id: 'sopilot-hottweets',
    name: 'SoPilot AI 爆款推文',
    kind: 'rss',
    url: 'https://sopilot.net/rss/hottweets',
    description: '追踪 Twitter/X 今日 AI 起爆帖，自动洞察技术前沿讨论',
  },
];

/** 把配置里的 sources 洗成可用列表：丢掉非对象、缺少 id 的坏条目。 */
export function configuredSources(config) {
  const list = Array.isArray(config?.sources) ? config.sources : [];
  return list.filter((source) => source && typeof source === 'object' && typeof source.id === 'string' && source.id);
}

/**
 * 解析有效源集合。
 * @returns {{ sources: Array<object>, mode: 'config'|'builtin' }}
 *   mode='config' 配置为准，mode='builtin' 用的是内置默认源。
 */
export function resolveSources(config) {
  const configured = configuredSources(config);
  if (configured.length > 0) return { sources: configured, mode: 'config' };
  return {
    sources: BUILTIN_SOURCES.map(({ id, name, kind, url }) => ({ id, name, kind, url })),
    mode: 'builtin',
  };
}
