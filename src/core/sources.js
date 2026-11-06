/**
 * 「本次扫描到底抓哪些源」的唯一判定。
 *
 * 之前面板和扫描各算各的：面板在配置为空时按兜底显示内置源（看起来有源），
 * 扫描只读配置文件（判定为零个源）——于是出现「面板明明列着源，抓取却报
 * hotspot.config.json 里没有配置任何 sources」。这里收成一个函数，两边都调它。
 *
 * 语义（2026-11 起）：**内置源常驻、默认全开，与自定义源叠加**。
 * 内置源可以单个关闭（记在 `config.disabledBuiltins`），但不能删除、不能改地址；
 * 自定义源照旧可增删改。这样「默认就有一批源」和「我能自己加源」两件事不再互斥
 * —— 以前只要写了一个自定义源，内置源就整体失效。
 *
 * 36氪的 feed 直连返回火山引擎人机校验页（HTML），服务端拿不到 RSS，所以没进内置池。
 */

export const BUILTIN_SOURCES = [
  {
    id: 'sopilot-hottweets',
    name: 'SoPilot AI 爆款推文',
    kind: 'rss',
    url: 'https://sopilot.net/rss/hottweets',
    description: '追踪 Twitter/X 今日 AI 起爆帖，自动洞察技术前沿讨论',
  },
  {
    id: 'appinn',
    name: '小众软件',
    kind: 'rss',
    url: 'https://www.appinn.com/feed/',
    description: '新软件与实用工具的上手评测，偏桌面与效率工具',
  },
  {
    id: 'people-headlines',
    name: '人民网头条',
    kind: 'rss',
    url: 'https://plink.anyfeeder.com/people',
    description: '人民网首页头条（经 anyfeeder 镜像），时政与公共议题',
  },
  {
    id: 'ifanr',
    name: '爱范儿',
    kind: 'rss',
    url: 'https://www.ifanr.com/feed',
    description: '消费电子与科技产品报道，新品与行业动态',
  },
  {
    id: 'geekpark',
    name: '极客公园',
    kind: 'rss',
    url: 'http://www.geekpark.net/rss',
    description: '科技公司与产品动态，偏国内互联网行业',
  },
];

/** 内置源 id 集合：判断「这个 id 能不能被自定义源占用」。 */
export const BUILTIN_IDS = new Set(BUILTIN_SOURCES.map((source) => source.id));

/** 把配置里的 sources 洗成可用列表：丢掉非对象、缺少 id 的坏条目。 */
export function configuredSources(config) {
  const list = Array.isArray(config?.sources) ? config.sources : [];
  return list.filter((source) => source && typeof source === 'object' && typeof source.id === 'string' && source.id);
}

/** 地址归一：只为了比较「这两条是不是同一个源」，不做别的规范化。 */
function comparableUrl(value) {
  return String(value ?? '').trim().replace(/\/+$/, '').toLowerCase();
}

/**
 * 这条自定义源是不是「内置源的复制」——同 id 且同地址。
 *
 * 为什么需要：内置源是后加的，之前用户可能已经手动把同样的地址加进了 `sources`。
 * 同 id 同地址的两条是同一件事，不该在面板里出现两行、也不该抓两遍。
 * 同 id 但**地址不同**则不是复制（那是真的撞名，得让用户改 id）。
 */
export function isBuiltinDuplicate(source) {
  const builtin = BUILTIN_SOURCES.find((entry) => entry.id === source?.id);
  if (!builtin) return false;
  if (builtin.kind !== (source?.kind ?? 'rss')) return false;
  if (builtin.url) return comparableUrl(builtin.url) === comparableUrl(source?.url);
  return false;
}

/** 去掉「内置源复制」之后的自定义源：面板展示与抓取都用这一份。 */
export function customSources(config) {
  return configuredSources(config).filter((source) => !isBuiltinDuplicate(source));
}

/** 被关掉的内置源 id 集合。配置写坏了就当没关（默认全开比默认全关安全）。 */
export function disabledBuiltinIds(config) {
  const list = Array.isArray(config?.disabledBuiltins) ? config.disabledBuiltins : [];
  return new Set(list.filter((id) => typeof id === 'string' && id && BUILTIN_IDS.has(id)));
}

/**
 * 当前生效的内置源（已排除被关掉的）。
 * @returns {typeof BUILTIN_SOURCES}
 */
export function builtinSources(config) {
  const disabled = disabledBuiltinIds(config);
  return BUILTIN_SOURCES.filter((source) => !disabled.has(source.id));
}

/**
 * 解析有效源集合：内置（默认开）在前，自定义在后。
 *
 * @returns {{ sources: Array<object>, mode: 'config'|'builtin', builtinCount: number,
 *             customCount: number, disabledBuiltins: string[] }}
 *   mode 只表示「有没有自定义源」，不再表示「内置源是否生效」——内置源现在总是生效。
 */
export function resolveSources(config) {
  const custom = customSources(config);
  const customIds = new Set(custom.map((source) => source.id));
  // 内置源的手工复制：地址一样所以不再抓一遍，但用户给它起过的名字要留着
  const renamed = new Map(
    configuredSources(config)
      .filter((source) => isBuiltinDuplicate(source) && typeof source.name === 'string' && source.name.trim())
      .map((source) => [source.id, source.name.trim()]),
  );
  const builtin = builtinSources(config)
    .filter((source) => !customIds.has(source.id))
    .map(({ id, name, kind, url }) => ({ id, name: renamed.get(id) || name, kind, url }));
  return {
    sources: [...builtin, ...custom],
    mode: custom.length > 0 ? 'config' : 'builtin',
    builtinCount: builtin.length,
    customCount: custom.length,
    disabledBuiltins: [...disabledBuiltinIds(config)],
  };
}

/** URL 里那些「不是内容、只是通道」的路径段：推导 id 时跳过，否则 ifanr.com/feed 会变成 ifanr-feed。 */
const NOISE_SEGMENTS = new Set([
  'feed', 'feeds', 'rss', 'atom', 'index', 'default', 'xml', 'v2', 'v1', 'all', 'latest', 'home',
]);

function slug(value, max = 40) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

/**
 * 从目标地址推导源 id —— 面板不再要求手填 id。
 *
 * 规则（就是为了让「来源：xxx」读起来像个人话）：
 * - `https://www.ifanr.com/feed`        → `ifanr`
 * - `https://www.appinn.com/feed/`      → `appinn`
 * - `https://plink.anyfeeder.com/people` → `anyfeeder-people`（镜像站域名相同，靠路径段区分）
 * - `http://www.geekpark.net/rss`       → `geekpark`
 * - GitHub Release `apple/swift`        → `apple-swift`
 * - Hacker News                         → `hn`
 *
 * 撞上已有 id（含内置源）就自动加 `-2`、`-3`；实在推导不出来才退回 `source`。
 *
 * @param {{ kind?: string, url?: string, repo?: string }} source
 * @param {Iterable<string>} [taken] 已被占用的 id（内置源 + 已有自定义源）
 */
export function deriveSourceId(source = {}, taken = []) {
  const used = new Set([...taken, ...BUILTIN_IDS]);
  const kind = String(source.kind ?? 'rss');

  let base = '';
  if (kind === 'hn') {
    base = 'hn';
  } else if (kind === 'github-release') {
    base = slug(String(source.repo ?? '').replace('/', '-'));
  } else {
    let hostname = '';
    let pathname = '';
    try {
      const parsed = new URL(String(source.url ?? '').trim());
      hostname = parsed.hostname;
      pathname = parsed.pathname;
    } catch {
      hostname = '';
    }
    // 去掉 www / 镜像前缀与顶级域，取可识别的那一段
    const labels = hostname.split('.').filter(Boolean).filter((label) => !['www', 'plink', 'feeds', 'rss', 'm', 'amp'].includes(label));
    const site = labels.length >= 2 ? labels[labels.length - 2] : (labels[0] ?? '');
    const segments = pathname
      .split('/')
      .map((segment) => slug(segment.replace(/\.[a-z0-9]+$/i, '')))
      .filter((segment) => segment && !NOISE_SEGMENTS.has(segment));
    base = [slug(site), ...segments.slice(0, 2)].filter(Boolean).join('-');
  }

  const root = base || 'source';
  if (!used.has(root)) return root;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${root}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${root}-${Date.now().toString(36).slice(-4)}`;
}
