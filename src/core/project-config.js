/**
 * 目录配置的合并规则。
 *
 * 同一个仓库的目录有两个可能来源：
 *   1. 宿主的插件配置（cordis.patch.yml）/ 面板「设置」保存的值
 *   2. 博客仓库自己的 `dsh-hotspot.config.json`（或旧的 `hotspot.config.json`）
 *
 * 以前只认第 1 个：博客仓库里写着 `draftDir: ".drafts"`，插件的 target 却还是
 * 构建时的默认值 —— 面板顶部显示 `.drafts`（读的是配置文件），实际列草稿却去
 * `docs/draft` 找，于是「草稿列表是空的」「删除草稿说路径不对」。
 *
 * 优先级：面板/宿主显式配置 > 博客仓库配置 > 适配器默认值（返回空串）。
 */

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

/**
 * 从一份配置对象里取目录。顶层键与 `target.*` 都认：
 * 插件写顶层，CLI 写 target.*，两份都得能用。
 * @param {any} config
 * @returns {{ articleDir: string, draftDir: string, digestDir: string }}
 */
export function projectDirsFrom(config) {
  const cfg = config && typeof config === 'object' ? config : {};
  const target = cfg.target && typeof cfg.target === 'object' ? cfg.target : {};
  return {
    articleDir: text(cfg.articleDir) || text(target.articleDir),
    draftDir: text(cfg.draftDir) || text(target.draftDir),
    digestDir: text(cfg.digestDir) || text(target.digestDir),
  };
}

/**
 * 合并目录：显式传入的（面板刚保存的）优先，其次博客仓库配置，最后给默认值。
 * 返回空串表示「没指定」，调用方应交给适配器默认值，而不是自己猜一个目录。
 *
 * @param {{ panel?: any, project?: any, fallback?: { articleDir?: string, draftDir?: string } }} input
 */
export function pickDirs({ panel, project, fallback = {} } = {}) {
  const fromPanel = projectDirsFrom(panel);
  const fromProject = projectDirsFrom(project);
  return {
    articleDir: fromPanel.articleDir || fromProject.articleDir || text(fallback.articleDir),
    draftDir: fromPanel.draftDir || fromProject.draftDir || text(fallback.draftDir),
    digestDir: fromPanel.digestDir || fromProject.digestDir || text(fallback.digestDir),
  };
}
