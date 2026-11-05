import { mkdir, readdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseFrontmatter } from '../core/validate.js';
import { titleKey, slugify, dateLabel } from '../core/normalize.js';
import {
  SUPPLEMENT_VERSION, normalizeSupplementFile, normalizeSupplementEntry, upsertSupplement,
} from '../core/supplement.js';

/**
 * VitePress 目标适配器。这是唯一知道"这个站点长什么样"的地方 ——
 * article/frontmatter/sitemap 这些词只准出现在这个文件里。
 *
 * 对接的仓库约定（来自 AGENTS.md）：
 *   URL = 目录路径，目录名即 URL 段，kebab-case
 *   frontmatter 不写 permalink
 *   description ≤ 120 字
 *   占位/草稿页用 sitemap: false，会被注入 noindex, nofollow
 */

const IGNORED_DOC_DIRS = new Set(['public', 'blog', 'book', 'result']);

/**
 * 补料文件名。跟 index.md 同目录，promote 时一起搬 —— 文章转正后
 * "这段数字是从哪读来的"仍然查得到，而不是随着草稿目录被删掉。
 */
const SUPPLEMENT_FILE = 'sources.json';

const DEFAULT_ALIASES = {
  'ai': ['ai', 'agent', 'llm', 'gpt', 'claude', 'deepseek'],
  'ai-toolbox': ['agent', 'dsh', 'mcp', 'skill', 'harness'],
  'swift': ['swift', 'swiftui', 'xcode', 'ios'],
  'flutter': ['flutter', 'dart', 'bloc'],
  'python': ['python', 'pip', 'django'],
  'vue': ['vue', 'vitepress', 'vite'],
  'tools': ['tool', 'cli', 'editor'],
  'ops': ['deploy', 'docker', 'nginx', 'server'],
  'java': ['java', 'spring', 'jvm'],
  'harmony': ['harmony', 'arkts', 'openharmony'],
  'algorithms': ['algorithm', 'leetcode'],
  'design-patterns': ['pattern', 'solid', 'oop'],
  'haskell': ['haskell', 'monad'],
  'yijing': ['yijing', 'bagua'],
  'acupuncture': ['acupuncture', 'meridian'],
};

function todayLabel(now) {
  return dateLabel(now);
}

function formatCreateTime(now) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (t) => p.find((x) => x.type === t)?.value ?? '00';
  return `${get('year')}/${get('month')}/${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function cleanText(text, max) {
  const flat = String(text ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const chars = [...flat];
  if (chars.length <= max) return flat;
  return `${chars.slice(0, max - 1).join('')}…`;
}

async function listDirs(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name);
  } catch {
    return [];
  }
}

async function readIfExists(file) {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return null;
  }
}

/**
 * @param {{ root: string, articleDir?: string, draftDir?: string, docsDir?: string, aliases?: Record<string,string[]> }} config
 */
export function createVitePressTarget(config) {
  const root = path.resolve(config.root);
  const docsDir = path.join(root, config.docsDir ?? 'docs');
  const articleDir = path.join(root, config.articleDir ?? 'docs/article');
  const draftDir = path.join(root, config.draftDir ?? 'docs/draft');
  const aliases = { ...DEFAULT_ALIASES, ...(config.aliases ?? {}) };

  async function scanArticles() {
    const out = [];
    const seenFiles = new Set();

    async function processMdFile(fullPath, fallbackSlug) {
      if (seenFiles.has(fullPath)) return;
      seenFiles.add(fullPath);
      const text = await readIfExists(fullPath);
      if (!text) return;
      const { data } = parseFrontmatter(text);
      let fileStat = null;
      try {
        fileStat = await stat(fullPath);
      } catch {}

      out.push({
        slug: fallbackSlug,
        title: String(data.title ?? fallbackSlug),
        key: titleKey(data.title ?? fallbackSlug),
        date: String(data.date ?? (fileStat ? new Date(fileStat.mtimeMs).toISOString().slice(0, 10) : '')),
        tags: Array.isArray(data.tags) ? data.tags : [],
        description: String(data.description ?? ''),
        file: path.relative(root, fullPath),
        mtime: fileStat ? fileStat.mtimeMs : 0,
      });
    }

    // 1. 标准子目录形式：articleDir/<slug>/index.md
    const slugs = await listDirs(articleDir);
    for (const slug of slugs) {
      if (slug.startsWith('.') || slug === 'draft' || slug === 'node_modules') continue;
      const indexFile = path.join(articleDir, slug, 'index.md');
      await processMdFile(indexFile, slug);
    }

    // 2. 单文件形式：articleDir/<slug>.md
    try {
      const files = await readdir(articleDir, { withFileTypes: true });
      for (const f of files) {
        if (f.isFile() && f.name.endsWith('.md') && f.name !== 'index.md' && !f.name.startsWith('.')) {
          const slug = f.name.slice(0, -3);
          const fullPath = path.join(articleDir, f.name);
          await processMdFile(fullPath, slug);
        }
      }
    } catch {}

    // 按日期倒序，其次按 mtime 倒序
    return out.sort((a, b) => {
      if (a.date && b.date && a.date !== b.date) return b.date.localeCompare(a.date);
      if (b.mtime !== a.mtime) return b.mtime - a.mtime;
      return a.slug.localeCompare(b.slug);
    });
  }

  /**
   * 补料的读写。草稿优先，其次已发布文章 —— promote 会把文件搬过去，
   * 所以"读"必须两个目录都看，否则转正后补料就"消失"了。
   */
  async function readSupplements(slug) {
    const draftFile = path.join(draftDir, slug, SUPPLEMENT_FILE);
    const articleFile = path.join(articleDir, slug, SUPPLEMENT_FILE);
    let file = draftFile;
    let text = await readIfExists(file);
    if (text === null) {
      file = articleFile;
      text = await readIfExists(file);
    }
    if (text === null) {
      return { version: SUPPLEMENT_VERSION, slug, file: path.relative(root, draftFile), entries: [], invalid: [] };
    }
    let raw;
    try {
      raw = JSON.parse(text);
    } catch {
      // 坏 JSON 不吞：吞了就会表现为"登记过补料却仍报数字违规"
      throw new Error(`补料文件不是合法 JSON：${path.relative(root, file)}`);
    }
    const { entries, invalid } = normalizeSupplementFile(raw);
    return { version: SUPPLEMENT_VERSION, slug, file: path.relative(root, file), entries, invalid };
  }

  async function addSupplement(slug, input) {
    const clean = String(slug ?? '').trim();
    if (!/^[a-z0-9-]+$/.test(clean)) throw new Error(`slug 不合法：${slug}`);
    const inDraft = (await readIfExists(path.join(draftDir, clean, 'index.md'))) !== null;
    const base = inDraft ? draftDir : articleDir;
    if ((await readIfExists(path.join(base, clean, 'index.md'))) === null) {
      throw new Error(`找不到草稿或文章：${clean}`);
    }

    const entry = normalizeSupplementEntry(input);
    const current = await readSupplements(clean);
    const { entries, added } = upsertSupplement(current.entries, entry);

    const file = path.join(base, clean, SUPPLEMENT_FILE);
    await mkdir(path.dirname(file), { recursive: true });
    const payload = { version: SUPPLEMENT_VERSION, slug: clean, updatedAt: new Date().toISOString(), entries };
    await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return { file: path.relative(root, file), entry, entries, added };
  }

  return {
    root,
    docsDir,
    articleDir,
    draftDir,
    listArticles: scanArticles,
    readSupplements,
    addSupplement,

    /**
     * 从项目本身归纳画像：article 的 tags 决定权重，docs 一级目录决定关键词。
     * 这里不读任何外部配置里的权重 —— 项目自己就是画像。
     */
    async profile() {
      const articles = await scanArticles();

      // 同一个 tag 在历史文章里可能有多种写法（存量数据里 openai 和 OpenAI 并存）。
      // 按小写归并，取出现最多的拼法作为规范写法，否则新文章会继续复制两种写法。
      const tagStats = new Map();
      for (const article of articles) {
        for (const tag of article.tags) {
          const lower = String(tag).toLowerCase();
          if (!tagStats.has(lower)) tagStats.set(lower, new Map());
          const spellings = tagStats.get(lower);
          spellings.set(tag, (spellings.get(tag) ?? 0) + 1);
        }
      }

      const canonical = [];
      for (const spellings of tagStats.values()) {
        const entries = [...spellings.entries()].sort((a, b) => {
          if (b[1] !== a[1]) return b[1] - a[1];
          const upperA = /[A-Z]/.test(a[0]) ? 1 : 0;
          const upperB = /[A-Z]/.test(b[0]) ? 1 : 0;
          if (upperB !== upperA) return upperB - upperA;
          return a[0].localeCompare(b[0], 'zh-CN');
        });
        const total = entries.reduce((sum, [, count]) => sum + count, 0);
        canonical.push({ tag: entries[0][0], count: total });
      }
      canonical.sort((a, b) => (b.count !== a.count ? b.count - a.count : a.tag.localeCompare(b.tag, 'zh-CN')));

      const keywords = [];
      for (const { tag, count } of canonical) {
        // 出现得越多越贴近你写得多的方向；下限 0.4 保证只出现一次的词也能命中
        keywords.push({ term: tag, weight: Math.min(1, 0.4 + 0.15 * count), tags: [tag] });
      }

      const topDirs = (await listDirs(docsDir)).filter(
        (name) => !IGNORED_DOC_DIRS.has(name) && !name.startsWith('.'),
      );
      for (const dir of topDirs) {
        for (const term of aliases[dir] ?? [dir]) {
          keywords.push({ term, weight: 0.5, tags: [] });
        }
      }

      return {
        keywords,
        blacklist: config.blacklist ?? [],
        tagVocabulary: canonical.map((c) => c.tag),
        articles,
        topDirs,
      };
    },

    /**
     * 站点真实存在的 URL 集合，供站内链接校验用。
     * 规则照抄 VitePress：目录 + index.md = 带尾斜杠的 URL。
     */
    async siteUrls() {
      const urls = new Set(['/']);

      async function walk(dir, prefix) {
        let entries;
        try {
          entries = await readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        const hasIndex = entries.some((e) => e.isFile() && e.name === 'index.md');
        if (hasIndex) urls.add(prefix === '/' ? '/' : `${prefix}/`);
        for (const entry of entries) {
          if (entry.isDirectory()) {
            if (entry.name.startsWith('.') || entry.name === 'public') continue;
            await walk(path.join(dir, entry.name), `${prefix}${entry.name}/`.replace('//', '/'));
          }
        }
      }

      await walk(docsDir, '/');

      const publicDir = path.join(docsDir, 'public');
      try {
        for (const entry of await readdir(publicDir, { withFileTypes: true })) {
          if (entry.isFile() && /\.html?$/i.test(entry.name)) urls.add(`/${entry.name}`);
        }
      } catch {
        /* public 目录可选 */
      }

      return urls;
    },

    /** 这个题写过没：slug 撞车或标题键相同都算。 */
    async exists(candidate) {
      const slug = candidate.slugHint;
      const key = titleKey(candidate.title);
      for (const base of [articleDir, draftDir]) {
        const slugs = await listDirs(base);
        if (slug && slugs.includes(slug)) return { exists: true, reason: `目录已存在：${slug}` };
      }
      const articles = await scanArticles();
      const hit = articles.find((a) => a.key === key);
      if (hit) return { exists: true, reason: `标题已写过：${hit.slug}` };
      return { exists: false };
    },

    /**
     * 生成草稿。draft=true 时进 docs/draft/ 并带 sitemap: false。
     *
     * 传 opts.body 就是「一次成型」：正文直接落盘，不留「（正文待写）」占位。
     * 不传 body 时退化成骨架 —— 只有明确要「先占位、后补写」时才该走这条路。
     * @param {any} candidate
     * @param {{ draft?: boolean, now?: Date, slug?: string, title?: string, description?: string, body?: string }} [opts]
     */
    async scaffold(candidate, opts = {}) {
      const now = opts.now ?? new Date();
      const draft = opts.draft ?? true;
      const slug = opts.slug ?? candidate.slugHint ?? slugify(candidate.title);
      if (!slug) {
        throw new Error('无法从标题推导 slug（中文标题需要显式指定 --slug）');
      }

      const baseDir = draft ? draftDir : articleDir;
      const dir = path.join(baseDir, slug);
      const file = path.join(dir, 'index.md');
      if (await readIfExists(file)) throw new Error(`已存在：${path.relative(root, file)}`);

      const title = String(opts.title ?? candidate.title).replace(/"/g, "'");
      const description = cleanText(
        String(opts.description ?? candidate.summary ?? candidate.title).replace(/"/g, "'"),
        118,
      );
      const tags = Array.isArray(candidate.tags) && candidate.tags.length > 0 ? candidate.tags : [];

      const lines = [
        '---',
        `title: ${title}`,
        `description: "${description}"`,
        `createTime: ${formatCreateTime(now)}`,
        `date: ${todayLabel(now)}`,
      ];
      if (tags.length > 0) {
        lines.push('tags:');
        for (const tag of tags) lines.push(`    - ${tag}`);
      }
      if (draft) lines.push('sitemap: false');
      lines.push('---', '');
      const body = typeof opts.body === 'string' ? opts.body.trim() : '';
      if (body) {
        // 正文自带标题就用它，没有才补一个 —— 不重复、不覆盖作者写的结构。
        lines.push(/^#\s/.test(body) ? body : `# ${title}\n\n${body}`, '');
      } else {
        lines.push(`# ${title}`, '');
        const sources = (candidate.sources ?? []).slice(0, 3);
        if (sources.length > 0) {
          lines.push('> 草稿，来源：');
          for (const source of sources) lines.push(`> - [${cleanText(source.title, 60)}](${source.url})`);
          lines.push('');
        }
        lines.push('（正文待写）', '');
      }

      await mkdir(dir, { recursive: true });
      await writeFile(file, lines.join('\n'), 'utf8');
      return { file, dir, slug, draft, bodyWritten: body.length > 0 };
    },

    /**
     * 转正：docs/draft/<slug> → docs/article/<slug>，并去掉 sitemap: false。
     * 只有这一步能让页面进博客列表和她图。
     */
    async promote(slug) {
      if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`slug 不合法：${slug}`);
      const from = path.join(draftDir, slug);
      const to = path.join(articleDir, slug);
      const fromFile = path.join(from, 'index.md');
      const text = await readIfExists(fromFile);
      if (!text) throw new Error(`草稿不存在：${path.relative(root, fromFile)}`);

      const promoted = text.replace(/^sitemap:\s*false\s*$/m, '').replace(/\n{3,}/g, '\n\n');
      // 补料跟着搬走：转正后仍要能回答"这段数字是从哪读来的"
      const supplementText = await readIfExists(path.join(from, SUPPLEMENT_FILE));
      await mkdir(to, { recursive: true });
      await writeFile(path.join(to, 'index.md'), promoted, 'utf8');
      if (supplementText !== null) {
        await writeFile(path.join(to, SUPPLEMENT_FILE), supplementText, 'utf8');
      }
      await rm(from, { recursive: true, force: true });
      return {
        from,
        to,
        file: path.join(to, 'index.md'),
        supplement: supplementText !== null ? path.join(to, SUPPLEMENT_FILE) : null,
      };
    },

    async hasDraft(slug) {
      try {
        const info = await stat(path.join(draftDir, slug, 'index.md'));
        return info.isFile();
      } catch {
        return false;
      }
    },

    /** 列草稿，供管理页展示（docs/draft/ 不进 posts.data.ts，所以只能在这里读） */
    async listDrafts() {
      const slugs = await listDirs(draftDir);
      const out = [];
      for (const slug of slugs) {
        const text = await readIfExists(path.join(draftDir, slug, 'index.md'));
        if (!text) continue;
        const { data } = parseFrontmatter(text);
        out.push({
          slug,
          title: String(data.title ?? slug),
          date: String(data.date ?? ''),
          tags: Array.isArray(data.tags) ? data.tags : [],
          file: path.relative(root, path.join(draftDir, slug, 'index.md')),
        });
      }
      return out.sort((a, b) => b.slug.localeCompare(a.slug));
    },

    /** 读取指定文章或草稿的 Markdown 原文 */
    async readArticle(targetFile) {
      const full = path.isAbsolute(targetFile) ? path.normalize(targetFile) : path.normalize(path.join(root, targetFile));
      const normRoot = path.normalize(root);
      if (!full.startsWith(normRoot)) {
        throw new Error('路径不合法：超出项目根目录范围');
      }
      const content = await readIfExists(full);
      if (content === null) {
        throw new Error(`文件不存在：${path.relative(root, full)}`);
      }
      const { data, body } = parseFrontmatter(content);
      return {
        file: path.relative(root, full),
        fullPath: full,
        content,
        body,
        data,
      };
    },

    /** 保存修改后的文章或草稿内容 */
    async saveArticle(targetFile, newContent) {
      if (typeof newContent !== 'string') {
        throw new Error('保存内容必须为字符串');
      }
      const full = path.isAbsolute(targetFile) ? path.normalize(targetFile) : path.normalize(path.join(root, targetFile));
      const normRoot = path.normalize(root);
      if (!full.startsWith(normRoot)) {
        throw new Error('路径不合法：超出项目根目录范围');
      }
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, newContent, 'utf8');
      const { data, body } = parseFrontmatter(newContent);
      return {
        file: path.relative(root, full),
        fullPath: full,
        data,
        body,
      };
    },

    /** 删除指定的草稿或文章文件（安全防御：仅限在 projectRoot 范围内） */
    async deleteArticle(targetFile) {
      const full = path.isAbsolute(targetFile) ? path.normalize(targetFile) : path.normalize(path.join(root, targetFile));
      const normRoot = path.normalize(root);
      if (!full.startsWith(normRoot)) {
        throw new Error('路径不合法：超出项目根目录范围');
      }
      const st = await stat(full).catch(() => null);
      if (!st || !st.isFile()) {
        throw new Error(`文件不存在或不是普通文件：${path.relative(root, full)}`);
      }
      await rm(full, { force: true });
      const parentDir = path.dirname(full);
      const isDraftOrArticleSubdir = parentDir.startsWith(path.normalize(draftDir)) || parentDir.startsWith(path.normalize(articleDir));
      if (isDraftOrArticleSubdir && parentDir !== path.normalize(draftDir) && parentDir !== path.normalize(articleDir)) {
        const remaining = await readdir(parentDir).catch(() => []);
        const onlySupplements = remaining.every((f) => f === SUPPLEMENT_FILE || f.startsWith('.'));
        if (onlySupplements) {
          await rm(parentDir, { recursive: true, force: true }).catch(() => {});
        }
      }
      return {
        ok: true,
        file: path.relative(root, full),
      };
    },
  };
}
