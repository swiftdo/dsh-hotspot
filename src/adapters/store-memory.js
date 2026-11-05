/**
 * 内存 store：形状与 store-fs 一致，但不落盘。
 *
 * 两个使用者：
 *   1. `hotspot run --dry-run` —— 只看不落盘
 *   2. 插件未绑定博客根目录时的 `hotspot_run` —— 不往自己没管辖权的目录写文件
 *
 * 第 2 条的取舍写在 README：没有默认目录。猜一个 `~/blog` 或往宿主进程 cwd 写
 * `.hotspot/`，比明确告诉用户"先绑根目录"糟糕得多。代价是这份 digest 只在本次
 * 进程内可见，`hotspot_get` 读不到 —— 所以工具会显式回 `persisted: false`。
 */

export function createMemoryStore() {
  const digests = new Map();
  const raws = new Map();
  const state = new Map();
  let latest = null;

  return {
    dir: '(memory)',
    persistent: false,

    async saveRaw(date, items) {
      raws.set(String(date), Array.isArray(items) ? items : []);
    },

    async loadRaw(date) {
      return raws.get(String(date)) ?? [];
    },

    async saveDigest(digest) {
      latest = digest;
      digests.set(String(digest.date), digest);
      return '(memory)';
    },

    async loadDigest(date) {
      const key = date === 'latest' ? latest?.date : String(date);
      return key ? (digests.get(key) ?? null) : null;
    },

    async loadRecent(limit = 14) {
      return [...digests.values()]
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, limit);
    },

    async loadState(name, fallback) {
      return state.has(name) ? state.get(name) : fallback;
    },

    async saveState(name, value) {
      state.set(name, value);
    },
  };
}
