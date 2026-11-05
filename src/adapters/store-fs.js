import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
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
      return JSON.parse(await readFile(file, 'utf8'));
    },

    async loadRecent(limit = 14) {
      await ensure();
      const files = (await readdir(digestDir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
      const picked = files.slice(0, limit);
      return Promise.all(picked.map(async (f) => JSON.parse(await readFile(path.join(digestDir, f), 'utf8'))));
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
