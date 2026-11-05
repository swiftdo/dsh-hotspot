import { mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { renderMarkdown } from '../core/digest.js';

/**
 * 文件系统存储。默认落在 <root>/.hotspot，且不该进版本库。
 * DSH 侧的适配器会换成 ctx.storage，但形状一致，调用方不用改。
 *
 * @param {{ dir: string }} config
 */
export function createFsStore(config) {
  const dir = path.resolve(config.dir);
  const digestDir = path.join(dir, 'digest');
  const rawDir = path.join(dir, 'raw');
  const stateDir = path.join(dir, 'state');

  async function ensure() {
    await mkdir(digestDir, { recursive: true });
    await mkdir(rawDir, { recursive: true });
    await mkdir(stateDir, { recursive: true });
  }

  return {
    dir,
    async saveRaw(date, items) {
      await ensure();
      await writeFile(path.join(rawDir, `${date}.json`), `${JSON.stringify(items)}\n`, 'utf8');
    },

    async loadRaw(date) {
      try {
        return JSON.parse(await readFile(path.join(rawDir, `${date}.json`), 'utf8'));
      } catch {
        return [];
      }
    },

    async saveDigest(digest) {
      await ensure();
      const jsonPath = path.join(digestDir, `${digest.date}.json`);
      await writeFile(jsonPath, `${JSON.stringify(digest, null, 2)}\n`, 'utf8');
      await writeFile(path.join(digestDir, `${digest.date}.md`), renderMarkdown(digest), 'utf8');
      await writeFile(path.join(digestDir, 'latest.json'), `${JSON.stringify(digest, null, 2)}\n`, 'utf8');
      await writeFile(path.join(digestDir, 'latest.md'), renderMarkdown(digest), 'utf8');
      return jsonPath;
    },

    async loadDigest(date) {
      const target = date === 'latest' ? 'latest' : date;
      const file = path.join(digestDir, `${target}.json`);
      let text;
      try {
        text = await readFile(file, 'utf8');
      } catch (error) {
        // 文件不存在是常态（还没抓过），返回 null 让调用方给「先跑 hotspot_run」。
        // 坏 JSON 仍然抛：吞掉会表现成「明明抓过，却报没有候选」，最难查。
        if (error?.code === 'ENOENT') return null;
        throw error;
      }
      return JSON.parse(text);
    },

    async loadRecent(limit = 14) {
      await ensure();
      const files = (await readdir(digestDir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
      const picked = files.slice(0, limit);
      return Promise.all(picked.map(async (f) => JSON.parse(await readFile(path.join(digestDir, f), 'utf8'))));
    },

    /**
     * 清理过期的 digest 与 raw。
     *
     * 为什么要有：raw 存的是每个源的完整正文（每条 ≤4000 字），一天几 MB 很正常，
     * 而 `check` 只往回找最近 14 天的候选 —— 更早的原文除了占磁盘没有别的用途。
     *
     * 只删 `YYYY-MM-DD.json|md` 这种按日期命名的文件：`latest.*`、`writer/`、
     * `jobs/`、`deploy-history.json` 都不动（它们是当前状态，不是历史）。
     *
     * @param {{ keepDays?: number, now?: Date }} [options]
     * @returns {Promise<string[]>} 被删掉的文件名（相对 digestDir）
     */
    async prune({ keepDays = 30, now = new Date() } = {}) {
      const keep = Number(keepDays);
      if (!Number.isFinite(keep) || keep <= 0) return [];
      const cutoff = new Date(now.getTime() - keep * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const removed = [];

      for (const [folder, pattern] of [[digestDir, /^(\d{4}-\d{2}-\d{2})\.(json|md)$/], [rawDir, /^(\d{4}-\d{2}-\d{2})\.json$/]]) {
        let names = [];
        try {
          names = await readdir(folder);
        } catch {
          continue;
        }
        for (const name of names) {
          const matched = name.match(pattern);
          if (!matched) continue;
          if (matched[1] >= cutoff) continue;
          try {
            await rm(path.join(folder, name), { force: true });
            removed.push(path.relative(dir, path.join(folder, name)));
          } catch {
            /* 删不掉的留到下次，不影响本次抓取 */
          }
        }
      }
      return removed;
    },

    async loadState(name, fallback) {
      try {
        return JSON.parse(await readFile(path.join(stateDir, `${name}.json`), 'utf8'));
      } catch {
        return fallback;
      }
    },

    async saveState(name, value) {
      await ensure();
      await writeFile(path.join(stateDir, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    },
  };
}
