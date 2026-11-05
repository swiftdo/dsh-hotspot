import { checkDraft } from './checks.js';

/**
 * 转正的硬闸门：先 checkDraft，全过才允许搬进文章目录。
 *
 * 之前 `hotspot promote`（CLI）和面板的「转正」都直接调 `target.promote()`，
 * 一次校验都不跑 —— 于是 README 里「任何一道不过，文章只能留在 docs/draft/」
 * 只是一句承诺，点一下按钮就能把违规文章推上去。这里把承诺变成实现。
 *
 * 刻意不提供 force 开关：闸门只要留一个后门，就等于没有闸门。
 * 要放行只有两条正路 —— 改稿，或者把真正读过的页面登记成补料。
 */

/** 把违规摊成一句能直接显示的话：`3 项 · number-not-in-source×2、external-link-untrusted×1` */
export function describeViolations(violations, limit = 4) {
  const list = Array.isArray(violations) ? violations : [];
  if (list.length === 0) return '无违规';
  const counts = new Map();
  for (const item of list) {
    const code = String(item?.code ?? 'unknown');
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const parts = [...counts.entries()].map(([code, count]) => (count > 1 ? `${code}×${count}` : code));
  const head = parts.slice(0, limit).join('、');
  const rest = parts.length > limit ? ` 等 ${parts.length} 类` : '';
  return `${list.length} 项 · ${head}${rest}`;
}

/**
 * @param {{ target: any, store: any, slug: string, allowedHosts?: string[], allowNumbers?: string[], date?: string }} input
 * @returns {Promise<{ ok: boolean, violations: any[], report: any, promoted?: any }>}
 */
export async function promoteChecked({ target, store, slug, allowedHosts = [], allowNumbers = [], date = 'latest' }) {
  const report = await checkDraft({ target, store, slug, allowedHosts, allowNumbers, date });
  if (!report.result.ok) {
    return { ok: false, violations: report.result.violations, report };
  }
  const promoted = await target.promote(String(slug ?? '').trim());
  return { ok: true, violations: [], report, promoted };
}
