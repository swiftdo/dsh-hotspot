import { appendFile, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { appendFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

/**
 * 错误日志：按天一个 JSONL，默认只留当天。
 *
 * 为什么要有：面板失败时只有一条 toast，刷新就没了；`jobs/<slug>.json` 只记写作任务，
 * 抓取失败、路由 500、部署失败都没地方查。这些是「事后想复现一次」的唯一线索。
 *
 * 三条刻意的取舍：
 * - **只记错误**，不记每次请求。日志一旦变成访问流水，就没人看了。
 * - **默认只留当天**（keepDays=1）。错误日志的价值随时间迅速衰减，留久了只是占磁盘，
 *   而清理又常被忘掉。要留更久就把 keepDays 调大。
 * - **写日志失败绝不影响主流程**：这是诊断设施，不是业务。
 */

/** 用 UTC 日期做文件名，与 digest / raw 的命名保持一致，跨时区不会出现「昨天写进今天」。 */
function dateOf(date) {
  return new Date(date instanceof Date ? date.getTime() : date).toISOString().slice(0, 10);
}

function describeError(error) {
  if (!error) return { message: '未知错误' };
  if (typeof error === 'string') return { message: error };
  return {
    message: String(error.message || error),
    code: String(error.code || ''),
    detail: error.stack ? String(error.stack).split('\n').slice(1, 6).join('\n') : '',
  };
}

/**
 * @param {{ dir: string | (() => string), keepDays?: number, now?: () => Date, log?: Function }} config
 */
export function createErrorLog({ dir, keepDays = 1, now = () => new Date(), log = () => {} } = {}) {
  const dirOf = () => (typeof dir === 'function' ? dir() : dir);
  const errorsDir = () => path.join(String(dirOf() || '.hotspot'), 'errors');

  function cutoffDate() {
    const days = Number(keepDays);
    const keep = Number.isFinite(days) && days > 0 ? days : 1;
    return dateOf(now().getTime() - (keep - 1) * 24 * 3600 * 1000);
  }

  /** 删掉超出保留期的日志文件。返回被删的文件名。 */
  async function prune() {
    const boundary = cutoffDate();
    let names = [];
    try {
      names = await readdir(errorsDir());
    } catch {
      return [];
    }
    const removed = [];
    for (const name of names) {
      const matched = name.match(/^(\d{4}-\d{2}-\d{2})\.jsonl$/);
      if (!matched || matched[1] >= boundary) continue;
      try {
        await rm(path.join(errorsDir(), name), { force: true });
        removed.push(name);
      } catch {
        /* 删不掉就留到下次 */
      }
    }
    return removed;
  }

  function buildEntry(input = {}) {
    const info = describeError(input.error);
    return {
      at: now().toISOString(),
      level: 'error',
      source: String(input.source || 'plugin'),
      code: String(input.code || info.code || ''),
      message: String(input.message || info.message || ''),
      slug: input.slug ? String(input.slug) : '',
      detail: info.detail || '',
      context: input.context && typeof input.context === 'object' ? input.context : undefined,
    };
  }

  function pruneSync() {
    const boundary = cutoffDate();
    let names = [];
    try {
      names = readdirSync(errorsDir());
    } catch {
      return;
    }
    for (const name of names) {
      const matched = name.match(/^(\d{4}-\d{2}-\d{2})\.jsonl$/);
      if (!matched || matched[1] >= boundary) continue;
      try {
        rmSync(path.join(errorsDir(), name), { force: true });
      } catch {
        /* ignore */
      }
    }
  }

  return {
    /**
     * 同步版本：给「马上就要 process.exit」的场景用（CLI 的 fail）。
     * Promise 版本在 exit 前根本写不完。
     */
    recordSync(input = {}) {
      const entry = buildEntry(input);
      try {
        const file = path.join(errorsDir(), `${dateOf(now())}.jsonl`);
        mkdirSync(path.dirname(file), { recursive: true });
        appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf8');
        pruneSync();
      } catch (error) {
        log(`错误日志写入失败：${error?.message ?? error}`);
      }
      return entry;
    },

    /**
     * 记一条错误。返回写入的条目；写失败只记到控制台，不抛。
     * @param {{ source: string, error?: any, message?: string, code?: string, slug?: string, context?: object }} input
     */
    async record(input = {}) {
      const entry = buildEntry(input);
      try {
        const file = path.join(errorsDir(), `${dateOf(now())}.jsonl`);
        await mkdir(path.dirname(file), { recursive: true });
        await appendFile(file, `${JSON.stringify(entry)}\n`, 'utf8');
        await prune();
      } catch (error) {
        log(`错误日志写入失败：${error?.message ?? error}`);
      }
      return entry;
    },

    /** 列出某一天的错误（默认今天），最新的在前。 */
    async list({ date, limit = 100 } = {}) {
      const day = date ? String(date) : dateOf(now());
      let text = '';
      try {
        text = await readFile(path.join(errorsDir(), `${day}.jsonl`), 'utf8');
      } catch {
        return [];
      }
      const entries = [];
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
          entries.push(JSON.parse(line));
        } catch {
          /* 坏行跳过：日志文件被手改过也不该让面板打不开 */
        }
      }
      return entries.reverse().slice(0, Math.max(1, Number(limit) || 100));
    },

    /** 清空：不传 date 清全部（含历史遗留），传了只清那一天的。返回删掉的文件数。 */
    async clear({ date } = {}) {
      let names = [];
      try {
        names = await readdir(errorsDir());
      } catch {
        return 0;
      }
      const target = date ? `${String(date)}.jsonl` : '';
      let removed = 0;
      for (const name of names) {
        if (!name.endsWith('.jsonl')) continue;
        if (target && name !== target) continue;
        try {
          await rm(path.join(errorsDir(), name), { force: true });
          removed += 1;
        } catch {
          /* ignore */
        }
      }
      return removed;
    },

    /** 现有日志文件（按日期倒序），面板用来显示「还有哪几天的」。 */
    async files() {
      try {
        const names = await readdir(errorsDir());
        return names.filter((name) => name.endsWith('.jsonl')).map((name) => name.slice(0, -6)).sort().reverse();
      } catch {
        return [];
      }
    },

    prune,
    today: () => dateOf(now()),
  };
}
