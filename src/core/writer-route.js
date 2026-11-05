/**
 * 面板里「用哪个模型写正文」的纯函数层：把宿主给的模型目录摊平成面板能用的形状，
 * 再把「选中的 provider/model」解析成一条可用路由。
 *
 * 为什么容忍式读取：`listProviders()` / `listModels()` 的返回形状是宿主适配器决定的，
 * 不同版本字段名不一样（provider / route / id、model / id / name）。这里逐个探测，
 * 拿不到路由的条目直接丢掉 —— 猜一条错路由只会在生成时炸，不如现在就少一个选项。
 */

const firstString = (...values) => {
  for (const value of values) if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return '';
};

export function pickProviderEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const provider = firstString(entry.provider, entry.route, entry.id);
  if (!provider) return null;
  return {
    provider,
    label: firstString(entry.name, entry.displayName, entry.label, entry.title, provider),
  };
}

export function pickModelEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const id = firstString(entry.id, entry.model, entry.name);
  if (!id) return null;
  return { id, name: firstString(entry.name, entry.displayName, entry.label, entry.title, id) };
}

/** 把 {provider, label, models[]} 摊成面板直接渲染的目录；坏条目静默跳过。 */
export function normalizeCatalog(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const catalog = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const provider = pickProviderEntry(entry);
    if (!provider) continue;
    const models = (Array.isArray(entry.models) ? entry.models : [])
      .map((model) => (typeof model === 'string' ? { id: model } : model))
      .map(pickModelEntry)
      .filter(Boolean);
    catalog.push({ ...provider, models });
  }
  return catalog;
}

/** 存盘的选择只保留三个字段，别的字段一律丢掉。mode 只有 agent（联网搜）与 direct（只用手头证据）。 */
export function normalizeWriterSelection(raw) {
  const record = raw && typeof raw === 'object' ? raw : {};
  return {
    provider: firstString(record.provider),
    model: firstString(record.model),
    mode: record.mode === 'direct' ? 'direct' : 'agent',
  };
}

/**
 * 选中项 → 一条路由。
 * 优先级：明确选中的 provider/model → 选中的 provider 的第一个模型 → 目录里第一个可用组合。
 * 一个都没有就返回 null，让调用方回 501，而不是硬编一条假路由。
 */
export function resolveRoute(catalog, selection) {
  const list = Array.isArray(catalog) ? catalog : [];
  const wanted = normalizeWriterSelection(selection);
  if (wanted.provider) {
    const hit = list.find((item) => item.provider === wanted.provider);
    if (hit) {
      if (wanted.model) {
        const model = hit.models.find((m) => m.id === wanted.model);
        if (model) return { provider: hit.provider, model: model.id };
        // 模型名可能已经下架：退回该 provider 的第一个可用模型，别让面板卡死。
        if (hit.models.length > 0) return { provider: hit.provider, model: hit.models[0].id };
      } else if (hit.models.length > 0) {
        return { provider: hit.provider, model: hit.models[0].id };
      }
    }
  }
  for (const item of list) {
    if (item.models.length > 0) return { provider: item.provider, model: item.models[0].id };
  }
  return null;
}

/** 只用手头证据时用的任务书：没有搜索工具，只能读 digest 里的候选源原文与已登记的补料。 */
export function buildDirectPrompt({
  title,
  url = '',
  sources = [],
  supplements = [],
  minChars = 800,
  maxChars = 1400,
} = {}) {
  const lines = [];
  lines.push('你是技术博客作者。只能使用下面给出的材料写一篇正文，不能引入材料之外的事实。');
  lines.push('');
  lines.push(`选题：${String(title ?? '').trim()}`);
  if (url) lines.push(`一手源：${url}`);
  lines.push('');
  lines.push('材料（这些是唯一可用的事实来源）：');
  let index = 0;
  for (const source of (sources ?? []).filter((s) => s && s.url)) {
    index += 1;
    const name = String(source.title ?? '').trim() || source.url;
    lines.push(`--- 材料 ${index}：${name} — ${source.url}`);
    const body = String(source.content ?? '').trim();
    lines.push(body ? body.slice(0, 2000) : '（只有链接，没有正文）');
    lines.push('');
  }
  for (const extra of (supplements ?? []).filter((s) => s && s.url)) {
    index += 1;
    const name = String(extra.title ?? '').trim() || extra.url;
    lines.push(`--- 材料 ${index}：${name} — ${extra.url}`);
    lines.push(String(extra.content ?? '').trim().slice(0, 2000) || '（只有链接，没有正文）');
    lines.push('');
  }
  lines.push('要求：');
  lines.push('1. 只用上面材料里出现的事实；材料没说的写「尚未披露」，不要补常识。');
  lines.push('2. 不编造数字、日期、引语、人名和职位；版本号照抄原文。');
  lines.push(`3. 中文 Markdown，${minChars}–${maxChars} 字。不要写一级标题（# 由宿主补），小标题用 ##。`);
  lines.push('4. 结尾用「## 参考」列出你引用过的材料链接，每条一行。');
  lines.push('');
  lines.push('直接输出正文本身，不要解释你在做什么，不要用代码围栏包住整篇。');
  return lines.join('\n');
}

/**
 * 把模型流式返回的 chunk 拼成文本。
 * 宿主适配器给的形状不止一种（text-delta / text-chunks / 裸字符串），
 * 这里全部认下来 —— 少认一种就是「生成成功但正文为空」。
 */
export function collectStreamText(chunks) {
  const parts = [];
  const pushText = (text) => {
    if (typeof text === 'string' && text !== '') parts.push(text);
  };
  for (const chunk of Array.isArray(chunks) ? chunks : []) {
    if (typeof chunk === 'string') {
      pushText(chunk);
      continue;
    }
    if (!chunk || typeof chunk !== 'object') continue;
    if (chunk.type === 'text-chunks' && Array.isArray(chunk.texts)) {
      for (const text of chunk.texts) pushText(text);
      continue;
    }
    const inner = chunk.chunk && typeof chunk.chunk === 'object' ? chunk.chunk : null;
    if (!inner) continue;
    if (inner.type === 'text-delta') pushText(inner.text ?? inner.delta);
    else if (inner.type === 'text-chunks' && Array.isArray(inner.texts)) {
      for (const text of inner.texts) pushText(text);
    }
  }
  return parts.join('');
}
