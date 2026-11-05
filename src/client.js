window.__ModuleLoader__.load({
  id: 'dsh-hotspot',
  factory: (require) => {
    const React = require('react');
    const h = React.createElement;
    const useState = React.useState;
    const useEffect = React.useEffect;
    const useCallback = React.useCallback;
    const useRef = React.useRef;

    const PANEL_ID = 'dsh-hotspot';
    const API_BASE = '/dsh-hotspot/api';

    /**
     * 当前真正会被抓取的源集合：服务端算好放在 state.activeSources
     * （配置里有源用配置，一个都没写就用内置默认源）。
     * 早期版本这里读 state.config.sources —— 那是「配置文件里的真实内容」，
     * 可能为空，拿它当基底添加源会把默认源一起丢掉。
     */
    const activeSourceList = (state) => {
      if (Array.isArray(state?.activeSources) && state.activeSources.length > 0) return state.activeSources;
      const configured = Array.isArray(state?.config?.sources) ? state.config.sources : [];
      if (configured.length > 0) return configured;
      return Array.isArray(state?.builtinSources) ? state.builtinSources : [];
    };

    // ── 样式体系：融合 DSH 原生主题变量与 Emil Kowalski 高质感设计工程原则 ───
    const STYLES = `
      :root {
        --hs-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
        --hs-ease-spring: cubic-bezier(0.23, 1, 0.32, 1);
      }
      .hs-root {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--dsw-alias-bg-base, #131418);
        color: var(--dsw-alias-label-primary, #ececf1);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
        font-size: 13px;
        line-height: 1.5;
        overflow: hidden;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      /* ── 顶部 Header ── */
      .hs-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px 16px;
        flex-wrap: wrap;
        padding: 12px 24px;
        background: var(--dsw-alias-bg-base, #131418);
        border-bottom: 1px solid var(--dsw-alias-border-l1, #282a32);
        flex-shrink: 0;
        z-index: 10;
      }
      .hs-header-left {
        display: flex;
        align-items: center;
        gap: 14px;
        min-width: 0;
      }
      .hs-header-actions {
        margin-left: auto;
      }
      .hs-back-btn {
        white-space: nowrap;
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: var(--dsw-alias-bg-layer-1, #1a1b22);
        border: 1px solid var(--dsw-alias-border-l1, #282a32);
        border-radius: 8px;
        color: var(--dsw-alias-label-secondary, #9da1b0);
        padding: 6px 10px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        transition: transform 160ms var(--hs-ease-out), border-color 160ms var(--hs-ease-out), color 160ms var(--hs-ease-out), background-color 160ms var(--hs-ease-out);
      }
      .hs-back-btn:hover {
        color: var(--dsw-alias-label-primary, #ffffff);
        border-color: var(--dsw-alias-border-hover, #404452);
        background: var(--dsw-alias-bg-layer-2, #242630);
      }
      .hs-back-btn:active {
        transform: scale(0.97);
      }
      .hs-brand-wrap {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .hs-brand-icon {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: linear-gradient(135deg, rgba(77, 182, 160, 0.22) 0%, rgba(245, 158, 11, 0.18) 100%);
        border: 1px solid rgba(77, 182, 160, 0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--dsw-alias-brand-primary, #4db6a0);
        flex-shrink: 0;
        box-shadow: 0 2px 8px rgba(77, 182, 160, 0.15);
      }
      .hs-title-block {
        display: flex;
        flex-direction: column;
      }
      .hs-title-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .hs-title {
        font-size: 15px;
        font-weight: 600;
        letter-spacing: -0.01em;
        margin: 0;
        color: var(--dsw-alias-label-primary, #f2f3f5);
      }
      .hs-subtitle {
        font-size: 11px;
        color: var(--dsw-alias-label-secondary, #8c909e);
        margin-top: 1px;
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .hs-status-dot {
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #10b981;
        box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
      }
      .hs-status-dot.warn {
        background: #f59e0b;
        box-shadow: 0 0 6px rgba(245, 158, 11, 0.5);
      }
      .hs-header-actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      /* ── 统一按钮规范（带 160ms 物理按压反馈与平滑过渡） ── */
      .hs-btn {
        white-space: nowrap;
        font-family: inherit;
        font-size: 12px;
        font-weight: 500;
        color: var(--dsw-alias-label-primary, #ececf1);
        background: var(--dsw-alias-bg-layer-1, #1e2028);
        border: 1px solid var(--dsw-alias-border-l1, #2d303b);
        border-radius: 7px;
        padding: 6px 14px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        outline: none;
        user-select: none;
        transition: transform 160ms var(--hs-ease-out), background-color 160ms var(--hs-ease-out), border-color 160ms var(--hs-ease-out), color 160ms var(--hs-ease-out), box-shadow 160ms var(--hs-ease-out);
      }
      .hs-btn:hover {
        background: var(--dsw-alias-bg-layer-2, #272a35);
        border-color: var(--dsw-alias-border-hover, #424756);
      }
      .hs-btn:active {
        transform: scale(0.97);
      }
      .hs-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none !important;
      }
      .hs-btn.primary {
        background: linear-gradient(180deg, #53c4ad 0%, #3ca893 100%);
        color: #0b1a16;
        border-color: #389e8a;
        font-weight: 600;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.25);
      }
      .hs-btn.primary:hover {
        background: linear-gradient(180deg, #5bd4bc 0%, #43b39d 100%);
        border-color: #43b39d;
        box-shadow: 0 2px 8px rgba(77, 182, 160, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.35);
      }
      .hs-btn.primary:active {
        transform: scale(0.97);
      }
      .hs-btn.ghost {
        background: transparent;
        border-color: transparent;
        color: var(--dsw-alias-label-secondary, #9da1b0);
      }
      .hs-btn.ghost:hover {
        background: var(--dsw-alias-bg-layer-1, #1e2028);
        color: var(--dsw-alias-label-primary, #ffffff);
      }
      .hs-btn.danger {
        color: #f87171;
        background: rgba(239, 68, 68, 0.08);
        border-color: rgba(239, 68, 68, 0.25);
      }
      .hs-btn.danger:hover {
        background: rgba(239, 68, 68, 0.16);
        border-color: rgba(239, 68, 68, 0.4);
      }

      /* ── 导航 Tabs ── */
      .hs-nav {
        display: flex;
        gap: 6px;
        padding: 6px 24px 0;
        border-bottom: 1px solid var(--dsw-alias-border-l1, #282a32);
        background: var(--dsw-alias-bg-base, #131418);
        flex-shrink: 0;
      }
      .hs-tab {
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        color: var(--dsw-alias-label-secondary, #9195a4);
        padding: 9px 14px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        transition: color 150ms var(--hs-ease-out), border-color 150ms var(--hs-ease-out);
        position: relative;
      }
      .hs-tab:hover {
        color: var(--dsw-alias-label-primary, #ffffff);
      }
      .hs-tab.active {
        color: var(--dsw-alias-brand-primary, #4db6a0);
        border-bottom-color: var(--dsw-alias-brand-primary, #4db6a0);
        font-weight: 600;
      }
      .hs-tab-count {
        font-size: 11px;
        padding: 1px 7px;
        border-radius: 999px;
        background: var(--dsw-alias-bg-layer-1, #1f2129);
        color: var(--dsw-alias-label-secondary, #9195a4);
        font-variant-numeric: tabular-nums;
        font-weight: normal;
        border: 1px solid var(--dsw-alias-border-l1, #2d303b);
      }
      .hs-tab.active .hs-tab-count {
        background: rgba(77, 182, 160, 0.15);
        color: var(--dsw-alias-brand-primary, #4db6a0);
        border-color: rgba(77, 182, 160, 0.3);
      }

      /* ── 内容主区域 ── */
      .hs-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px 24px 64px;
        max-width: 1080px;
        margin: 0 auto;
        width: 100%;
        box-sizing: border-box;
      }

      /* ── 卡片与容器体系 ── */
      .hs-card {
        background: var(--dsw-alias-bg-layer-1, #181920);
        border: 1px solid var(--dsw-alias-border-l1, #282a34);
        border-radius: 10px;
        padding: 16px 18px;
        margin-bottom: 14px;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
        transition: border-color 160ms var(--hs-ease-out), box-shadow 160ms var(--hs-ease-out);
      }
      .hs-card:hover {
        border-color: var(--dsw-alias-border-hover, #373a47);
      }
      .hs-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }
      .hs-card-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--dsw-alias-label-primary, #ececf1);
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .hs-card-subtitle {
        font-size: 12px;
        color: var(--dsw-alias-label-secondary, #8c909e);
        margin-top: 2px;
      }

      /* ── 醒目提示 Alert 条 ── */
      .hs-alert {
        padding: 14px 18px;
        border-radius: 10px;
        background: rgba(245, 158, 11, 0.08);
        border: 1px solid rgba(245, 158, 11, 0.35);
        color: var(--dsw-alias-label-primary, #ececf1);
        margin-bottom: 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .hs-alert-top {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        font-size: 13px;
        color: #fbbf24;
      }
      .hs-alert-desc {
        font-size: 12px;
        color: var(--dsw-alias-label-secondary, #9da1b0);
        line-height: 1.5;
      }

      /* ── 今日状态条：一行说清「今天有几条、什么时候抓的」 ── */
      .hs-today {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        padding: 0 2px 14px;
      }
      .hs-today-count {
        font-size: 15px;
        font-weight: 600;
        letter-spacing: -0.01em;
        color: var(--dsw-alias-label-primary, #f2f3f5);
        font-variant-numeric: tabular-nums;
      }
      .hs-today-src {
        font-size: 11.5px;
        color: #8c909e;
        padding: 1px 8px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.045);
        border: 1px solid var(--dsw-alias-border-l1, #2d303b);
        max-width: 320px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .hs-today-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11.5px;
        color: var(--dsw-alias-label-secondary, #8c909e);
        font-variant-numeric: tabular-nums;
      }
      .hs-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #34d399;
        box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.12);
        flex-shrink: 0;
      }
      .hs-dot.warn {
        background: #f59e0b;
        box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.12);
      }
      .hs-dot.bad {
        background: #f87171;
        box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.12);
      }
      .hs-detail-panel {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
        gap: 12px 20px;
        max-width: 640px;
        padding: 14px 16px;
        margin: 0 0 16px;
        background: var(--dsw-alias-bg-layer-1, #181920);
        border: 1px solid var(--dsw-alias-border-l1, #282a34);
        border-radius: 10px;
      }
      .hs-detail-item b {
        display: block;
        font-size: 16px;
        font-weight: 600;
        line-height: 1.2;
        color: var(--dsw-alias-label-primary, #ececf1);
        font-variant-numeric: tabular-nums;
      }
      .hs-detail-item span {
        font-size: 11px;
        color: var(--dsw-alias-label-secondary, #8c909e);
      }

      /* ── 工具条：搜索 + 分段筛选 ── */
      .hs-tools {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }
      .hs-search {
        position: relative;
        display: flex;
        flex: 1 1 220px;
      }
      .hs-search input {
        width: 100%;
        padding-left: 32px;
        padding-right: 28px;
      }
      .hs-search .hs-search-icon {
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--dsw-alias-label-secondary, #8c909e);
        pointer-events: none;
      }
      .hs-search .hs-search-clear {
        position: absolute;
        right: 6px;
        top: 50%;
        transform: translateY(-50%);
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: var(--dsw-alias-label-secondary, #8c909e);
        cursor: pointer;
        padding: 0;
      }
      .hs-search .hs-search-clear:hover {
        background: var(--dsw-alias-bg-layer-2, #272a35);
        color: var(--dsw-alias-label-primary, #ececf1);
      }
      .hs-seg {
        display: inline-flex;
        gap: 2px;
        padding: 2px;
        background: var(--dsw-alias-bg-layer-1, #181920);
        border: 1px solid var(--dsw-alias-border-l1, #282a34);
        border-radius: 8px;
      }
      .hs-seg button {
        font-family: inherit;
        font-size: 12px;
        font-weight: 500;
        padding: 4px 10px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--dsw-alias-label-secondary, #9195a4);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        transition: background-color 140ms var(--hs-ease-out), color 140ms var(--hs-ease-out);
      }
      .hs-seg button:hover {
        color: var(--dsw-alias-label-primary, #ececf1);
      }
      .hs-seg button.on {
        background: rgba(77, 182, 160, 0.14);
        color: #6fd6c0;
        box-shadow: inset 0 0 0 1px rgba(77, 182, 160, 0.28);
      }
      .hs-seg button b {
        font-size: 11px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        opacity: 0.7;
      }

      /* ── 候选列表：一条一条排，不做 15 张浮动卡片 ── */
      .hs-list {
        background: var(--dsw-alias-bg-layer-1, #181920);
        border: 1px solid var(--dsw-alias-border-l1, #282a34);
        border-radius: 12px;
        overflow: hidden;
      }
      .hs-row {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 13px 15px 13px 10px;
        transition: background-color 140ms var(--hs-ease-out);
      }
      .hs-row + .hs-row {
        border-top: 1px solid var(--dsw-alias-border-l1, #282a34);
      }
      .hs-row:hover {
        background: rgba(255, 255, 255, 0.022);
      }
      .hs-row-rank {
        flex-shrink: 0;
        width: 24px;
        padding-top: 2px;
        text-align: right;
        font-size: 12px;
        font-weight: 500;
        color: #6b7080;
        font-variant-numeric: tabular-nums;
      }
      .hs-row.top .hs-row-rank {
        color: var(--dsw-alias-brand-primary, #4db6a0);
        font-weight: 700;
      }
      .hs-row-main {
        flex: 1;
        min-width: 0;
      }
      .hs-row-title {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        font-size: 14px;
        font-weight: 600;
        line-height: 1.45;
        color: var(--dsw-alias-label-primary, #ececf1);
        text-decoration: none;
        transition: color 140ms var(--hs-ease-out);
      }
      .hs-row-title:hover {
        color: var(--dsw-alias-brand-primary, #4db6a0);
      }
      .hs-row-summary {
        margin-top: 4px;
        font-size: 12px;
        line-height: 1.6;
        color: var(--dsw-alias-label-secondary, #9da1b0);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .hs-row-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        margin-top: 7px;
        font-size: 11.5px;
        color: #7d8291;
      }
      .hs-badge-multi {
        font-size: 10.5px;
        padding: 1px 7px;
        border-radius: 999px;
        color: #7fdcc9;
        background: rgba(77, 182, 160, 0.12);
        border: 1px solid rgba(77, 182, 160, 0.28);
        white-space: nowrap;
      }
      .hs-row-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
        padding-top: 1px;
      }
      /* 动作按钮平时压到很低的存在感：列表扫读时不该被 15 个按钮打断。 */
      .hs-row-btn {
        padding: 5px 12px;
        font-size: 12px;
        opacity: 0.4;
        transition: opacity 140ms var(--hs-ease-out), background-color 140ms var(--hs-ease-out), border-color 140ms var(--hs-ease-out), color 140ms var(--hs-ease-out);
      }
      .hs-row:hover .hs-row-btn,
      .hs-row-btn:focus-visible {
        opacity: 1;
      }
      .hs-row:hover .hs-row-btn {
        background: rgba(77, 182, 160, 0.12);
        border-color: rgba(77, 182, 160, 0.4);
        color: #7fdcc9;
      }
      @media (hover: none) {
        .hs-row-btn { opacity: 0.85; }
      }

      /* ── 今日订阅文章（原样保留原始条目，轻量呈现） ── */
      .hs-rss-url {
        display: block;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 11.5px;
        color: var(--dsw-alias-label-secondary, #9da1b0);
        background: var(--dsw-alias-bg-base, #131418);
        border: 1px solid var(--dsw-alias-border-l1, #2d303b);
        border-radius: 7px;
        padding: 8px 10px;
        overflow-x: auto;
        white-space: nowrap;
      }
      .hs-feed-row:hover {
        background: rgba(255, 255, 255, 0.02);
      }
      .hs-feed-sum {
        margin-top: 3px;
        font-size: 12px;
        line-height: 1.55;
        color: var(--dsw-alias-label-secondary, #8c909e);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .hs-feed-summary {
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        overflow: hidden;
        font-size: 11.5px;
        color: var(--dsw-alias-label-secondary, #8c909e);
      }
      .hs-candidate-meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin-top: 6px;
        font-size: 12px;
        color: var(--dsw-alias-label-secondary, #8c909e);
      }
      .hs-tag-pill {
        font-size: 11px;
        padding: 2px 7px;
        border-radius: 999px;
        background: var(--dsw-alias-bg-layer-2, #21232d);
        border: 1px solid var(--dsw-alias-border-l1, #2c2f3a);
        color: var(--dsw-alias-label-secondary, #9da1b0);
        white-space: nowrap;
      }
      .hs-tag-pill.ai {
        color: #38bdf8;
        border-color: rgba(56, 189, 248, 0.3);
        background: rgba(56, 189, 248, 0.08);
      }
      .hs-tag-pill.code {
        color: #a78bfa;
        border-color: rgba(167, 139, 250, 0.3);
        background: rgba(167, 139, 250, 0.08);
      }

      /* ── 折叠详情 ── */
      .hs-details {
        margin-top: 10px;
        font-size: 12px;
      }
      .hs-details summary {
        cursor: pointer;
        color: var(--dsw-alias-label-secondary, #8c909e);
        user-select: none;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-weight: 500;
        transition: color 150ms var(--hs-ease-out);
      }
      .hs-details summary:hover {
        color: var(--dsw-alias-label-primary, #ffffff);
      }
      .hs-details-panel {
        margin-top: 8px;
        padding: 10px 14px;
        background: var(--dsw-alias-bg-layer-2, #1f212a);
        border: 1px solid var(--dsw-alias-border-l1, #2a2c38);
        border-radius: 8px;
        color: var(--dsw-alias-label-secondary, #9da1b0);
      }

      /* ── 表单控件规范 ── */
      .hs-form-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 14px;
      }
      .hs-form-item {
        display: flex;
        flex-direction: column;
      }
      .hs-form-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--dsw-alias-label-primary, #ececf1);
        margin-bottom: 6px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .hs-input, .hs-select, .hs-textarea {
        font-family: inherit;
        font-size: 13px;
        color: var(--dsw-alias-label-primary, #ececf1);
        background: var(--dsw-alias-bg-layer-2, #1f212a);
        border: 1px solid var(--dsw-alias-border-l1, #2d303b);
        border-radius: 8px;
        padding: 8px 12px;
        outline: none;
        box-sizing: border-box;
        transition: border-color 160ms var(--hs-ease-out), box-shadow 160ms var(--hs-ease-out);
      }
      .hs-input:focus, .hs-select:focus, .hs-textarea:focus {
        border-color: var(--dsw-alias-brand-primary, #4db6a0);
        box-shadow: 0 0 0 2px rgba(77, 182, 160, 0.2);
      }
      .hs-input::placeholder, .hs-textarea::placeholder {
        color: #5d6170;
      }
      .hs-textarea {
        resize: vertical;
        line-height: 1.5;
      }
      .hs-form-hint {
        font-size: 11px;
        color: var(--dsw-alias-label-secondary, #808493);
        margin-top: 5px;
        line-height: 1.4;
      }

      /* ── 订阅源页：单行添加 + 行式清单 ── */
      .hs-src-add {
        display: grid;
        grid-template-columns: 132px 170px 1fr auto;
        gap: 8px;
        align-items: center;
      }
      .hs-src-add.hn {
        grid-template-columns: 132px 150px 1fr 120px auto;
      }
      @media (max-width: 900px) {
        .hs-src-add,
        .hs-src-add.hn { grid-template-columns: 1fr; }
      }
      .hs-src-rows { display: flex; flex-direction: column; }
      .hs-src-row {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 12px;
        align-items: center;
        padding: 11px 2px;
        border-top: 1px solid var(--dsw-alias-border-l1, #282a34);
      }
      .hs-src-row:first-child { border-top: 0; }
      .hs-src-row.pending { opacity: 0.72; }
      .hs-src-main { min-width: 0; }
      .hs-src-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 600;
        flex-wrap: wrap;
      }
      .hs-src-target {
        margin-top: 2px;
        font-size: 11.5px;
        color: var(--dsw-alias-label-secondary, #7c8290);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .hs-src-kind {
        font-size: 10.5px;
        padding: 2px 7px;
        border-radius: 999px;
        border: 1px solid var(--dsw-alias-border-l1, #343845);
        background: var(--dsw-alias-bg-layer-2, #1f212a);
        color: var(--dsw-alias-label-secondary, #9aa0ae);
        white-space: nowrap;
      }
      .hs-src-kind.rss { color: #7dd3fc; border-color: rgba(125, 211, 252, 0.28); background: rgba(56, 189, 248, 0.07); }
      .hs-src-kind.release { color: #c4b5fd; border-color: rgba(196, 181, 253, 0.28); background: rgba(167, 139, 250, 0.08); }
      .hs-src-kind.hn { color: #fbbf24; border-color: rgba(251, 191, 36, 0.25); background: rgba(245, 158, 11, 0.08); }
      .hs-src-builtin { color: #a5b4fc; border-color: rgba(99, 102, 241, 0.35); background: rgba(99, 102, 241, 0.16); }
      .hs-src-actions { display: flex; gap: 4px; align-items: center; }
      .hs-src-suggest {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 12px;
        margin-top: 10px;
        border: 1px dashed var(--dsw-alias-border-l1, #343845);
        border-radius: 9px;
        font-size: 12px;
        color: var(--dsw-alias-label-secondary, #9aa0ae);
      }
      .hs-src-suggest strong { color: var(--dsw-alias-label-primary, #ececf1); font-weight: 600; }
      .hs-src-rss {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 9px 14px;
        border: 1px solid var(--dsw-alias-border-l1, #282a34);
        border-radius: 10px;
        background: var(--dsw-alias-bg-layer-1, #181920);
      }
      .hs-src-rss-label { font-size: 11.5px; color: var(--dsw-alias-label-secondary, #7c8290); white-space: nowrap; }
      .hs-src-rss-url {
        flex: 1;
        min-width: 0;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 11.5px;
        color: var(--dsw-alias-label-secondary, #9aa0ae);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* ── 设置页：锚点跳转 / 折叠行 / 更紧的间距节奏 ── */
      .hs-cfg-jump {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin: -4px 0 16px;
      }
      .hs-cfg-jump button {
        font-family: inherit;
        font-size: 11.5px;
        color: var(--dsw-alias-label-secondary, #9aa0ae);
        background: transparent;
        border: 1px solid var(--dsw-alias-border-l1, #2d303b);
        border-radius: 999px;
        padding: 3px 10px;
        cursor: pointer;
        transition: color 140ms var(--hs-ease-out), border-color 140ms var(--hs-ease-out);
      }
      .hs-cfg-jump button:hover {
        color: var(--dsw-alias-label-primary, #ececf1);
        border-color: var(--dsw-alias-border-hover, #3a3e4c);
      }
      .hs-cfg-fold {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
        margin-top: 2px;
        padding: 9px 0 0;
        background: transparent;
        border: 0;
        border-top: 1px dashed var(--dsw-alias-border-l1, #282a34);
        color: var(--dsw-alias-label-secondary, #8c909e);
        font-family: inherit;
        font-size: 11.5px;
        cursor: pointer;
      }
      .hs-cfg-fold:hover { color: var(--dsw-alias-label-primary, #ececf1); }
      /* 间距只在这个页面收：四组之间 26，组内卡片 10，字段行列 12 */
      .hs-cfg-section { margin-bottom: 26px; }
      .hs-cfg-section .hs-card { margin-bottom: 10px; }
      .hs-cfg-section .hs-card:last-child { margin-bottom: 0; }
      .hs-cfg-section .hs-form-grid { gap: 12px 14px; }
      .hs-cfg-overview { margin-bottom: 16px; }
      .hs-cfg-stat { padding: 9px 13px; }
      .hs-cfg-section-head { margin: 0 2px 10px; }

      /* ── 设置页：概览条 / 分组 / 字段 / 常驻保存条 ── */
      .hs-cfg-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
        margin-bottom: 14px;
      }
      .hs-cfg-title {
        font-size: 15px;
        font-weight: 650;
        letter-spacing: -0.01em;
      }
      .hs-cfg-subtitle {
        font-size: 12px;
        color: var(--dsw-alias-label-secondary, #8c909e);
        margin-top: 3px;
      }
      .hs-cfg-overview {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 1px;
        background: var(--dsw-alias-border-l1, #282a34);
        border: 1px solid var(--dsw-alias-border-l1, #282a34);
        border-radius: 10px;
        overflow: hidden;
        margin-bottom: 20px;
      }
      .hs-cfg-stat {
        background: var(--dsw-alias-bg-layer-1, #181920);
        padding: 10px 13px;
      }
      .hs-cfg-stat-label {
        font-size: 10.5px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--dsw-alias-label-secondary, #8c909e);
      }
      .hs-cfg-stat-value {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 3px;
        font-size: 13px;
        font-weight: 600;
        color: var(--dsw-alias-label-primary, #ececf1);
        min-width: 0;
      }
      .hs-cfg-stat-value .weak {
        font-size: 11px;
        font-weight: 400;
        color: var(--dsw-alias-label-secondary, #8c909e);
      }
      .hs-cfg-stat-value .path {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 11.5px;
        font-weight: 500;
        color: var(--dsw-alias-label-secondary, #9da1b0);
      }
      .hs-cfg-section { margin-bottom: 20px; }
      .hs-cfg-section-head {
        display: flex;
        align-items: baseline;
        gap: 10px;
        margin: 0 2px 9px;
      }
      .hs-cfg-section-title {
        font-size: 11.5px;
        font-weight: 650;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--dsw-alias-label-secondary, #9da1b0);
      }
      .hs-cfg-section-note {
        font-size: 11.5px;
        color: var(--dsw-alias-label-secondary, #7c8290);
      }
      .hs-cfg-field { display: flex; flex-direction: column; min-width: 0; }
      .hs-cfg-field-label {
        display: flex;
        align-items: baseline;
        gap: 6px;
        font-size: 11.5px;
        font-weight: 600;
        color: var(--dsw-alias-label-primary, #ececf1);
        margin-bottom: 5px;
      }
      .hs-cfg-key {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 10.5px;
        font-weight: 500;
        color: var(--dsw-alias-label-secondary, #7c8290);
      }
      .hs-cfg-input-row { display: flex; align-items: center; gap: 8px; }
      .hs-cfg-unit {
        flex: none;
        font-size: 10.5px;
        color: var(--dsw-alias-label-secondary, #8c909e);
        background: var(--dsw-alias-bg-layer-2, #21232d);
        border: 1px solid var(--dsw-alias-border-l1, #2c2f3a);
        border-radius: 5px;
        padding: 1px 6px;
        white-space: nowrap;
      }
      .hs-cfg-mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
      }
      .hs-cfg-state {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        padding: 3px 9px;
        border-radius: 999px;
        white-space: nowrap;
        border: 1px solid transparent;
      }
      .hs-cfg-state.ok { color: #34d399; background: rgba(52, 211, 153, 0.10); border-color: rgba(52, 211, 153, 0.28); }
      .hs-cfg-state.warn { color: #fbbf24; background: rgba(245, 158, 11, 0.10); border-color: rgba(245, 158, 11, 0.28); }
      .hs-cfg-state.idle { color: #94a3b8; background: rgba(148, 163, 184, 0.10); border-color: rgba(148, 163, 184, 0.24); }
      .hs-cfg-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
      .hs-cfg-model-row {
        display: grid;
        grid-template-columns: 96px 1fr;
        gap: 10px;
        align-items: center;
        margin-bottom: 9px;
      }
      .hs-cfg-segmented {
        display: inline-flex;
        gap: 2px;
        padding: 2px;
        background: var(--dsw-alias-bg-layer-2, #1f212a);
        border: 1px solid var(--dsw-alias-border-l1, #2d303b);
        border-radius: 8px;
      }
      .hs-cfg-segmented button {
        font-family: inherit;
        font-size: 11.5px;
        color: var(--dsw-alias-label-secondary, #8c909e);
        background: transparent;
        border: 0;
        border-radius: 6px;
        padding: 5px 11px;
        cursor: pointer;
        transition: background 140ms var(--hs-ease-out), color 140ms var(--hs-ease-out);
      }
      .hs-cfg-segmented button.on {
        background: var(--dsw-alias-bg-layer-1, #23252f);
        color: var(--dsw-alias-label-primary, #ececf1);
        font-weight: 600;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
      }
      .hs-cfg-effective { margin-top: 12px; display: flex; flex-direction: column; gap: 3px; }
      .hs-cfg-effective div { font-size: 11px; color: var(--dsw-alias-label-secondary, #7c8290); }
      .hs-cfg-effective code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 11px;
        color: #93c5fd;
      }
      .hs-cfg-timeline {
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px dashed var(--dsw-alias-border-l1, #282a34);
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        font-size: 11.5px;
        color: var(--dsw-alias-label-secondary, #8c909e);
      }
      /* 真正的面板底栏：在滚动容器之外，不靠 sticky 与负 margin 去凑边距 */
      .hs-cfg-savebar {
        flex: none;
        padding: 10px 24px;
        background: var(--dsw-alias-bg-layer-1, #181920);
        border-top: 1px solid var(--dsw-alias-border-l1, #282a34);
      }
      .hs-cfg-savebar-inner {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        max-width: 1080px;
        margin: 0 auto;
      }
      .hs-cfg-dirty {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11.5px;
        color: #fbbf24;
      }
      .hs-cfg-dirty.clean { color: var(--dsw-alias-label-secondary, #7c8290); }
      .hs-cfg-spacer { flex: 1; }

      /* ── 表格规范 ── */
      .hs-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
      }
      .hs-table th {
        text-align: left;
        padding: 10px 12px;
        font-size: 12px;
        font-weight: 600;
        color: var(--dsw-alias-label-secondary, #8c909e);
        border-bottom: 1px solid var(--dsw-alias-border-l1, #282a34);
        background: var(--dsw-alias-bg-layer-2, #1b1c24);
      }
      .hs-table th:first-child {
        border-top-left-radius: 8px;
      }
      .hs-table th:last-child {
        border-top-right-radius: 8px;
      }
      .hs-table td {
        padding: 12px;
        border-bottom: 1px solid var(--dsw-alias-border-l1, #282a34);
        font-size: 13px;
        vertical-align: middle;
      }
      .hs-table tr:hover td {
        background: rgba(255, 255, 255, 0.02);
      }

      /* ── 草稿箱：工具行 / 标签筛选 / 可点击卡片 ── */
      .hs-drafts-toolbar {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .hs-search-box {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1 1 240px;
        min-width: 180px;
        padding: 0 10px;
        background: var(--dsw-alias-bg-layer-2, #1f212a);
        border: 1px solid var(--dsw-alias-border-l1, #2d303b);
        border-radius: 8px;
        transition: border-color 160ms var(--hs-ease-out);
      }
      .hs-search-box:focus-within {
        border-color: var(--dsw-alias-brand-primary, #4db6a0);
      }
      .hs-search-icon {
        color: var(--dsw-alias-label-secondary, #8c909e);
        flex-shrink: 0;
      }
      .hs-search-input {
        flex: 1;
        padding: 7px 0;
        background: transparent;
        border: none;
        color: var(--dsw-alias-label-primary, #ececf1);
        font-family: inherit;
        font-size: 12.5px;
        outline: none;
      }
      .hs-search-input:focus {
        box-shadow: none;
      }
      .hs-drafts-count {
        font-size: 12px;
        color: var(--dsw-alias-label-secondary, #8c909e);
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .hs-drafts-tags {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--dsw-alias-border-l1, #282a34);
      }
      .hs-drafts-tags-label {
        font-size: 11px;
        color: var(--dsw-alias-label-secondary, #8c909e);
        margin-right: 2px;
      }
      .hs-filter-tag {
        font-size: 11px;
        padding: 3px 9px;
        border-radius: 999px;
        border: 1px solid var(--dsw-alias-border-l1, #2d303b);
        background: transparent;
        color: var(--dsw-alias-label-secondary, #9da1b0);
        cursor: pointer;
        transition: color 120ms ease, border-color 120ms ease, background 120ms ease;
      }
      .hs-filter-tag:hover {
        color: var(--dsw-alias-label-primary, #ececf1);
        border-color: var(--dsw-alias-border-hover, #424756);
      }
      .hs-filter-tag.active {
        color: var(--dsw-alias-brand-primary, #4db6a0);
        border-color: rgba(77, 182, 160, 0.4);
        background: rgba(77, 182, 160, 0.1);
      }
      .hs-drafts-list {
        margin-top: 14px;
      }
      .hs-drafts-empty {
        padding: 34px 0 26px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .hs-draft-card {
        cursor: pointer;
      }
      .hs-draft-card:hover {
        border-color: rgba(77, 182, 160, 0.45);
      }
      .hs-draft-card:active {
        transform: scale(0.995);
      }
      .hs-draft-date {
        font-size: 11px;
        color: var(--dsw-alias-label-secondary, #8c909e);
        flex-shrink: 0;
        font-variant-numeric: tabular-nums;
      }
      .hs-draft-desc {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .hs-draft-actions {
        display: flex;
        gap: 6px;
        margin-left: auto;
        align-items: center;
      }

      /* ── 弹窗 Modal ── */
      .hs-modal-mask {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.72);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1200;
        backdrop-filter: blur(4px);
        animation: hs-fade-mask 160ms var(--hs-ease-out);
      }
      .hs-modal {
        background: var(--dsw-alias-bg-layer-1, #1a1c24);
        border: 1px solid var(--dsw-alias-border-l1, #2f323f);
        border-radius: 12px;
        width: 520px;
        max-width: 92vw;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
        overflow: hidden;
        animation: hs-scale-up 180ms var(--hs-ease-spring);
        transform-origin: center center;
      }
      .hs-modal-header {
        padding: 16px 20px;
        border-bottom: 1px solid var(--dsw-alias-border-l1, #282a34);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .hs-modal-title {
        font-size: 15px;
        font-weight: 600;
        margin: 0;
        color: var(--dsw-alias-label-primary, #ececf1);
      }
      .hs-modal-body {
        padding: 20px;
        line-height: 1.6;
      }
      .hs-modal-footer {
        padding: 14px 20px;
        border-top: 1px solid var(--dsw-alias-border-l1, #282a34);
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        background: var(--dsw-alias-bg-base, #131418);
      }

      /* ── 浮动 Toast ── */
      .hs-toast {
        position: fixed;
        bottom: 28px;
        right: 28px;
        padding: 12px 18px;
        border-radius: 9px;
        background: #1e202a;
        border: 1px solid #333644;
        border-left: 4px solid var(--dsw-alias-brand-primary, #4db6a0);
        color: #f1f2f6;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
        z-index: 2000;
        font-size: 13px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 8px;
        animation: hs-toast-enter 220ms var(--hs-ease-spring);
      }
      .hs-toast.err {
        border-left-color: #ef4444;
      }

      /* ── 所有文章卡片与列表规范 ── */
      .hs-article-card {
        background: var(--dsw-alias-bg-layer-2, #1b1c24);
        border: 1px solid var(--dsw-alias-border-l1, #282a34);
        border-radius: 10px;
        padding: 14px 16px;
        margin-bottom: 10px;
        transition: border-color 160ms var(--hs-ease-out), transform 160ms var(--hs-ease-out);
      }
      .hs-article-card:hover {
        border-color: rgba(77, 182, 160, 0.4);
      }
      .hs-article-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .hs-article-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--dsw-alias-label-primary, #ececf1);
        line-height: 1.4;
      }
      .hs-article-meta {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 11px;
        color: var(--dsw-alias-label-secondary, #8c909e);
        flex-wrap: wrap;
        margin-top: 6px;
      }
      .hs-article-desc {
        font-size: 12px;
        color: var(--dsw-alias-label-secondary, #a0a4b4);
        margin-top: 6px;
        line-height: 1.5;
      }
      .hs-article-file {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 11px;
        color: #7b8092;
        background: rgba(255, 255, 255, 0.04);
        padding: 2px 6px;
        border-radius: 4px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        user-select: text;
        transition: background 140ms ease, color 140ms ease;
      }
      .hs-article-file:hover {
        color: var(--dsw-alias-label-primary, #ececf1);
        background: rgba(255, 255, 255, 0.08);
      }

      /* ── Markdown 在线编辑器与预览全屏模态框 ── */
      .hs-editor-modal {
        width: 94vw;
        max-width: 1380px;
        height: 88vh;
        max-height: 920px;
        background: var(--dsw-alias-bg-layer-1, #181920);
        border: 1px solid var(--dsw-alias-border-l1, #282a34);
        border-radius: 12px;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.65), 0 4px 16px rgba(0, 0, 0, 0.35);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: hs-scale-up 200ms var(--hs-ease-spring) forwards;
      }
      .hs-editor-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 18px;
        border-bottom: 1px solid var(--dsw-alias-border-l1, #282a34);
        background: var(--dsw-alias-bg-layer-2, #1c1d26);
        gap: 12px;
        flex-shrink: 0;
      }
      .hs-editor-tabs {
        display: inline-flex;
        background: rgba(0, 0, 0, 0.25);
        padding: 3px;
        border-radius: 6px;
        border: 1px solid var(--dsw-alias-border-l1, #282a34);
        gap: 2px;
      }
      .hs-editor-tab-btn {
        background: transparent;
        border: none;
        color: var(--dsw-alias-label-secondary, #8c909e);
        font-size: 12px;
        font-weight: 500;
        padding: 4px 10px;
        border-radius: 4px;
        cursor: pointer;
        transition: color 120ms ease, background 120ms ease;
      }
      .hs-editor-tab-btn.active {
        background: var(--dsw-alias-bg-layer-1, #242632);
        color: var(--dsw-alias-label-primary, #ffffff);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
      }
      .hs-editor-body {
        flex: 1;
        display: flex;
        overflow: hidden;
        min-height: 0;
      }
      /* ── 证据账本（sources.json）横条 ── */
      .hs-evidence {
        flex-shrink: 0;
        border-bottom: 1px solid var(--dsw-alias-border-l1, #282a34);
        background: rgba(99, 102, 241, 0.06);
      }
      .hs-evidence-toggle {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 8px 18px;
        background: transparent;
        border: none;
        color: var(--dsw-alias-label-secondary, #9da1b0);
        font-size: 12px;
        cursor: pointer;
        text-align: left;
        transition: background 140ms ease, color 140ms ease;
      }
      .hs-evidence-toggle:hover {
        background: rgba(99, 102, 241, 0.1);
        color: var(--dsw-alias-label-primary, #ececf1);
      }
      .hs-evidence-hosts {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        opacity: 0.75;
      }
      .hs-evidence-caret {
        opacity: 0.6;
        font-size: 11px;
      }
      .hs-evidence-list {
        max-height: 30vh;
        overflow-y: auto;
        padding: 0 18px 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .hs-evidence-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 8px 10px;
        border-radius: 6px;
        background: rgba(0, 0, 0, 0.22);
        border: 1px solid var(--dsw-alias-border-l1, #282a34);
      }
      .hs-evidence-link {
        color: #8b9cff;
        font-size: 12px;
        font-weight: 500;
        text-decoration: none;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .hs-evidence-link:hover {
        text-decoration: underline;
      }
      .hs-evidence-meta {
        font-size: 11px;
        color: var(--dsw-alias-label-secondary, #8c909e);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      .hs-evidence-preview {
        font-size: 11px;
        line-height: 1.5;
        color: var(--dsw-alias-label-secondary, #9da1b0);
        opacity: 0.8;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .hs-editor-textarea {
        flex: 1;
        height: 100%;
        background: var(--dsw-alias-bg-base, #121319);
        color: var(--dsw-alias-label-primary, #e6edf3);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        font-size: 13px;
        line-height: 1.6;
        padding: 18px;
        border: none;
        outline: none;
        resize: none;
        overflow-y: auto;
        tab-size: 2;
      }
      .hs-preview-pane {
        flex: 1;
        height: 100%;
        background: var(--dsw-alias-bg-layer-1, #181920);
        border-left: 1px solid var(--dsw-alias-border-l1, #282a34);
        padding: 24px 28px;
        overflow-y: auto;
        color: var(--dsw-alias-label-primary, #e6edf3);
        line-height: 1.7;
        font-size: 14px;
      }
      .hs-preview-pane h1 {
        font-size: 22px;
        font-weight: 700;
        margin: 0 0 16px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--dsw-alias-border-l1, #282a34);
      }
      .hs-preview-pane h2 {
        font-size: 18px;
        font-weight: 600;
        margin: 20px 0 12px;
      }
      .hs-preview-pane h3 {
        font-size: 15px;
        font-weight: 600;
        margin: 16px 0 8px;
      }
      .hs-preview-pane p {
        margin: 0 0 14px;
      }
      .hs-preview-pane blockquote {
        margin: 14px 0;
        padding: 8px 16px;
        border-left: 3px solid var(--dsw-alias-brand-primary, #4db6a0);
        background: rgba(77, 182, 160, 0.06);
        border-radius: 0 6px 6px 0;
        color: var(--dsw-alias-label-secondary, #a8abb6);
      }
      .hs-preview-pane blockquote p {
        margin: 0;
      }
      .hs-preview-pane pre {
        background: var(--dsw-alias-bg-base, #111218);
        border: 1px solid var(--dsw-alias-border-l1, #282a34);
        padding: 12px 16px;
        border-radius: 6px;
        overflow-x: auto;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        line-height: 1.5;
        margin: 14px 0;
      }
      .hs-preview-pane code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        background: rgba(255, 255, 255, 0.06);
        padding: 2px 5px;
        border-radius: 4px;
        font-size: 12px;
      }
      .hs-preview-pane pre code {
        background: transparent;
        padding: 0;
      }
      .hs-preview-pane ul, .hs-preview-pane ol {
        margin: 0 0 14px 20px;
        padding: 0;
      }
      .hs-preview-pane li {
        margin-bottom: 4px;
      }
      .hs-preview-pane hr {
        border: none;
        border-top: 1px solid var(--dsw-alias-border-l1, #282a34);
        margin: 20px 0;
      }
      .hs-preview-pane a {
        color: var(--dsw-alias-brand-primary, #4db6a0);
        text-decoration: none;
      }
      .hs-preview-pane a:hover {
        text-decoration: underline;
      }
      .hs-preview-frontmatter {
        background: rgba(0, 0, 0, 0.25);
        border: 1px dashed var(--dsw-alias-border-l1, #282a34);
        border-radius: 6px;
        padding: 10px 14px;
        margin-bottom: 18px;
        font-family: ui-monospace, monospace;
        font-size: 11px;
        color: #8c909e;
      }

      /* ── 博客正文查看：按站点暗色主题的排版近似渲染 ──────────────
         数值对着站点自己的版式令牌（docs/.vitepress/theme/custom.css：
         40rem 行宽、16px 正文、1.8 行高、h2 1.5rem / h3 1.1875rem）。
         目的不是像素级还原，而是「结构对不对」一眼看得出来。 */
      .hs-bp-modal {
        display: flex;
        flex-direction: column;
        width: 900px;
        max-width: 94vw;
        max-height: 88vh;
        background: #16161a;
        border: 1px solid #2e2e32;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 24px 48px rgba(0, 0, 0, 0.65);
      }
      .hs-bp-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 20px;
        border-bottom: 1px solid #2e2e32;
        background: #1b1b1f;
      }
      .hs-bp-header-title {
        font-size: 14px;
        font-weight: 600;
        color: #dfdfd6;
      }
      .hs-bp-header-sub {
        font-size: 11px;
        color: #8c909e;
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .hs-bp-scroll {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 40px 40px 56px;
      }
      .hs-bp {
        max-width: 40rem;
        margin: 0 auto;
        font-size: 16px;
        line-height: 1.8;
        letter-spacing: 0.012em;
        color: rgba(255, 255, 245, 0.86);
        word-break: break-word;
      }
      .hs-bp-title {
        margin: 0 0 12px;
        font-size: 2rem;
        line-height: 1.22;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: #dfdfd6;
      }
      .hs-bp-meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 12px;
        margin: 0 0 32px;
        font-size: 12.5px;
        color: rgba(235, 235, 245, 0.6);
        font-variant-numeric: tabular-nums;
      }
      .hs-bp-tag {
        padding: 2px 8px;
        border: 1px solid #2e2e32;
        border-radius: 999px;
        font-size: 11.5px;
      }
      .hs-bp h1,
      .hs-bp h2,
      .hs-bp h3,
      .hs-bp h4,
      .hs-bp h5,
      .hs-bp h6 {
        color: #dfdfd6;
        letter-spacing: -0.014em;
        scroll-margin-top: 80px;
      }
      .hs-bp h2 {
        margin: 48px 0 16px;
        font-size: 1.5rem;
        line-height: 1.35;
        font-weight: 600;
      }
      .hs-bp h2::before {
        content: "";
        display: block;
        width: 2.25rem;
        height: 1px;
        margin-bottom: 16px;
        background: rgba(255, 255, 255, 0.24);
      }
      .hs-bp h3 {
        margin: 36px 0 12px;
        font-size: 1.1875rem;
        line-height: 1.5;
        font-weight: 600;
      }
      .hs-bp h4 {
        margin: 28px 0 10px;
        font-size: 1.0625rem;
        font-weight: 600;
      }
      .hs-bp p {
        margin: 20px 0;
        line-height: 1.8;
      }
      .hs-bp a {
        color: #a8b1ff;
        text-decoration: underline;
        text-decoration-thickness: 1px;
        text-underline-offset: 3px;
        text-decoration-color: rgba(168, 177, 255, 0.45);
      }
      .hs-bp a:hover {
        text-decoration-color: currentColor;
      }
      .hs-bp strong {
        color: #ffffff;
        font-weight: 600;
      }
      .hs-bp ul,
      .hs-bp ol {
        margin: 20px 0;
        padding-left: 1.5rem;
      }
      .hs-bp li {
        margin: 8px 0;
        line-height: 1.8;
      }
      .hs-bp li::marker {
        color: rgba(235, 235, 245, 0.38);
      }
      .hs-bp li > ul,
      .hs-bp li > ol {
        margin: 8px 0 0;
      }
      .hs-bp-task {
        list-style: none;
        margin-left: -1.3rem;
      }
      .hs-bp-check {
        display: inline-block;
        width: 15px;
        height: 15px;
        margin-right: 8px;
        border: 1px solid #3a3e4d;
        border-radius: 4px;
        font-size: 10px;
        line-height: 14px;
        text-align: center;
        color: transparent;
        vertical-align: -2px;
      }
      .hs-bp-check.on {
        border-color: rgba(168, 177, 255, 0.6);
        background: rgba(168, 177, 255, 0.22);
        color: #cfd4ff;
      }
      .hs-bp blockquote {
        margin: 28px 0;
        padding: 2px 0 2px 20px;
        border-left: 2px solid rgba(168, 177, 255, 0.4);
        color: rgba(235, 235, 245, 0.6);
      }
      .hs-bp blockquote > p {
        margin: 0;
        font-size: 0.9375rem;
        line-height: 1.75;
      }
      .hs-bp hr {
        margin: 40px 0;
        border: 0;
        border-top: 1px solid #2e2e32;
      }
      .hs-bp img {
        display: block;
        max-width: 100%;
        margin: 24px 0;
        border-radius: 8px;
      }
      .hs-bp :not(pre) > code {
        padding: 0.15em 0.4em;
        border-radius: 5px;
        background: rgba(255, 255, 255, 0.06);
        font-size: 0.875em;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        color: #dfdfd6;
      }
      .hs-bp-code {
        position: relative;
        margin: 28px 0;
        border: 1px solid #2e2e32;
        border-radius: 10px;
        background: #101014;
        overflow: hidden;
      }
      .hs-bp-code pre {
        margin: 0;
        padding: 18px 20px;
        overflow-x: auto;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 13px;
        line-height: 1.7;
        color: #c9cdd8;
      }
      .hs-bp-code-lang {
        position: absolute;
        top: 6px;
        right: 12px;
        font-size: 11px;
        color: #5d6170;
        text-transform: lowercase;
      }
      .hs-bp-table-wrap {
        margin: 28px 0;
        overflow-x: auto;
      }
      .hs-bp table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9375rem;
      }
      .hs-bp th,
      .hs-bp td {
        padding: 8px 12px;
        border: 1px solid #2e2e32;
        text-align: left;
        line-height: 1.6;
      }
      .hs-bp th {
        background: rgba(255, 255, 255, 0.03);
        font-weight: 600;
      }
      .hs-bp-container {
        margin: 24px 0;
        padding: 12px 16px;
        border-left: 3px solid #64748b;
        border-radius: 8px;
        background: rgba(148, 163, 184, 0.08);
      }
      .hs-bp-container-title {
        margin-bottom: 6px;
        font-size: 13px;
        font-weight: 600;
      }
      .hs-bp-container p {
        margin: 8px 0;
        font-size: 0.9375rem;
      }
      .hs-bp-tip {
        border-left-color: #a8b1ff;
        background: rgba(168, 177, 255, 0.09);
      }
      .hs-bp-tip .hs-bp-container-title { color: #cfd4ff; }
      .hs-bp-info {
        border-left-color: #60a5fa;
        background: rgba(96, 165, 250, 0.09);
      }
      .hs-bp-info .hs-bp-container-title { color: #93c5fd; }
      .hs-bp-warning {
        border-left-color: #fbbf24;
        background: rgba(245, 158, 11, 0.09);
      }
      .hs-bp-warning .hs-bp-container-title { color: #fcd34d; }
      .hs-bp-danger {
        border-left-color: #f87171;
        background: rgba(239, 68, 68, 0.09);
      }
      .hs-bp-danger .hs-bp-container-title { color: #fca5a5; }
      .hs-bp-empty {
        padding: 32px 0;
        font-size: 13px;
        color: #8c909e;
      }

      /* ── 空正文引导（草稿 scaffold 只有标题与来源，正文待写） ── */
      .hs-body-empty {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
        margin: 18px 0 0;
        padding: 20px 22px;
        border-radius: 10px;
        border: 1px dashed rgba(245, 158, 11, 0.32);
        background: linear-gradient(180deg, rgba(245, 158, 11, 0.09), rgba(245, 158, 11, 0.03));
      }
      .hs-body-empty-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 15px;
        font-weight: 600;
        color: var(--dsw-alias-label-primary, #f4f4f7);
      }
      .hs-body-empty-desc {
        max-width: 52ch;
        font-size: 12.5px;
        line-height: 1.7;
        color: var(--dsw-alias-label-secondary, #9da1b0);
      }
      .hs-body-empty-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .hs-body-empty-hint {
        font-size: 11.5px;
        color: var(--dsw-alias-label-tertiary, #7c8192);
      }
      /* ── 生成正文进行中：顶部条带提示 ── */
      .hs-body-writing {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-shrink: 0;
        padding: 9px 18px;
        font-size: 12px;
        color: #fcd34d;
        background: rgba(245, 158, 11, 0.12);
        border-bottom: 1px solid rgba(245, 158, 11, 0.24);
      }
      .hs-body-writing-spinner {
        width: 12px;
        height: 12px;
        flex-shrink: 0;
        border-radius: 50%;
        border: 2px solid rgba(252, 211, 77, 0.28);
        border-top-color: #fcd34d;
        animation: hs-spin 800ms linear infinite;
      }
      .hs-body-writing-sub {
        opacity: 0.72;
      }

      /* ── 润色面板：填要求 → 润色，可反复改要求再润 ── */
      .hs-polish {
        display: flex;
        flex-direction: column;
        gap: 10px;
        flex-shrink: 0;
        margin: 12px 18px 0;
        padding: 14px 16px;
        border-radius: 10px;
        border: 1px solid rgba(245, 158, 11, 0.26);
        background: rgba(245, 158, 11, 0.07);
      }
      .hs-polish-head {
        display: flex;
        align-items: baseline;
        gap: 10px;
        flex-wrap: wrap;
      }
      .hs-polish-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--dsw-alias-label-primary, #f4f4f7);
      }
      .hs-polish-sub {
        font-size: 11.5px;
        color: var(--dsw-alias-label-tertiary, #7c8192);
      }
      .hs-polish-input {
        width: 100%;
        box-sizing: border-box;
        resize: vertical;
        min-height: 64px;
        padding: 9px 11px;
        border-radius: 8px;
        border: 1px solid var(--dsw-alias-border-secondary, rgba(255, 255, 255, 0.12));
        background: var(--dsw-alias-bg-secondary, rgba(255, 255, 255, 0.03));
        color: var(--dsw-alias-label-primary, #f4f4f7);
        font-family: inherit;
        font-size: 12.5px;
        line-height: 1.6;
      }
      .hs-polish-input:focus {
        outline: none;
        border-color: rgba(245, 158, 11, 0.55);
      }
      .hs-polish-input:disabled {
        opacity: 0.6;
      }
      .hs-polish-presets {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .hs-polish-presets-label {
        font-size: 11.5px;
        color: var(--dsw-alias-label-tertiary, #7c8192);
      }
      .hs-polish-chip {
        padding: 3px 9px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: transparent;
        color: var(--dsw-alias-label-secondary, #9da1b0);
        font-family: inherit;
        font-size: 11.5px;
        cursor: pointer;
        transition: color 120ms ease, border-color 120ms ease, background 120ms ease;
      }
      .hs-polish-chip:hover:not(:disabled) {
        color: #fcd34d;
        border-color: rgba(245, 158, 11, 0.45);
        background: rgba(245, 158, 11, 0.1);
      }
      .hs-polish-chip:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .hs-polish-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .hs-polish-hint {
        flex: 1;
        min-width: 180px;
        font-size: 11.5px;
        line-height: 1.5;
        color: var(--dsw-alias-label-tertiary, #7c8192);
      }
      .hs-polish-empty {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        font-size: 12.5px;
        color: var(--dsw-alias-label-secondary, #9da1b0);
      }

      /* ── 动画关键帧（遵守 Emil 规范：入场 scale 从 0.96 开始，退出迅捷） ── */
      @keyframes hs-fade-mask {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes hs-scale-up {
        from { opacity: 0; transform: scale(0.96) translateY(4px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }
      @keyframes hs-toast-enter {
        from { opacity: 0; transform: translateY(12px) scale(0.96); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes hs-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      .hs-spinning {
        animation: hs-spin 800ms linear infinite;
      }
    `;

    function ensureStyles() {
      if (typeof document === 'undefined') return;
      let el = document.getElementById('dsh-hotspot-plugin-styles');
      if (!el) {
        el = document.createElement('style');
        el.id = 'dsh-hotspot-plugin-styles';
        el.textContent = STYLES;
        document.head.appendChild(el);
      } else {
        el.textContent = STYLES;
      }
    }

    // ── 侧边栏图标组件 ─────────────────────────────────────────────
    function HotspotSidebarIcon(props) {
      const size = typeof props?.size === 'number' && props.size > 0 ? props.size : 16;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        style: { display: 'block' }
      }, [
        h('path', {
          key: 'flame',
          d: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z'
        })
      ]);
    }

    // ── Markdown 渲染辅助工具 ───────────────────────────────────────
    /**
     * 行内 markdown：图片 / 链接 / 行内代码 / 粗体 / 删除线 / 斜体。
     *
     * 用一个正则从左到右扫，而不是「找最早匹配」几次 —— 后者遇到
     * `**粗体里有 `代码`**` 这种嵌套就只剩一种生效。
     */
    function parseInlineMarkdown(text) {
      const source = String(text ?? '');
      if (!source) return '';
      const parts = [];
      const pattern = /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|~~([^~]+)~~|\*([^*]+)\*/g;
      let last = 0;
      let key = 0;
      let matched;
      while ((matched = pattern.exec(source))) {
        if (matched.index > last) parts.push(source.slice(last, matched.index));
        if (matched[1] !== undefined) {
          parts.push(h('img', { key: `img-${key++}`, src: matched[2], alt: matched[1], loading: 'lazy' }));
        } else if (matched[3] !== undefined) {
          parts.push(h('a', {
            key: `a-${key++}`,
            href: matched[4],
            target: '_blank',
            rel: 'noopener noreferrer'
          }, matched[3]));
        } else if (matched[5] !== undefined) {
          parts.push(h('code', { key: `c-${key++}` }, matched[5]));
        } else if (matched[6] !== undefined) {
          parts.push(h('strong', { key: `b-${key++}` }, matched[6]));
        } else if (matched[7] !== undefined) {
          parts.push(h('del', { key: `s-${key++}` }, matched[7]));
        } else {
          parts.push(h('em', { key: `i-${key++}` }, matched[8]));
        }
        last = matched.index + matched[0].length;
      }
      if (last < source.length) parts.push(source.slice(last));
      return parts;
    }

    /** `| a | b |` → ['a', 'b']；表格与分隔行共用。 */
    function splitTableRow(line) {
      return String(line).trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
    }

    const BLOCK_START = /^\s*(?:```|:::|>|#{1,6}\s|[-*+]\s|\d+[.)]\s|\|)/;
    const CONTAINER_LABEL = { tip: '提示', info: '说明', warning: '注意', danger: '警告', details: '展开' };

    /**
     * 极简 markdown → React 元素树。两处共用：
     * - 编辑器里的实时预览（边打字边看，必须同步、不能往返服务端）
     * - 草稿的「博客正文查看」（套博客主题的排版，看发布后大概长什么样）
     *
     * 刻意不做的：完整 CommonMark、脚注、引用式链接、内嵌 HTML。面板只负责
     * 「看起来对不对」，真正的渲染永远以 VitePress 构建结果为准。
     *
     * @param {string} content
     * @param {{ frontmatter?: boolean }} [options] frontmatter 为 false 时不渲染元数据框
     */
    function renderMarkdownAst(content, options = {}) {
      const showFrontmatter = options.frontmatter !== false;
      const lines = String(content ?? '').split(/\r?\n/);
      const elements = [];
      let key = 0;
      let i = 0;

      // frontmatter：无论渲不渲染元数据框，都不能让它变成正文
      if (lines[0] && lines[0].trim() === '---') {
        const block = [];
        let j = 1;
        for (; j < lines.length; j += 1) {
          if (lines[j].trim() === '---') break;
          block.push(lines[j]);
        }
        if (j < lines.length) {
          if (showFrontmatter) {
            elements.push(h('div', { className: 'hs-preview-frontmatter', key: `fm-${key++}` }, [
              h('div', { style: { fontWeight: 600, marginBottom: 4, color: 'var(--dsw-alias-brand-primary, #4db6a0)' } }, '📋 Frontmatter 元数据'),
              ...block.map((line, idx) => h('div', { key: idx }, line))
            ]));
          }
          i = j + 1;
        }
      }

      while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed) {
          i += 1;
          continue;
        }

        // 代码块：带上语言标签，和博客里的高亮块外形一致
        const fence = line.match(/^\s*```\s*([\w+#-]*)\s*$/);
        if (fence) {
          const lang = fence[1] || '';
          const code = [];
          i += 1;
          while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
            code.push(lines[i]);
            i += 1;
          }
          i += 1;
          elements.push(h('div', { className: 'hs-bp-code', key: `pre-${key++}` }, [
            lang && h('span', { className: 'hs-bp-code-lang' }, lang),
            h('pre', null, h('code', null, code.join('\n')))
          ]));
          continue;
        }

        // VitePress 容器 ::: tip / warning / danger …
        const container = trimmed.match(/^:::\s*(tip|info|warning|danger|details)\s*(.*)$/);
        if (container) {
          const kind = container[1];
          const title = container[2].trim() || CONTAINER_LABEL[kind];
          const body = [];
          i += 1;
          while (i < lines.length && !/^:::\s*$/.test(lines[i].trim())) {
            body.push(lines[i]);
            i += 1;
          }
          i += 1;
          elements.push(h('div', { className: `hs-bp-container hs-bp-${kind}`, key: `box-${key++}` }, [
            h('div', { className: 'hs-bp-container-title' }, title),
            ...renderMarkdownAst(body.join('\n'), { frontmatter: false })
          ]));
          continue;
        }

        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
          const level = heading[1].length;
          elements.push(h(`h${level}`, { key: `h-${key++}` }, parseInlineMarkdown(heading[2])));
          i += 1;
          continue;
        }

        if (/^(?:---+|\*\*\*+|___+)$/.test(trimmed)) {
          elements.push(h('hr', { key: `hr-${key++}` }));
          i += 1;
          continue;
        }

        // 表格：表头 + 分隔行（|---|---|）才认，否则当成普通段落
        if (/^\|/.test(trimmed) && /^\|?[\s:-]*-{2,}[\s:|-]*$/.test((lines[i + 1] || '').trim())) {
          const header = splitTableRow(trimmed);
          i += 2;
          const rows = [];
          while (i < lines.length && /^\|/.test(lines[i].trim())) {
            rows.push(splitTableRow(lines[i].trim()));
            i += 1;
          }
          elements.push(h('div', { className: 'hs-bp-table-wrap', key: `tbl-${key++}` }, h('table', null, [
            h('thead', null, h('tr', null, header.map((cell, idx) => h('th', { key: idx }, parseInlineMarkdown(cell))))),
            h('tbody', null, rows.map((row, rIdx) => h('tr', { key: rIdx },
              row.map((cell, cIdx) => h('td', { key: cIdx }, parseInlineMarkdown(cell))))))
          ])));
          continue;
        }

        // 引用块：连续的 > 行合成一块，块内继续按 markdown 渲染
        if (/^>/.test(trimmed)) {
          const quote = [];
          while (i < lines.length && /^>/.test(lines[i].trim())) {
            quote.push(lines[i].trim().replace(/^>\s?/, ''));
            i += 1;
          }
          elements.push(h('blockquote', { key: `q-${key++}` }, renderMarkdownAst(quote.join('\n'), { frontmatter: false })));
          continue;
        }

        // 列表：支持任务清单与一层嵌套（缩进 ≥2 空格算子项）
        const listMatch = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (listMatch) {
          const ordered = /\d/.test(listMatch[2]);
          const items = [];
          while (i < lines.length) {
            const item = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
            if (!item) break;
            const text = item[3];
            if (item[1].length >= 2 && items.length > 0) {
              items[items.length - 1].children.push(text);
            } else {
              const task = text.match(/^\[([ xX])\]\s+(.*)$/);
              items.push({ text: task ? task[2] : text, done: task ? task[1].toLowerCase() === 'x' : null, children: [] });
            }
            i += 1;
          }
          elements.push(h(ordered ? 'ol' : 'ul', { key: `list-${key++}` }, items.map((item, idx) => h('li', {
            key: idx,
            className: item.done === null ? undefined : 'hs-bp-task'
          }, [
            item.done !== null && h('span', { className: `hs-bp-check${item.done ? ' on' : ''}` }, item.done ? '✓' : ''),
            ...parseInlineMarkdown(item.text),
            item.children.length > 0 && h('ul', null, item.children.map((child, cIdx) => h('li', { key: cIdx }, parseInlineMarkdown(child))))
          ]))));
          continue;
        }

        // 段落：连续的普通行合成一段（markdown 里换行不等于换段）
        const para = [];
        while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i])
          && !/^(?:---+|\*\*\*+|___+)$/.test(lines[i].trim())) {
          para.push(lines[i].trim());
          i += 1;
        }
        if (para.length === 0) {
          para.push(trimmed);
          i += 1;
        }
        elements.push(h('p', { key: `p-${key++}` }, parseInlineMarkdown(para.join(' '))));
      }

      return elements;
    }

    // ── 主面板视图组件 ───────────────────────────────────────────
    /**
     * 草稿正文是否还没写。
     *
     * scaffold 只给了 frontmatter + 标题 + 来源引用 +「（正文待写）」，预览里看起来就是空的。
     * 判断规则只看「有没有成段的正文」，不依赖某个固定占位文案：
     * 去掉 frontmatter、标题、引用块、源列表与空行后还有内容，才算正文已经写了。
     */
    function isDraftBodyEmpty(content) {
      const text = String(content ?? '');
      if (!text.trim()) return true;
      if (text.includes('（正文待写）')) return true;
      const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/, '');
      const meaningful = body
        .split(/\r?\n/)
        .filter((line) => !/^\s*(?:#|>|$)/.test(line))
        .join('')
        .replace(/\s/g, '');
      return meaningful.length === 0;
    }

    /** 润色要求的一键预设：点一下追加到输入框，用户还能接着改。 */
    const POLISH_PRESETS = [
      { label: '去 AI 味', text: '去掉「赋能、抓手、闭环、底层逻辑」这类词和空泛排比，像懂行的人在讲' },
      { label: '更口语', text: '更口语一点，句子短一些，允许用「其实」「换句话说」这类过渡' },
      { label: '精简七成', text: '压缩到原文的七成：删掉重复解释和铺垫，但事实、数字、链接一个都不能少' },
      { label: '每节加例子', text: '每个小标题下补一个具体的例子或对比，例子只能用原文已有的信息，不许编' },
      { label: '先结论后解释', text: '段落顺序不动，但每段开头先给结论，再解释为什么' },
      { label: '只修语病', text: '只修语病和别扭的句子，不改语气，不动句子顺序' },
    ];

    function HotspotMainPanel(props) {
      ensureStyles();

      const [tab, setTab] = useState('candidates');
      const [loading, setLoading] = useState(false);
      const [running, setRunning] = useState(false);
      const [state, setState] = useState(null);
      const [filter, setFilter] = useState('');
      const [filterTag, setFilterTag] = useState('all');
      const [toast, setToast] = useState(null);
      // 今日订阅文章默认只展开一小段，避免候选页被上百条原文撑长。
      const [feedExpanded, setFeedExpanded] = useState(false);
      // 各阶段抓取数字默认收起：候选页先给「写什么」，细节按需展开。
      const [digestDetailOpen, setDigestDetailOpen] = useState(false);

      // 文章列表搜索与过滤状态
      const [articleSearch, setArticleSearch] = useState('');
      const [articleTagFilter, setArticleTagFilter] = useState('all');

      // 新增源表单
      const [newId, setNewId] = useState('');
      const [newKind, setNewKind] = useState('rss');
      const [newTarget, setNewTarget] = useState('');
      const [newPoints, setNewPoints] = useState(100);

      // 博客工程与系统参数配置表单状态
      const [blogProjectRoot, setBlogProjectRoot] = useState('');
      const [blogArticleDir, setBlogArticleDir] = useState('docs');
      const [blogDraftDir, setBlogDraftDir] = useState('.drafts');
      const [blogDigestDir, setBlogDigestDir] = useState('.hotspot');
      const [rankLimit, setRankLimit] = useState(15);
      const [rankSinceHours, setRankSinceHours] = useState(36);
      const [rankHalfLifeHours, setRankHalfLifeHours] = useState(24);
      const [rankClusterThreshold, setRankClusterThreshold] = useState(0.6);
      const [publishMaxPerDay, setPublishMaxPerDay] = useState(3);
      const [publishAllowedHosts, setPublishAllowedHosts] = useState('');
      const [deployScript, setDeployScript] = useState('');
      const [deployBuild, setDeployBuild] = useState('');
      const [deploying, setDeploying] = useState(false);
      const [deployResult, setDeployResult] = useState(null);
      // 部署实时日志：快照来自 GET /api/deploy/status，弹窗可关、部署照跑
      const [deployLive, setDeployLive] = useState(null);
      const [deployLiveOpen, setDeployLiveOpen] = useState(false);
      const deployPollRef = useRef(null);
      const deployAttachedRef = useRef(false);
      const deployLogRef = useRef(null);
      // 日志是否自动跟随底部：用户往上滚过就暂停，footer 里给「跳到最新」
      const [deployStick, setDeployStick] = useState(true);
      const [savingConfig, setSavingConfig] = useState(false);
      // 「高级排序参数」默认收起：半衰期与聚类阈值平时不该占视线
      const [showAdvancedRank, setShowAdvancedRank] = useState(false);

      // 博客根目录快速绑定与生成草稿必填弹窗状态
      const [quickBlogRoot, setQuickBlogRoot] = useState('');
      const [savingQuickBlog, setSavingQuickBlog] = useState(false);
      const [scaffoldModalItem, setScaffoldModalItem] = useState(null);
      const [scaffoldProjectRoot, setScaffoldProjectRoot] = useState('');
      const [scaffoldTitle, setScaffoldTitle] = useState('');
      const [scaffoldSlug, setScaffoldSlug] = useState('');
      const [scaffolding, setScaffolding] = useState(false);
      const [pickingDir, setPickingDir] = useState(false);
      // AI 起标题：弹窗一打开就请求，给 3 个候选；拿不到就安静回退原文标题
      const [titleSuggestions, setTitleSuggestions] = useState([]);
      const [titleSuggestState, setTitleSuggestState] = useState('idle'); // idle | loading | done | failed
      // 简介：按定稿标题写，可编辑；拿不到就留着候选摘要
      const [scaffoldDescription, setScaffoldDescription] = useState('');
      const [descriptionState, setDescriptionState] = useState('idle'); // idle | loading | done | failed
      // 连点几个标题时，只认最后一次请求的结果
      const descriptionToken = useRef(0);
      // 进度弹窗：按 slug 看一条后台写作任务的六步链路
      const [progressSlug, setProgressSlug] = useState(null);
      // 博客正文查看：按草稿读出正文，套博客排版看发布后大概长什么样
      const [blogPreview, setBlogPreview] = useState(null);

      // ── 文章与草稿编辑器状态 ──
      const [editModalItem, setEditModalItem] = useState(null); // { slug, title, file, isDraft }
      const [editContent, setEditContent] = useState('');
      const [editOriginalContent, setEditOriginalContent] = useState('');
      const [editViewMode, setEditViewMode] = useState('split'); // 'split' | 'edit' | 'preview'
      const [editSupplements, setEditSupplements] = useState(null); // 证据账本（sources.json）
      const [showEvidence, setShowEvidence] = useState(false);
      const [isSavingArticle, setIsSavingArticle] = useState(false);
      const [isPromotingArticle, setIsPromotingArticle] = useState(false);
      const [isDeletingArticle, setIsDeletingArticle] = useState(false);
      const [isWritingBody, setIsWritingBody] = useState(false);
      const [isPolishingBody, setIsPolishingBody] = useState(false);
      const [showPolishPanel, setShowPolishPanel] = useState(false);
      const [polishInstruction, setPolishInstruction] = useState('');

      const handlePickDirectory = async () => {
        if (pickingDir) return null;
        setPickingDir(true);
        try {
          // 1. 优先尝试 DSH 宿主客户端提供的原生目录选择器
          if (typeof props.pickDirectory === 'function') {
            try {
              const res = await props.pickDirectory();
              if (res) return res;
            } catch (err) {
              console.warn('[dsh-hotspot] props.pickDirectory error:', err);
            }
          }
          // 2. 降级尝试服务端原生目录选择器 API
          const res = await fetch(`${API_BASE}/pick-dir`, { method: 'POST' });
          const json = await res.json();
          if (json.ok && json.path) {
            return json.path;
          }
          // 区分「你点了取消」与「这台机器压根没有选择器」——后者以前静默成没反应
          if (json.ok && json.message && json.code !== 'CANCELLED') {
            showToast(json.message, true);
          }
          return null;
        } catch (e) {
          console.warn('[dsh-hotspot] handlePickDirectory error:', e);
          return null;
        } finally {
          setPickingDir(false);
        }
      };

      const isBlogConfigured = Boolean(state?.blog?.configured && state?.blog?.projectRoot);

      // ── 模型与写作方式：默认一个，写正文 / 润色可各自覆盖 ──
      const [modelCatalog, setModelCatalog] = useState(null);
      const [modelForm, setModelForm] = useState(null);
      const [savingModels, setSavingModels] = useState(false);

      const loadModels = useCallback(async () => {
        try {
          const res = await fetch(`${API_BASE}/models`);
          const data = await res.json();
          if (data.ok && data.value) {
            setModelCatalog(data.value);
            setModelForm(data.value.selection || null);
          }
        } catch (err) {
          // 模型目录只是附加信息：拿不到不该让整个面板报错
          console.warn('[dsh-hotspot] 读取模型目录失败:', err);
        }
      }, []);

      useEffect(() => {
        loadModels();
      }, [loadModels]);

      // ── 错误日志：默认只留当天，面板可刷新与清空 ──
      const [errorLog, setErrorLog] = useState(null);
      const [loadingErrors, setLoadingErrors] = useState(false);

      const loadErrors = useCallback(async () => {
        try {
          setLoadingErrors(true);
          const res = await fetch(`${API_BASE}/errors`);
          const data = await res.json();
          if (data.ok) setErrorLog(data.value);
        } catch (err) {
          console.warn('[dsh-hotspot] 读取错误日志失败:', err);
        } finally {
          setLoadingErrors(false);
        }
      }, []);

      useEffect(() => {
        loadErrors();
      }, [loadErrors]);

      const handleClearErrors = async () => {
        try {
          const res = await fetch(`${API_BASE}/errors`, { method: 'DELETE' });
          const data = await res.json();
          if (data.ok) {
            showToast(data.message || '错误日志已清空');
            await loadErrors();
          } else {
            showToast(data.message || '清空失败', true);
          }
        } catch (err) {
          showToast(err.message || String(err), true);
        }
      };

      const handleSaveModels = async () => {
        if (!modelForm) return;
        try {
          setSavingModels(true);
          const res = await fetch(`${API_BASE}/models`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              mode: modelForm.mode,
              global: modelForm.global,
              writer: modelForm.writer,
              polish: modelForm.polish
            })
          });
          const data = await res.json();
          if (data.ok) {
            setModelCatalog(prev => ({ ...(prev || {}), ...data.value }));
            setModelForm(data.value.selection);
            showToast('模型选择已保存，下一次写正文 / 润色生效');
          } else {
            showToast(data.error || data.message || '保存模型失败', true);
          }
        } catch (err) {
          showToast(err.message || String(err), true);
        } finally {
          setSavingModels(false);
        }
      };

      const syncConfigForm = (val) => {
        if (!val) return;
        const cfg = val.config || {};
        const b = val.blog || {};
        setBlogProjectRoot(cfg.projectRoot || b.projectRoot || '');
        setBlogArticleDir(cfg.articleDir || b.articleDir || 'docs');
        setBlogDraftDir(cfg.draftDir || b.draftDir || '.drafts');
        setBlogDigestDir(cfg.digestDir || b.digestDir || '.hotspot');
        if (cfg.rank) {
          if (cfg.rank.limit !== undefined) setRankLimit(cfg.rank.limit);
          if (cfg.rank.sinceHours !== undefined) setRankSinceHours(cfg.rank.sinceHours);
          if (cfg.rank.halfLifeHours !== undefined) setRankHalfLifeHours(cfg.rank.halfLifeHours);
          if (cfg.rank.clusterThreshold !== undefined) setRankClusterThreshold(cfg.rank.clusterThreshold);
        }
        if (cfg.publish) {
          if (cfg.publish.maxPerDay !== undefined) setPublishMaxPerDay(cfg.publish.maxPerDay);
          if (Array.isArray(cfg.publish.allowedHosts)) {
            setPublishAllowedHosts(cfg.publish.allowedHosts.join('\n'));
          }
        }
        setDeployScript(cfg.deploy?.script || '');
        setDeployBuild(cfg.deploy?.build || '');
      };

      const loadState = useCallback(async () => {
        try {
          setLoading(true);
          const res = await fetch(`${API_BASE}/state`);
          const data = await res.json();
          if (data.ok) {
            setState(data.value);
            syncConfigForm(data.value);
          } else {
            showToast(data.message || '加载状态失败', true);
          }
        } catch (err) {
          showToast(err.message || '网络连接异常', true);
        } finally {
          setLoading(false);
        }
      }, []);

      useEffect(() => {
        loadState();
      }, [loadState]);

      const showToast = (message, isError = false) => {
        setToast({ message, isError });
        setTimeout(() => setToast(null), 3500);
      };

      /** 复制路径到剪贴板；没有剪贴板权限时至少把路径显示出来，别让按钮点了没反应。 */
      const copyPath = (filePath) => {
        if (!filePath) return;
        try {
          if (navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(filePath);
            showToast(`已复制: ${filePath}`);
            return;
          }
        } catch {
          // 落到下面的兜底提示
        }
        showToast(filePath);
      };

      const openArticleEditor = async (item) => {
        try {
          const filePath = item.file || item.path || (item.isDraft ? `docs/draft/${item.slug}/index.md` : `docs/article/${item.slug}/index.md`);
          const res = await fetch(`${API_BASE}/article?file=${encodeURIComponent(filePath)}`);
          const data = await res.json();
          if (data.ok && data.value) {
            setEditContent(data.value.content || '');
            setEditOriginalContent(data.value.content || '');
            setEditModalItem({
              ...item,
              file: data.value.file || filePath
            });
            setEditSupplements(data.value.supplements || null);
            setShowEvidence(false);
            setEditViewMode('split');
            // 换一篇草稿时不带着上一篇的润色要求
            setShowPolishPanel(false);
            setPolishInstruction('');
          } else {
            showToast(data.error || '读取文章内容失败', true);
          }
        } catch (err) {
          showToast(`打开失败: ${err.message}`, true);
        }
      };

      /**
       * 打开「博客正文查看」：读草稿正文，用博客的排版渲染一遍。
       *
       * 为什么要它：草稿默认落在站点目录之外（`.drafts/`），VitePress 根本看不到，
       * 于是「正文长啥样」只能等发布之后才知道。这里不启 dev server，只把
       * markdown 按博客的排版渲染 —— 近似，但足以在建草稿到转正之间发现结构问题。
       */
      const openBlogPreview = async (item) => {
        setBlogPreview({ item, content: '', loading: true, error: '' });
        try {
          const filePath = item.file || item.path || '';
          if (!filePath) throw new Error('这条草稿没有文件路径');
          const res = await fetch(`${API_BASE}/article?file=${encodeURIComponent(filePath)}`);
          const data = await res.json();
          if (!data.ok || !data.value) throw new Error(data.error || data.message || '读取正文失败');
          setBlogPreview({ item, content: data.value.content || '', loading: false, error: '' });
        } catch (err) {
          setBlogPreview({ item, content: '', loading: false, error: err.message || String(err) });
        }
      };

      /**
       * 用一次 completion 替当前草稿补全正文。
       *
       * scaffold 出来的草稿只有 frontmatter + 标题 + 来源引用，正文是「（正文待写）」。
       * 这里直接复用面板已有的 POST /api/generate（写盘 + 校验都在服务端做），
       * 成功后再把磁盘上的最新内容读回编辑器，避免用户看到的是写之前的旧正文。
       */
      const handleWriteBody = async () => {
        if (!editModalItem || isWritingBody) return;
        const item = editModalItem;
        const label = item.title || item.slug;
        const dirty = editContent !== editOriginalContent;
        const empty = isDraftBodyEmpty(editContent);
        const lines = [
          `为「${label}」${empty ? '生成正文' : '重写正文'}？`,
          '会联网搜索并登记证据，通常 1–3 分钟，最长 8 分钟，请保持面板打开。',
        ];
        if (dirty) lines.push('当前有未保存的修改：生成会以磁盘内容为底稿，这些修改会丢失。');
        if (!window.confirm(lines.join('\n\n'))) return;

        setIsWritingBody(true);
        try {
          const res = await fetch(`${API_BASE}/generate`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slug: item.slug })
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || data.message || '生成失败');

          // 读回写盘结果：正文、证据账本、frontmatter 时间戳都可能变了
          const reread = await fetch(`${API_BASE}/article?file=${encodeURIComponent(item.file)}`);
          const article = await reread.json();
          if (article.ok && article.value) {
            setEditContent(article.value.content || '');
            setEditOriginalContent(article.value.content || '');
            setEditSupplements(article.value.supplements || null);
          }

          const value = data.value || {};
          const checks = value.checks;
          const violations = checks && Array.isArray(checks.violations) ? checks.violations : null;
          if (checks && checks.ok === false) {
            showToast(`正文已生成 ${value.bodyChars || 0} 字，但校验有 ${violations ? violations.length : '若干'} 条违规，请逐条检查`, true);
          } else {
            const reg = value.registered
              ? `，登记证据 ${value.registered} 条`
              : (value.registerFailed ? '，证据登记失败（正文已写盘）' : '');
            showToast(`✅ 正文已完成：${value.bodyChars || 0} 字${reg}`);
          }
          await loadState();
        } catch (err) {
          showToast(`完成正文失败：${err.message || err}`, true);
        } finally {
          setIsWritingBody(false);
        }
      };

      /**
       * 按用户填的要求把正文再润色一遍。
       *
       * 与「写正文」不同，润色不联网、不碰证据：走 POST /api/polish 的一次 completion，
       * 服务端只改表达并把数字/链接的前后差异报回来（差异不拦截，但要在 toast 里说清楚）。
       * 结果写盘后立刻读回编辑器，用户可以直接接着改要求再润色一次。
       */
      const handlePolishBody = async () => {
        if (!editModalItem || !editModalItem.file || isPolishingBody) return;
        const item = editModalItem;
        const instruction = polishInstruction.trim();
        // 润色以磁盘内容为底稿：未保存的修改不会进入润色，必须让用户先知道
        if (editContent !== editOriginalContent) {
          const ok = window.confirm(
            '当前有未保存的修改。\n\n润色会以磁盘上的内容为底稿，这些修改不会进入润色结果（也会被覆盖）。\n建议先保存，或者接受现在这份内容被替换。'
          );
          if (!ok) return;
        }

        setIsPolishingBody(true);
        try {
          const res = await fetch(`${API_BASE}/polish`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slug: item.slug, instruction })
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || data.message || '润色失败');

          const reread = await fetch(`${API_BASE}/article?file=${encodeURIComponent(item.file)}`);
          const article = await reread.json();
          if (article.ok && article.value) {
            setEditContent(article.value.content || '');
            setEditOriginalContent(article.value.content || '');
            setEditSupplements(article.value.supplements || null);
          }

          const value = data.value || {};
          const size = value.beforeChars != null
            ? `${value.beforeChars} → ${value.bodyChars || 0} 字`
            : `${value.bodyChars || 0} 字`;
          const warn = value.factWarning ? `；${value.factWarning}` : '';
          const checks = value.checks;
          const violations = checks && Array.isArray(checks.violations) ? checks.violations : [];
          if (checks && checks.ok === false) {
            showToast(`已润色（${size}）${warn}；校验还有 ${violations.length} 条违规`, true);
          } else if (value.factWarning) {
            showToast(`已润色（${size}）${warn}，请确认这些差异是否可接受`, true);
          } else {
            showToast(`✅ 已润色：${size}`);
          }
          await loadState();
        } catch (err) {
          showToast(`润色失败：${err.message || err}`, true);
        } finally {
          setIsPolishingBody(false);
        }
      };

      const handleSaveArticle = async () => {
        if (!editModalItem || !editModalItem.file) return;
        try {
          setIsSavingArticle(true);
          const res = await fetch(`${API_BASE}/article`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              file: editModalItem.file,
              content: editContent
            })
          });
          const data = await res.json();
          if (data.ok) {
            setEditOriginalContent(editContent);
            showToast('✅ 文章内容已成功保存！');
            await loadState();
          } else {
            showToast(data.error || '保存失败', true);
          }
        } catch (err) {
          showToast(`保存出错: ${err.message}`, true);
        } finally {
          setIsSavingArticle(false);
        }
      };

      const handlePromoteArticle = async (slug) => {
        if (!slug) return;
        try {
          setIsPromotingArticle(true);
          const res = await fetch(`${API_BASE}/article-promote`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slug })
          });
          const data = await res.json();
          if (data.ok) {
            showToast(`🚀 草稿 ${slug} 已转正发布！`);
            setEditModalItem(null);
            await loadState();
          } else {
            showToast(data.error || '转正失败', true);
          }
        } catch (err) {
          showToast(`转正失败: ${err.message}`, true);
        } finally {
          setIsPromotingArticle(false);
        }
      };

      const handleDeleteArticle = async (item) => {
        if (!item || !item.file) return;
        const isDraft = item.draft === true || item.isDraft === true;
        const typeLabel = isDraft ? '草稿' : '文章';
        const titleLabel = item.title || item.slug || item.file;
        if (!confirm(`确定要彻底删除该${typeLabel}吗？\n\n标题：${titleLabel}\n文件：${item.file}\n\n注意：此操作不可恢复！`)) {
          return;
        }
        try {
          setIsDeletingArticle(true);
          const res = await fetch(`${API_BASE}/article-delete`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ file: item.file }),
          });
          const data = await res.json();
          if (data.ok) {
            showToast(`🗑️ ${typeLabel}「${titleLabel}」已成功删除`);
            if (editModalItem && editModalItem.file === item.file) {
              setEditModalItem(null);
            }
            await loadState();
          } else {
            showToast(data.error || '删除失败', true);
          }
        } catch (err) {
          showToast(`删除异常: ${err.message}`, true);
        } finally {
          setIsDeletingArticle(false);
        }
      };

      const handleRun = async () => {
        try {
          setRunning(true);
          const res = await fetch(`${API_BASE}/run`, { method: 'POST' });
          const data = await res.json();
          if (data.ok) {
            showToast(`抓取完成：聚合生成 ${data.value.items.length} 个优质候选`);
            await loadState();
          } else {
            showToast(data.message || '抓取失败', true);
          }
        } catch (err) {
          showToast(err.message, true);
        } finally {
          setRunning(false);
        }
      };

      /**
       * 目录名建议：标题里的 ASCII 部分优先，纯中文标题退到 hotspot-MMDD-NN。
       * 与服务端 slugify 同一套规则，但这里多一层兜底 —— 面板不能因为推导不出
       * 目录名就让人卡住（那正是「生成草稿」以前直接报错的原因）。
       */
      const suggestSlug = (item) => {
        const ascii = String(item?.title || '').replace(/[^\x00-\x7F]+/g, ' ');
        const base = ascii.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-$/, '');
        if (base) return base;
        const matched = String(item?.id || '').match(/(\d{4})(\d{2})(\d{2})-(\d{2})$/);
        if (matched) return `hotspot-${matched[2]}${matched[3]}-${matched[4]}`;
        return `hotspot-${Date.now().toString(36).slice(-4)}`;
      };

      /**
       * 要 3 个标题建议。失败不弹错：标题是建议不是前置条件，
       * 弹窗照常用原文标题，只在下面给一行灰字提示。
       */
      const suggestTitles = async (item) => {
        if (!item?.id) {
          setTitleSuggestState('failed');
          setTitleSuggestions([]);
          return;
        }
        setTitleSuggestState('loading');
        setTitleSuggestions([]);
        try {
          const res = await fetch(`${API_BASE}/title-suggest`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: item.id })
          });
          const data = await res.json();
          const list = data?.ok && Array.isArray(data.value?.suggestions) ? data.value.suggestions : [];
          if (list.length === 0) throw new Error(data?.message || '没有拿到标题建议');
          setTitleSuggestions(list);
          setTitleSuggestState('done');
          // 第一个自动填入：否则「标题由模型生成」这句在默认值上就是假的
          setScaffoldTitle(list[0].title);
          if (list[0].slug) setScaffoldSlug(list[0].slug);
          // 标题定了就按它写简介：简介跟标题说的必须是同一件事
          suggestDescription(list[0].title);
        } catch (err) {
          setTitleSuggestions([]);
          setTitleSuggestState('failed');
        }
      };

      /**
       * 按定稿标题重写简介。
       *
       * 连点几个标题时会有多个请求在飞：用自增 token 只认最后一次的结果，
       * 否则会出现「第 2 个标题配第 3 段简介」这种错配。
       */
      const suggestDescription = async (title) => {
        const finalTitle = String(title ?? '').trim();
        if (!finalTitle || !scaffoldModalItem?.id) {
          setDescriptionState('failed');
          return;
        }
        descriptionToken.current += 1;
        const token = descriptionToken.current;
        setDescriptionState('loading');
        try {
          const res = await fetch(`${API_BASE}/description-suggest`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: scaffoldModalItem.id, title: finalTitle })
          });
          const data = await res.json();
          if (token !== descriptionToken.current) return;
          const description = data?.ok ? String(data.value?.description || '') : '';
          if (!description) throw new Error(data?.message || '没有拿到简介');
          setScaffoldDescription(description);
          setDescriptionState('done');
        } catch (err) {
          if (token !== descriptionToken.current) return;
          // 失败保留框里原有内容（初值是候选摘要），只标一行提示
          setDescriptionState('failed');
        }
      };

      /** 点一个候选标题：标题、slug、简介一起换，之后仍可手改。 */
      const pickTitleSuggestion = (suggestion) => {
        if (!suggestion?.title) return;
        setScaffoldTitle(suggestion.title);
        if (suggestion.slug) setScaffoldSlug(suggestion.slug);
        suggestDescription(suggestion.title);
      };

      /**
       * 生成草稿前先让人看一眼标题与目录名：目录名是永久 URL，改起来比选一次贵。
       * 标题不再默认复制原文 —— 弹窗一打开就去要 3 个模型起的标题。
       */
      const handleScaffold = (item) => {
        setScaffoldModalItem(item);
        setScaffoldTitle(String(item?.title || ''));
        setScaffoldSlug(item?.slugHint || suggestSlug(item));
        setScaffoldProjectRoot(isBlogConfigured ? '' : (blogProjectRoot || ''));
        // 初值是候选摘要：AI 写不出来时这里仍然有内容，建草稿不会被卡住
        setScaffoldDescription(String(item?.summary || ''));
        setDescriptionState('idle');
        suggestTitles(item);
      };

      // 后台写作任务的实时状态：slug -> job。生成草稿后在这里推进度。
      const [jobStates, setJobStates] = useState({});
      const [jobStarting, setJobStarting] = useState({});
      const watchedSlugs = useRef(new Set());

      /**
       * 盯一个后台写作任务：生成草稿是「搜 → 读 → 综合」，几分钟是常态，
       * 所以接口立刻返回 job，这里每 1.5 秒问一次（进度弹窗靠这份数据推进），
       * 结束后刷新草稿箱并给结论。弹窗关掉也照旧跑，结束时才有 toast。
       */
      const watchJob = async (slug) => {
        if (!slug || watchedSlugs.current.has(slug)) return;
        watchedSlugs.current.add(slug);
        try {
          // 1.5s × 800 ≈ 20 分钟：写正文的超时是 8 分钟，轮询不能先于它放弃
          for (let i = 0; i < 800; i += 1) {
            await new Promise(resolve => setTimeout(resolve, 1500));
            let job = null;
            try {
              const res = await fetch(`${API_BASE}/jobs?slug=${encodeURIComponent(slug)}`);
              const data = await res.json();
              job = Array.isArray(data.value) ? data.value[0] : null;
            } catch (err) {
              return;
            }
            if (!job) return;
            setJobStates(prev => ({ ...prev, [slug]: job }));
            if (job.state === 'running') continue;

            await loadState();
            const chars = job.result?.bodyChars ?? 0;
            const badChecks = job.result?.checks && job.result.checks.ok === false;
            if (job.state === 'done') {
              showToast(
                badChecks
                  ? `《${slug}》正文已写入 ${chars} 字，但校验还有问题，去草稿里看一眼`
                  : `✅《${slug}》正文已写入 ${chars} 字，校验通过`
              );
            } else {
              showToast(`《${slug}》写正文失败：${job.error || '未知原因'}（可在草稿箱重试）`, true);
            }
            return;
          }
        } finally {
          watchedSlugs.current.delete(slug);
        }
      };

      /** 失败后重试：走同一个后台路径，不占着编辑器转圈。 */
      const retryWrite = async (slug) => {
        if (!slug || jobStarting[slug]) return;
        try {
          setJobStarting(prev => ({ ...prev, [slug]: true }));
          const res = await fetch(`${API_BASE}/jobs`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slug })
          });
          const data = await res.json();
          if (!data.ok) {
            showToast(data.message || '重试失败', true);
            return;
          }
          setJobStates(prev => ({ ...prev, [slug]: data.job }));
          showToast('已重新开始写正文');
          await loadState();
          watchJob(slug);
        } catch (err) {
          showToast(err.message || String(err), true);
        } finally {
          setJobStarting(prev => ({ ...prev, [slug]: false }));
        }
      };

      /** 取消正在跑的写作任务：信号会一路传到模型请求，真停。 */
      const cancelWrite = async (slug) => {
        if (!slug) return;
        try {
          const res = await fetch(`${API_BASE}/jobs/cancel`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slug })
          });
          const data = await res.json();
          if (data.ok) {
            setJobStates(prev => ({ ...prev, [slug]: data.job }));
            showToast('已请求取消，正在中断模型请求…');
            await loadState();
          } else {
            showToast(data.message || '取消失败', true);
          }
        } catch (err) {
          showToast(err.message || String(err), true);
        }
      };

      // 面板重新打开时，把还在跑的任务接回来继续盯
      useEffect(() => {
        const running = (state?.jobs || []).filter(job => job && job.state === 'running');
        for (const job of running) {
          setJobStates(prev => ({ ...prev, [job.slug]: job }));
          watchJob(job.slug);
        }
      }, [state?.jobs]);

      // 进度弹窗开着时每秒刷新一次「现在」：不 tick，「已用 1m 42s」就是死的
      const [progressNow, setProgressNow] = useState(() => Date.now());
      useEffect(() => {
        if (!progressSlug) return undefined;
        setProgressNow(Date.now());
        const timer = setInterval(() => setProgressNow(Date.now()), 1000);
        return () => clearInterval(timer);
      }, [progressSlug]);

      const executeScaffold = async (item, opts = {}) => {
        try {
          setScaffolding(true);
          // generate:true = 建完草稿直接在后台写正文（核心信息 → 联网 → 综合）
          const payload = { id: item.id, generate: true };
          if (opts.projectRoot) payload.projectRoot = String(opts.projectRoot).trim();
          if (opts.slug) payload.slug = String(opts.slug).trim();
          if (opts.title) payload.title = String(opts.title).trim();
          if (opts.description) payload.description = String(opts.description).trim();

          const res = await fetch(`${API_BASE}/scaffold`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          if (data.ok) {
            setScaffoldModalItem(null);
            setTitleSuggestions([]);
            setTitleSuggestState('idle');
            setDescriptionState('idle');
            if (data.job) {
              setJobStates(prev => ({ ...prev, [data.job.slug]: data.job }));
              // 弹窗原位换成进度面板：用户刚点的那件事就是这条六步链路
              setProgressSlug(data.job.slug);
              watchJob(data.job.slug);
            } else {
              showToast(data.message || `草稿生成成功：${data.value?.file || data.value?.slug}`);
            }
            await loadState();
          } else if (data.code === 'ERR_SLUG_REQUIRED') {
            // 后端说目录名推导不出来：把弹窗重新打开并预填，别让人对着一条报错干瞪眼
            setScaffoldModalItem(item);
            setScaffoldTitle(String(data.value?.title || item.title || ''));
            setScaffoldSlug(String(data.value?.slugHint || '') || suggestSlug(item));
            setScaffoldProjectRoot(isBlogConfigured ? '' : (blogProjectRoot || ''));
            showToast('请给这篇草稿定一个目录名（slug）', true);
          } else {
            showToast(data.message || '生成草稿失败', true);
          }
        } catch (err) {
          showToast(err.message, true);
        } finally {
          setScaffolding(false);
        }
      };

      const handleSaveQuickBlog = async () => {
        const root = quickBlogRoot.trim();
        if (!root) {
          showToast('请提供有效的博客仓库绝对路径', true);
          return;
        }
        try {
          setSavingQuickBlog(true);
          const res = await fetch(`${API_BASE}/config`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ projectRoot: root })
          });
          const data = await res.json();
          if (data.ok) {
            showToast('博客仓库根目录已成功绑定！');
            setQuickBlogRoot('');
            await loadState();
          } else {
            showToast(data.message || '绑定失败', true);
          }
        } catch (err) {
          showToast(err.message, true);
        } finally {
          setSavingQuickBlog(false);
        }
      };

      const handleAddSource = async () => {
        if (!newId || !newTarget) {
          showToast('请完整填写 ID 与目标', true);
          return;
        }
        // 基数组用「有效源」：配置里没写源时内置源正在生效，用它当基底才不会把默认源挤掉。
        const currentSources = activeSourceList(state);
        const source = { id: newId.trim(), kind: newKind };
        if (newKind === 'github-release') {
          source.repo = newTarget.trim();
        } else if (newKind === 'hn') {
          source.minPoints = Number(newPoints) || 100;
        } else {
          source.url = newTarget.trim();
        }

        try {
          const res = await fetch(`${API_BASE}/sources`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sources: [...currentSources, source] })
          });
          const data = await res.json();
          if (data.ok) {
            showToast('源已成功添加');
            setNewId('');
            setNewTarget('');
            await loadState();
          } else {
            showToast(data.message || '添加源失败', true);
          }
        } catch (err) {
          showToast(err.message, true);
        }
      };

      const handleAddPresetSource = async (preset) => {
        const currentSources = activeSourceList(state);
        if (currentSources.some((s) => s.url === preset.url || s.id === preset.id)) {
          showToast('该订阅源已在列表中');
          return;
        }
        try {
          const res = await fetch(`${API_BASE}/sources`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sources: [...currentSources, preset] })
          });
          const data = await res.json();
          if (data.ok) {
            showToast('已成功添加内置订阅源');
            await loadState();
          } else {
            showToast(data.message || '添加订阅源失败', true);
          }
        } catch (err) {
          showToast(err.message, true);
        }
      };

      const handleEnableBuiltins = async () => {
        const currentSources = activeSourceList(state);
        const pending = (state?.builtinSources || []).filter(
          (preset) => !currentSources.some((s) => s.url === preset.url || s.id === preset.id)
        );
        if (pending.length === 0) {
          showToast('内置源已全部启用');
          return;
        }
        try {
          const res = await fetch(`${API_BASE}/sources`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sources: [...currentSources, ...pending] })
          });
          const data = await res.json();
          if (data.ok) {
            showToast(`已启用 ${pending.length} 个内置源`);
            await loadState();
          } else {
            showToast(data.message || '启用内置源失败', true);
          }
        } catch (err) {
          showToast(err.message, true);
        }
      };

      const handleDeleteSource = async (id) => {
        const currentSources = activeSourceList(state).filter(s => s.id !== id);
        try {
          const res = await fetch(`${API_BASE}/sources`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sources: currentSources })
          });
          const data = await res.json();
          if (data.ok) {
            showToast(`已移除源 ${id}`);
            await loadState();
          } else {
            showToast(data.message || '移除源失败', true);
          }
        } catch (err) {
          showToast(err.message, true);
        }
      };

      const handleSaveConfig = async () => {
        try {
          setSavingConfig(true);
          const allowedList = publishAllowedHosts
            .split(/[\n,]/)
            .map(s => s.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
            .filter(Boolean);

          const payload = {
            projectRoot: blogProjectRoot.trim(),
            articleDir: blogArticleDir.trim() || 'docs',
            draftDir: blogDraftDir.trim() || '.drafts',
            digestDir: blogDigestDir.trim() || '.hotspot',
            rank: {
              limit: Number(rankLimit) || 15,
              sinceHours: Number(rankSinceHours) || 36,
              halfLifeHours: Number(rankHalfLifeHours) || 24,
              clusterThreshold: Math.min(0.95, Math.max(0.3, Number(rankClusterThreshold) || 0.6))
            },
            publish: {
              maxPerDay: Number(publishMaxPerDay) || 3,
              allowedHosts: allowedList
            },
            deploy: {
              script: deployScript.trim(),
              build: deployBuild.trim()
            }
          };

          const res = await fetch(`${API_BASE}/config`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          if (data.ok) {
            showToast('博客仓库与参数配置已成功保存！');
            await loadState();
          } else {
            showToast(data.message || '保存配置失败', true);
          }
        } catch (err) {
          showToast(err.message || '网络连接异常', true);
        } finally {
          setSavingConfig(false);
        }
      };

      const stopDeployPolling = () => {
        if (deployPollRef.current) {
          clearInterval(deployPollRef.current);
          deployPollRef.current = null;
        }
      };

      /**
       * 拉一次部署快照。轮询与「重开面板接回」都走这里：
       * 部署在服务端跑，面板只是个显示器，读状态不能有任何副作用。
       */
      const fetchDeployStatus = async () => {
        try {
          const res = await fetch(`${API_BASE}/deploy/status`);
          const data = await res.json();
          const value = data?.ok ? data.value : null;
          setDeployLive(value);
          if (value && value.state !== 'running') {
            stopDeployPolling();
            if (deployAttachedRef.current) {
              // 接回来的那次部署跑完了：没有 POST 的返回值，恢复按钮即可，详情看「上次部署」
              deployAttachedRef.current = false;
              setDeploying(false);
            }
          }
          return value;
        } catch {
          return null;
        }
      };

      const startDeployPolling = () => {
        stopDeployPolling();
        fetchDeployStatus();
        deployPollRef.current = setInterval(fetchDeployStatus, 1000);
      };

      /**
       * 部署：POST 仍然同步跑完（契约不变），同时每秒拉一次实时快照喂给弹窗。
       * 返回后关掉日志弹窗、打开结果弹窗 —— 内容与以前完全一致。
       */
      const handleDeploy = async () => {
        if (deploying) {
          // 部署进行中再点：不重复发请求，只把日志弹窗叫回来
          setDeployLiveOpen(true);
          startDeployPolling();
          return;
        }
        setDeploying(true);
        deployAttachedRef.current = false;
        setDeployLive(null);
        setDeployLiveOpen(true);
        setDeployStick(true);
        startDeployPolling();
        try {
          const res = await fetch(`${API_BASE}/deploy`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}'
          });
          const data = await res.json();
          if (!data.ok) {
            showToast(data.error || data.message || '部署失败', true);
            return;
          }
          const value = data.value;
          setDeployResult(value);
          setDeployLiveOpen(false);
          const seconds = (Number(value.durationMs || 0) / 1000).toFixed(1);
          showToast(
            value.success ? `✅ 站点部署完成（${seconds}s）` : `❌ 部署失败：${data.message}（${seconds}s）`,
            !value.success
          );
        } catch (err) {
          showToast(err.message || '部署请求失败', true);
        } finally {
          stopDeployPolling();
          setDeploying(false);
          await fetchDeployStatus();
        }
      };

      // 重开面板 / 刷新页面：后台还有部署在跑就自动接回日志弹窗
      useEffect(() => {
        let alive = true;
        (async () => {
          const value = await fetchDeployStatus();
          if (!alive || !value || value.state !== 'running') return;
          deployAttachedRef.current = true;
          setDeploying(true);
          setDeployLiveOpen(true);
          startDeployPolling();
        })();
        return () => {
          alive = false;
          stopDeployPolling();
        };
      }, []);

      // 日志弹窗开着时每秒走一次表：耗时不 tick 就是死的
      const [deployNow, setDeployNow] = useState(() => Date.now());
      useEffect(() => {
        if (!deployLiveOpen) return undefined;
        setDeployNow(Date.now());
        const timer = setInterval(() => setDeployNow(Date.now()), 1000);
        return () => clearInterval(timer);
      }, [deployLiveOpen]);

      // 新日志到达时跟到底部（用户往上滚过就不拽他的视线）
      useEffect(() => {
        const box = deployLogRef.current;
        if (!box || !deployLiveOpen || !deployStick) return;
        box.scrollTop = box.scrollHeight;
      }, [deployLive, deployLiveOpen, deployStick]);

      // 候选筛选：digest 已按得分降序，「精选」取当天前 30%（至少 3 条），
      // 不再用 score ≥ 100 这种永远为空的阈值（单源当天候选也就 4–6 分）。
      const digest = state?.digest || null;
      const rawItems = digest?.items || [];
      const pickCount = rawItems.length === 0
        ? 0
        : Math.min(rawItems.length, Math.max(3, Math.round(rawItems.length * 0.3)));
      const pickedIds = new Set(rawItems.slice(0, pickCount).map((item) => item.id));
      const multiSourceCount = rawItems.filter((item) => (item.sourceCount ?? 1) > 1).length;

      const items = rawItems.filter(item => {
        if (filterTag === 'picked' && !pickedIds.has(item.id)) return false;
        if (filterTag === 'multi' && (item.sourceCount ?? 1) <= 1) return false;
        if (!filter) return true;
        const q = filter.toLowerCase();
        return (
          item.title?.toLowerCase().includes(q) ||
          item.tags?.some(t => t.toLowerCase().includes(q)) ||
          item.summary?.toLowerCase().includes(q)
        );
      });

      // 今日订阅文章：raw 里的当日条目，候选已经在上面列过，这里只补候选之外的。
      const feedDate = state?.feed?.date || '';
      const feedItems = (state?.feed?.items || []).filter((item) => {
        if (item.candidate) return false;
        if (!filter) return true;
        const q = filter.toLowerCase();
        return (
          item.title?.toLowerCase().includes(q) ||
          item.summary?.toLowerCase().includes(q) ||
          item.source?.toLowerCase().includes(q)
        );
      });

      // 今日状态：候选页只需要「几条、什么时候抓的、抓得顺不顺」，
      // 各阶段数字收进「抓取详情」，不占正文位置。
      const FEED_PREVIEW = 6;
      const digestDate = digest?.date || '';
      const digestStatus = digest?.status || null;
      const digestGenerated = digest?.generatedAt
        ? new Date(digest.generatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '';
      const digestTime = digest?.generatedAt
        ? new Date(digest.generatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        : '';
      const health = !digestStatus
        ? null
        : digestStatus.degraded
          ? { text: '严重降级', level: 'bad', color: '#f87171' }
          : digestStatus.feedsOk === digestStatus.feedsTotal
            ? { text: '抓取正常', level: 'ok', color: '#34d399' }
            : { text: '部分降级', level: 'warn', color: '#f59e0b' };
      const rssPath = state?.feed?.rssPath || '/dsh-hotspot/rss.xml';
      const rssHref = (typeof window !== 'undefined' ? window.location.origin : '') + rssPath;
      const sourceLabelOf = (id) => {
        if (!id) return '';
        const all = [...activeSourceList(state), ...(state?.builtinSources || [])];
        return all.find((source) => source.id === id)?.name || id;
      };
      // 每条候选来自哪些源；整个列表只有一个源时就不必每行重复写源名。
      const itemSourceNames = (item) => [...new Set((item.sources || []).map((s) => sourceLabelOf(s.source)).filter(Boolean))];
      const listSourceSet = new Set();
      for (const item of rawItems) for (const name of itemSourceNames(item)) listSourceSet.add(name);
      const showSourcePerRow = listSourceSet.size > 1;
      // 整个列表只有一个源时，不逐行重复源名，在顶部说一次。
      const listSourceNames = [...new Set(
        rawItems.flatMap((it) => (it.sources || []).map((s) => sourceLabelOf(s.source) || s.source))
      )].filter(Boolean);
      const listSingleSource = listSourceNames.length === 1 ? listSourceNames[0] : '';
      const feedSourceNames = [...new Set(
        (state?.feed?.items || []).map((it) => it.sourceName || sourceLabelOf(it.source)).filter(Boolean)
      )];
      const feedSingleSource = feedSourceNames.length === 1 ? feedSourceNames[0] : '';
      const showFeedSource = feedSourceNames.length > 1;
      const overviewStats = [
        ['成功源', digestStatus ? `${digestStatus.feedsOk}/${digestStatus.feedsTotal}` : '—'],
        ['抓取原文', digestStatus?.itemsRaw ?? 0],
        ['去重后', digestStatus?.itemsDeduped ?? 0],
        ['候选', rawItems.length],
        ['今日文章', state?.feed?.items?.length ?? 0],
      ];
      const visibleFeedItems = feedExpanded ? feedItems : feedItems.slice(0, FEED_PREVIEW);

      // 内置源不再单开一块：并进订阅源清单，用「内置」标签区分。
      const builtinSources = state?.builtinSources || [];
      const builtinIds = new Set(builtinSources.map((s) => s.id));
      const configuredSources = state?.config?.sources || [];
      const configuredSourceIds = new Set(configuredSources.map((s) => s.id));
      // 配置里一个源都没写时，内置默认源直接生效（sourcesMode='builtin'）。
      // 这时清单里列的就是正在抓的源，但不可移除 —— 删掉也会立刻回落到默认源。
      const builtinMode = (state?.sourcesMode || (configuredSources.length > 0 ? 'config' : 'builtin')) === 'builtin';
      const listedSources = builtinMode ? activeSourceList(state) : configuredSources;
      const missingBuiltins = builtinMode
        ? []
        : builtinSources.filter((s) => !configuredSourceIds.has(s.id));

      const deployConfigured = Boolean(state?.config?.deploy?.configured);
      const savedDeployScript = state?.config?.deploy?.script || '';
      const savedDeployBuild = state?.config?.deploy?.build || '';
      const deployDetected = state?.config?.deploy?.detected || { script: '', build: '' };
      const configFilePath = state?.config?.configFile || '';
      const deployHistory = state?.config?.deploy?.history || [];
      const lastDeploy = deployHistory[0] || null;

      /** 设置页有没有未保存的改动：底部保存条与「重置」按钮都靠它判断。 */
      const configDirtyCount = () => {
        const savedCfg = state?.config || {};
        const savedHosts = (Array.isArray(savedCfg.publish?.allowedHosts) ? savedCfg.publish.allowedHosts : []).join('\n');
        return [
          blogProjectRoot.trim() !== String(savedCfg.projectRoot || ''),
          blogArticleDir.trim() !== String(savedCfg.articleDir || 'docs'),
          blogDraftDir.trim() !== String(savedCfg.draftDir || '.drafts'),
          blogDigestDir.trim() !== String(savedCfg.digestDir || '.hotspot'),
          Number(rankLimit) !== Number(savedCfg.rank?.limit ?? 15),
          Number(rankSinceHours) !== Number(savedCfg.rank?.sinceHours ?? 36),
          Number(rankHalfLifeHours) !== Number(savedCfg.rank?.halfLifeHours ?? 24),
          Number(rankClusterThreshold) !== Number(savedCfg.rank?.clusterThreshold ?? 0.6),
          Number(publishMaxPerDay) !== Number(savedCfg.publish?.maxPerDay ?? 3),
          publishAllowedHosts.trim() !== savedHosts.trim(),
          deployScript.trim() !== savedDeployScript,
          deployBuild.trim() !== savedDeployBuild
        ].filter(Boolean).length;
      };
      const deployCodeStyle = {
        margin: 0,
        padding: '8px 10px',
        borderRadius: 6,
        background: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid var(--dsw-alias-border-l1, #2d303b)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 12,
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        maxHeight: 220,
        overflow: 'auto',
        userSelect: 'text'
      };

      // 编辑器里的正文是否仍为空（scaffold 只写了标题与来源）
      const draftBodyEmpty = isDraftBodyEmpty(editContent);

      // 简介字数：按码点数，和后端 [...text].length 的口径一致
      const descriptionChars = [...scaffoldDescription.trim()].length;

      /**
       * 部署实时日志弹窗：快照来自 GET /api/deploy/status（1s 轮询）。
       *
       * 关掉它不影响部署 —— 部署跑在服务端，这里只是个显示器；页头按钮随时能叫回来。
       * 结束后由 handleDeploy 换成结果弹窗（带 stdout/stderr 分开与历史）。
       */
      const renderDeployLiveModal = () => {
        if (!deployLiveOpen) return null;
        const live = deployLive;
        const running = !live || live.state === 'running';
        const failed = live?.state === 'failed';
        const elapsed = live?.startedAt
          ? formatSpan((live.endedAt ? new Date(live.endedAt).getTime() : deployNow) - new Date(live.startedAt).getTime())
          : '';
        const steps = Array.isArray(live?.steps) ? live.steps : [];

        const badgeOf = (state) => state === 'running'
          ? { text: '进行中', color: '#60a5fa', background: 'rgba(96,165,250,.16)' }
          : state === 'success'
            ? { text: '成功', color: '#34d399', background: 'rgba(16,185,129,.15)' }
            : { text: '失败', color: '#f87171', background: 'rgba(248,113,113,.15)' };

        const jumpToLatest = () => {
          setDeployStick(true);
          const box = deployLogRef.current;
          if (box) box.scrollTop = box.scrollHeight;
        };

        return h('div', { className: 'hs-modal-mask', key: 'deploy-live-modal', style: { zIndex: 1260 } }, [
          h('div', { className: 'hs-modal', style: { width: 760, maxWidth: '92vw' } }, [
            h('div', { className: 'hs-modal-header' }, [
              h('div', { style: { minWidth: 0 } }, [
                h('h3', { className: 'hs-modal-title' }, running
                  ? '站点部署'
                  : (failed ? '❌ 部署失败' : '✅ 站点部署完成')),
                live?.cwd && h('div', {
                  style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary, #8c909e)', marginTop: 2, wordBreak: 'break-all' }
                }, live.cwd)
              ]),
              h('div', {
                style: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--dsw-alias-label-secondary, #9da1b0)' }
              }, [
                running && h('span', {
                  style: { width: 6, height: 6, borderRadius: '50%', background: '#60a5fa', boxShadow: '0 0 0 3px rgba(96,165,250,.15)' }
                }),
                running ? `部署中 · 已用 ${elapsed}` : `共 ${elapsed}`,
                h('button', { className: 'hs-btn ghost', style: { padding: '4px 8px' }, onClick: () => setDeployLiveOpen(false) }, '✕')
              ])
            ]),
            h('div', {
              ref: deployLogRef,
              className: 'hs-modal-body',
              style: { maxHeight: '56vh', overflowY: 'auto' },
              onScroll: (e) => {
                const box = e.currentTarget;
                const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
                if (atBottom !== deployStick) setDeployStick(atBottom);
              }
            }, [
              !live && h('div', { style: { fontSize: 12, color: '#8c909e' } }, '正在启动部署…'),
              live && steps.length === 0 && h('div', { style: { fontSize: 12, color: '#8c909e' } }, '正在启动构建…'),
              steps.map((step, index) => {
                const badge = badgeOf(step.state);
                return h('div', {
                  key: `deploy-step-${step.name}-${index}`,
                  style: {
                    marginBottom: 14,
                    paddingTop: index === 0 ? 0 : 12,
                    borderTop: index === 0 ? 'none' : '1px solid var(--dsw-alias-border-l1, #2d303b)'
                  }
                }, [
                  h('div', { style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8, fontSize: 12 } }, [
                    h('span', {
                      style: { fontSize: 11, padding: '2px 8px', borderRadius: 999, background: badge.background, color: badge.color }
                    }, `${step.name === 'build' ? '构建' : '部署'} · ${badge.text}`),
                    step.code !== null && step.code !== undefined && h('span', null, `退出码：${step.code}`),
                    step.timedOut && h('span', { style: { color: '#f87171' } }, '已超时并强制结束'),
                    step.durationMs ? h('span', null, `耗时：${(Number(step.durationMs) / 1000).toFixed(1)}s`) : null
                  ]),
                  step.script && h('div', { style: deployCodeStyle }, step.script),
                  h('pre', {
                    style: {
                      margin: '8px 0 0', padding: '10px 12px', borderRadius: 8,
                      background: '#101116', border: '1px solid var(--dsw-alias-border-l1, #2d303b)',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: 11.5, lineHeight: 1.65, color: '#b7bcc8',
                      whiteSpace: 'pre-wrap', wordBreak: 'break-all'
                    }
                  }, step.output || (step.state === 'running' ? '…' : '（无输出）'))
                ]);
              })
            ]),
            h('div', { className: 'hs-modal-footer' }, [
              h('div', { style: { marginRight: 'auto', fontSize: 11, color: '#6f7484' } },
                running
                  ? '关掉不影响部署；页头按钮会变成「查看部署日志」，点它随时接回'
                  : '详情见「上次部署 · 查看详情」'),
              !deployStick && running && h('button', { className: 'hs-btn', onClick: jumpToLatest }, '↓ 跳到最新'),
              h('button', { className: 'hs-btn primary', onClick: () => setDeployLiveOpen(false) }, '关闭')
            ])
          ])
        ]);
      };

      /** 毫秒 → 「12s」/「1m 42s」；进度弹窗里每一步都挂一个。 */
      const formatSpan = (ms) => {
        const total = Math.max(0, Math.round(Number(ms) || 0));
        if (total < 1000) return `${total}ms`;
        const seconds = Math.round(total / 1000);
        if (seconds < 60) return `${seconds}s`;
        return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
      };

      /**
       * 进度弹窗：把一条后台写作任务的六步链路摊开。
       *
       * 数据就是 watchJob 轮询到的那份 job（不另起一套轮询）：
       * 步骤是服务端按 write-steps.js 的模板推的，这里只负责画。
       */
      const renderProgressModal = () => {
        if (!progressSlug) return null;
        const job = jobStates[progressSlug]
          || (state?.jobs || []).find(entry => entry && entry.slug === progressSlug)
          || null;
        const steps = Array.isArray(job?.steps) ? job.steps : [];
        const running = job?.state === 'running';
        const failed = job?.state === 'failed';
        const checks = job?.result?.checks;
        const draft = (state?.drafts || []).find(entry => entry && entry.slug === progressSlug) || null;
        const doneCount = steps.filter(step => step.state === 'done').length;
        const elapsed = job?.startedAt
          ? formatSpan((job.endedAt ? new Date(job.endedAt).getTime() : progressNow) - new Date(job.startedAt).getTime())
          : '';

        const markOf = (state) => ({
          done: { glyph: '✓', color: '#6fe0c6', background: 'rgba(77,182,160,.16)', border: '1px solid rgba(77,182,160,.5)' },
          active: { glyph: '●', color: '#60a5fa', background: 'rgba(96,165,250,.16)', border: '1px solid rgba(96,165,250,.55)' },
          failed: { glyph: '✕', color: '#f87171', background: 'rgba(239,68,68,.14)', border: '1px solid rgba(239,68,68,.5)' },
          cancelled: { glyph: '✕', color: '#94a3b8', background: 'rgba(148,163,184,.12)', border: '1px solid rgba(148,163,184,.4)' }
        }[state] || { glyph: '○', color: '#5d6170', background: 'transparent', border: '1px solid #3a3e4d' });
        const summary = !job
          ? '这条任务的状态已经找不到了（宿主可能重启过）'
          : running
            ? `第 ${Math.min(doneCount + 1, steps.length || 1)} / ${steps.length || 6} 步 · 已用 ${elapsed}`
            : job.state === 'done'
              ? `${steps.length || 6} 步全部完成 · 共 ${elapsed}`
              : job.state === 'cancelled'
                ? `已取消 · 停在 ${elapsed}`
                : `失败 · 已用 ${elapsed}`;

        return h('div', { className: 'hs-modal-mask', key: 'progress-modal', style: { zIndex: 1250 } }, [
          h('div', { className: 'hs-modal', style: { width: 560 } }, [
            h('div', { className: 'hs-modal-header' }, [
              h('div', { style: { minWidth: 0 } }, [
                h('h3', { className: 'hs-modal-title' }, `生成草稿 · ${progressSlug}`),
                h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary, #8c909e)', marginTop: 2 } },
                  draft?.title ? `《${draft.title}》` : (running ? '正文在后台写' : '正文已写入'))
              ]),
              h('button', {
                className: 'hs-btn ghost',
                style: { padding: '4px 8px' },
                onClick: () => setProgressSlug(null)
              }, '✕')
            ]),
            h('div', { className: 'hs-modal-body' }, [
              h('div', {
                style: {
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5,
                  color: 'var(--dsw-alias-label-secondary, #9da1b0)', marginBottom: 12
                }
              }, [
                running && h('span', {
                  style: { width: 6, height: 6, borderRadius: '50%', background: '#60a5fa', boxShadow: '0 0 0 3px rgba(96,165,250,.15)' }
                }),
                summary
              ]),

              steps.length === 0
                ? h('div', { style: { fontSize: 12, color: '#8c909e', lineHeight: 1.7 } },
                    job?.message || '这条任务没有步骤记录（可能是旧版本起的任务）')
                : h('div', { style: { display: 'flex', flexDirection: 'column' } }, steps.map((step, index) => {
                    const mark = markOf(step.state);
                    const span = step.startedAt
                      ? formatSpan((step.endedAt ? new Date(step.endedAt).getTime() : progressNow) - new Date(step.startedAt).getTime())
                      : '';
                    const { glyph, ...markStyle } = mark;
                    return h('div', {
                      key: `progress-step-${step.key}`,
                      style: {
                        display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 10, alignItems: 'start',
                        padding: '9px 0', borderTop: index === 0 ? 'none' : '1px dashed rgba(255,255,255,.06)'
                      }
                    }, [
                      h('span', {
                        style: {
                          width: 18, height: 18, borderRadius: '50%', display: 'flex',
                          alignItems: 'center', justifyContent: 'center', fontSize: 11, marginTop: 1,
                          ...markStyle
                        }
                      }, glyph),
                      h('div', { style: { minWidth: 0 } }, [
                        h('div', {
                          style: {
                            fontSize: 12.5,
                            fontWeight: step.state === 'pending' ? 500 : 600,
                            color: step.state === 'pending' ? '#6f7484' : 'var(--dsw-alias-label-primary, #ececf1)'
                          }
                        }, step.label),
                        step.detail && h('div', {
                          style: { fontSize: 11, color: '#6f7484', marginTop: 1, wordBreak: 'break-word' }
                        }, step.detail)
                      ]),
                      h('span', {
                        style: {
                          fontSize: 11, fontVariantNumeric: 'tabular-nums',
                          color: step.state === 'active' ? '#60a5fa' : '#6f7484'
                        }
                      }, step.state === 'active' ? `${span}…` : (span || '待开始'))
                    ]);
                  })),

              checks && checks.ok === false && h('div', {
                style: {
                  marginTop: 12, fontSize: 11.5, color: '#fbbf24',
                  background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.25)',
                  borderLeft: '3px solid #fbbf24', borderRadius: 8, padding: '8px 12px'
                }
              }, `正文已写入，但校验未过 ${checks.violations?.length || 0} 条：` +
                (checks.violations || []).slice(0, 3).map(v => `[${v.code}] ${v.message}`).join('；')),

              failed && job?.error && h('div', {
                style: {
                  marginTop: 12, fontSize: 11.5, color: '#f87171',
                  background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)',
                  borderLeft: '3px solid #ef4444', borderRadius: 8, padding: '8px 12px', wordBreak: 'break-word'
                }
              }, job.error)
            ]),
            h('div', { className: 'hs-modal-footer' }, [
              h('div', { style: { marginRight: 'auto', fontSize: 11, color: '#6f7484' } },
                running ? '关掉不影响后台，卡片上的「写作中」能再打开' : ''),
              running && h('button', {
                className: 'hs-btn',
                style: { color: '#f87171', borderColor: 'rgba(239,68,68,.3)' },
                onClick: () => cancelWrite(progressSlug)
              }, '✕ 取消写作'),
              failed && h('button', {
                className: 'hs-btn',
                disabled: Boolean(jobStarting[progressSlug]),
                onClick: () => retryWrite(progressSlug)
              }, '🔁 重试'),
              !running && draft && h('button', {
                className: 'hs-btn',
                onClick: () => {
                  setProgressSlug(null);
                  openEditor(draft);
                }
              }, '✏️ 打开草稿'),
              h('button', {
                className: 'hs-btn primary',
                onClick: () => setProgressSlug(null)
              }, running ? '后台继续' : '关闭')
            ])
          ])
        ]);
      };

      return h('div', { className: 'hs-root' }, [
        // ── 顶部 Header ──
        h('header', { className: 'hs-header', key: 'header' }, [
          h('div', { className: 'hs-header-left' }, [
            props?.backToConversation && h('button', {
              className: 'hs-back-btn',
              onClick: props.backToConversation,
              title: '返回对话会话'
            }, [
              h('svg', {
                width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', key: 'icon'
              }, [
                h('path', {
                  d: 'M10 3.5 5.5 8l4.5 4.5',
                  stroke: 'currentColor',
                  strokeWidth: 1.8,
                  strokeLinecap: 'round',
                  strokeLinejoin: 'round',
                  key: 'p'
                })
              ]),
              '返回会话'
            ]),
            h('div', { className: 'hs-brand-wrap' }, [
              h('div', { className: 'hs-brand-icon' }, [
                h('svg', {
                  width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round'
                }, [
                  h('path', {
                    d: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z'
                  })
                ])
              ]),
              h('div', { className: 'hs-title-block' }, [
                h('div', { className: 'hs-title-row' }, [
                  h('h1', { className: 'hs-title' }, '热点草稿'),
                  state?.digest?.date && h('span', {
                    className: 'hs-tab-count',
                    style: { fontSize: 10, padding: '1px 6px' }
                  }, state.digest.date)
                ]),
                h('div', { className: 'hs-subtitle' }, [
                  h('span', { className: `hs-status-dot ${isBlogConfigured ? '' : 'warn'}` }),
                  isBlogConfigured
                    ? `博客已连接：${state?.blog?.projectRoot || '已绑定'}`
                    : '未绑定博客根目录（草稿暂不能落地）'
                ])
              ])
            ])
          ]),
          h('div', { className: 'hs-header-actions', key: 'actions' }, [
            h('button', {
              className: 'hs-btn',
              onClick: loadState,
              disabled: loading
            }, [
              h('svg', {
                width: 13,
                height: 13,
                viewBox: '0 0 24 24',
                fill: 'none',
                stroke: 'currentColor',
                strokeWidth: 2,
                className: loading ? 'hs-spinning' : ''
              }, [
                h('path', { d: 'M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67' })
              ]),
              loading ? '刷新中' : '刷新'
            ]),
            (deployConfigured || deployDetected.script) && h('button', {
              className: 'hs-btn',
              onClick: () => {
                if (!deployConfigured) {
                  setTab('config');
                  showToast(
                    deployDetected.script
                      ? `检测到 ${deployDetected.script}，在配置里点「使用探测结果」并保存即可部署`
                      : '先在「设置」里绑定部署脚本',
                    true
                  );
                  return;
                }
                handleDeploy();
              },
              disabled: !isBlogConfigured,
              title: deploying
                ? '部署正在进行，点开看实时日志'
                : !isBlogConfigured
                  ? '先在「设置」里绑定博客项目根目录'
                  : deployConfigured
                    ? `执行部署：${savedDeployBuild ? `${savedDeployBuild} && ` : ''}${savedDeployScript}`
                    : '尚未绑定部署脚本，点击前往配置'
            }, [
              h('svg', {
                width: 14,
                height: 14,
                viewBox: '0 0 24 24',
                fill: 'none',
                stroke: 'currentColor',
                strokeWidth: 2,
                className: deploying ? 'hs-spinning' : ''
              }, [
                h('path', { d: 'M12 3v12' }),
                h('path', { d: 'm7 8 5-5 5 5' }),
                h('path', { d: 'M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4' })
              ]),
              deploying ? '查看部署日志' : '部署站点'
            ]),
            h('button', {
              className: 'hs-btn primary',
              onClick: handleRun,
              disabled: running
            }, [
              h('svg', {
                width: 14,
                height: 14,
                viewBox: '0 0 24 24',
                fill: 'none',
                stroke: 'currentColor',
                strokeWidth: 2.2,
                className: running ? 'hs-spinning' : ''
              }, [
                h('path', { d: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' })
              ]),
              running ? '抓取聚类中...' : '立即扫描抓取'
            ])
          ])
        ]),

        // ── 导航选项卡 ──
        h('nav', { className: 'hs-nav', key: 'nav' }, [
          h('button', {
            className: `hs-tab ${tab === 'candidates' ? 'active' : ''}`,
            onClick: () => setTab('candidates'),
            key: 'tab-c'
          }, [
            '热点候选',
            h('span', { className: 'hs-tab-count' }, items.length)
          ]),
          h('button', {
            className: `hs-tab ${tab === 'sources' ? 'active' : ''}`,
            onClick: () => setTab('sources'),
            key: 'tab-s'
          }, [
            '订阅源管理',
            h('span', { className: 'hs-tab-count' }, activeSourceList(state).length)
          ]),
          h('button', {
            className: `hs-tab ${tab === 'drafts' || tab === 'articles' ? 'active' : ''}`,
            onClick: () => setTab('drafts'),
            key: 'tab-d'
          }, [
            '草稿箱',
            h('span', { className: 'hs-tab-count' }, state?.drafts?.length || 0)
          ]),
          h('button', {
            className: `hs-tab ${tab === 'config' ? 'active' : ''}`,
            onClick: () => setTab('config'),
            key: 'tab-cfg'
          }, '设置')
        ]),

        // ── 内容主体 ──
        h('main', { className: 'hs-content', key: 'main' }, [
          // ── TAB: 热点候选 ──
          tab === 'candidates' && h('div', { key: 'candidates-panel' }, [
            // 未绑定博客警告 Banner
            !isBlogConfigured && h('div', { className: 'hs-alert', key: 'unconfigured-alert' }, [
              h('div', { className: 'hs-alert-top' }, [
                h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, [
                  h('path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z' }),
                  h('line', { x1: 12, y1: 9, x2: 12, y2: 13 }),
                  h('line', { x1: 12, y1: 17, x2: 12.01, y2: 17 })
                ]),
                '未配置博客项目根目录'
              ]),
              h('div', { className: 'hs-alert-desc' },
                'dsh-hotspot 保持零假设与环境解耦，默认不预设任何博客路径。在落地草稿或发布前，必须提供有效的博客项目绝对路径（如 VitePress 博客根目录）。'
              ),
              h('div', { style: { display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' } }, [
                h('input', {
                  className: 'hs-input',
                  style: { flex: '1 1 260px' },
                  placeholder: '选择或输入博客根目录路径，如 /Users/username/Code/my-blog',
                  value: quickBlogRoot,
                  onChange: (e) => setQuickBlogRoot(e.target.value)
                }),
                h('button', {
                  className: 'hs-btn',
                  type: 'button',
                  disabled: pickingDir,
                  title: '调起系统原生文件夹选择器',
                  onClick: async () => {
                    const dir = await handlePickDirectory();
                    if (dir) setQuickBlogRoot(dir);
                  }
                }, [
                  h('span', { style: { marginRight: 4 } }, '📁'),
                  pickingDir ? '选择中...' : '选择文件夹'
                ]),
                h('button', {
                  className: 'hs-btn primary',
                  onClick: handleSaveQuickBlog,
                  disabled: savingQuickBlog
                }, savingQuickBlog ? '绑定中...' : '快速绑定博客根目录')
              ])
            ]),

            // 今日一行：几条候选、什么时候抓的、抓得顺不顺。
            // 各阶段产出（成功源/原文/去重）收进「抓取详情」，不占正文位置。
            h('div', { className: 'hs-today', key: 'today' }, [
              h('span', { className: 'hs-today-count' },
                digest ? `${rawItems.length} 条候选` : '今天还没有候选'
              ),
              listSingleSource && h('span', { className: 'hs-today-src' }, listSingleSource),
              h('span', { className: 'hs-today-meta' }, [
                health && h('i', {
                  className: `hs-dot${health.level === 'ok' ? '' : ` ${health.level}`}`,
                  title: health.text
                }),
                health && health.level !== 'ok' && h('span', { style: { color: health.color } }, health.text),
                health && health.level !== 'ok' && h('span', { style: { opacity: 0.45 } }, '·'),
                h('span', null, digestTime ? `最近抓取 ${digestTime}` : '还没有抓取记录')
              ]),
              h('span', { style: { flex: 1 } }),
              digest && h('button', {
                className: 'hs-btn ghost',
                style: { padding: '3px 8px', fontSize: 11.5 },
                'aria-expanded': digestDetailOpen ? 'true' : 'false',
                onClick: () => setDigestDetailOpen((value) => !value)
              }, [
                digestDetailOpen ? '收起详情' : '抓取详情',
                h('svg', {
                  width: 11,
                  height: 11,
                  viewBox: '0 0 24 24',
                  fill: 'none',
                  stroke: 'currentColor',
                  strokeWidth: 2,
                  style: { transform: digestDetailOpen ? 'rotate(180deg)' : 'none', transition: 'transform 160ms var(--hs-ease-out)' }
                }, [h('polyline', { points: '6 9 12 15 18 9' })])
              ])
            ]),
            digestDetailOpen && digest && h('div', { className: 'hs-detail-panel', key: 'today-detail' },
              overviewStats.map(([label, value]) => h('div', { className: 'hs-detail-item', key: label }, [
                h('b', null, String(value)),
                h('span', null, label)
              ]))
            ),

            // 搜索 + 分段筛选
            h('div', { className: 'hs-tools', key: 'tools' }, [
              h('div', { className: 'hs-search' }, [
                h('svg', {
                  className: 'hs-search-icon',
                  width: 13,
                  height: 13,
                  viewBox: '0 0 24 24',
                  fill: 'none',
                  stroke: 'currentColor',
                  strokeWidth: 2
                }, [
                  h('circle', { cx: 11, cy: 11, r: 8 }),
                  h('line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 })
                ]),
                h('input', {
                  className: 'hs-input',
                  placeholder: '搜索标题、摘要或标签',
                  value: filter,
                  onChange: (e) => setFilter(e.target.value)
                }),
                filter && h('button', {
                  className: 'hs-search-clear',
                  title: '清空搜索',
                  onClick: () => setFilter('')
                }, '×')
              ]),
              h('div', { className: 'hs-seg', role: 'group', 'aria-label': '筛选候选' }, [
                { key: 'all', label: '全部', count: rawItems.length },
                pickCount > 0 && pickCount < rawItems.length && { key: 'picked', label: '精选', count: pickCount },
                multiSourceCount > 0 && { key: 'multi', label: '多源', count: multiSourceCount }
              ].filter(Boolean).map((seg) => h('button', {
                key: seg.key,
                className: filterTag === seg.key ? 'on' : '',
                onClick: () => setFilterTag(seg.key),
                title: seg.key === 'picked'
                  ? '今天综合得分最高的几条'
                  : seg.key === 'multi' ? '同一件事被多个源同时报道' : '显示全部候选'
              }, [seg.label, h('b', null, seg.count)])))
            ]),

            // 候选列表
            items.length === 0
              ? h('div', {
                  key: 'empty',
                  className: 'hs-list',
                  style: { textAlign: 'center', padding: '44px 20px' }
                }, [
                  h('div', { style: { fontSize: 26, marginBottom: 10, opacity: 0.8 } },
                    rawItems.length === 0 ? '📡' : '🔍'
                  ),
                  h('div', { style: { fontSize: 13.5, fontWeight: 600 } },
                    rawItems.length === 0 ? '今天还没有候选' : '没有匹配的候选'
                  ),
                  h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #8c909e)', marginTop: 6, lineHeight: 1.6 } },
                    rawItems.length === 0
                      ? '抓取一次，插件会并发采集所有订阅源并按跨源共现排序。'
                      : '换个关键词，或回到「全部」看看今天的全部候选。'
                  ),
                  h('div', { style: { display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' } }, [
                    rawItems.length === 0
                      ? h('button', {
                          className: 'hs-btn primary',
                          disabled: running,
                          onClick: handleRun
                        }, running ? '抓取中…' : '立即抓取一次')
                      : h('button', {
                          className: 'hs-btn',
                          onClick: () => { setFilter(''); setFilterTag('all'); }
                        }, '清空筛选'),
                    h('button', {
                      className: 'hs-btn ghost',
                      onClick: () => setTab('sources')
                    }, '管理订阅源')
                  ])
                ])
              : h('div', { className: 'hs-list', key: 'list' }, items.map((item, idx) => {
                  const rank = idx + 1;
                  const sourceNames = itemSourceNames(item);
                  const sourceCount = item.sourceCount ?? sourceNames.length;
                  const parts = item.scoreParts || {};
                  const scoreTip = [
                    `综合得分 ${item.score}`,
                    parts.cooccurrence !== undefined ? `共现 ${parts.cooccurrence}` : '',
                    parts.freshness !== undefined ? `新鲜度 ${parts.freshness}` : '',
                    parts.relevance !== undefined ? `关键词 ${parts.relevance}` : ''
                  ].filter(Boolean).join(' · ');
                  const metaNodes = [
                    showSourcePerRow && sourceNames.length > 0 && h('span', { key: 'src' }, sourceNames.join('、')),
                    sourceCount > 1 && h('span', { key: 'multi', className: 'hs-badge-multi' }, `${sourceCount} 个源共现`),
                    ...(item.tags || []).map((t) => {
                      const isAI = /ai|gpt|llm|agent|model/i.test(t);
                      const isCode = /swift|rust|go|python|js|ts/i.test(t);
                      const cls = isAI ? 'hs-tag-pill ai' : isCode ? 'hs-tag-pill code' : 'hs-tag-pill';
                      return h('span', { className: cls, key: `tag-${t}` }, `#${t}`);
                    })
                  ].filter(Boolean);
                  return h('div', { className: `hs-row${rank <= 3 ? ' top' : ''}`, key: item.id || idx }, [
                    h('div', { className: 'hs-row-rank', title: scoreTip }, String(rank).padStart(2, '0')),
                    h('div', { className: 'hs-row-main' }, [
                      h('a', {
                        className: 'hs-row-title',
                        href: item.url,
                        target: '_blank',
                        rel: 'noreferrer',
                        title: item.title
                      }, item.title),
                      item.summary && h('div', { className: 'hs-row-summary' }, item.summary),
                      metaNodes.length > 0 && h('div', { className: 'hs-row-meta' }, metaNodes),
                      // 只有真的多个来源时才值得展开；单源已经在上面写过了。
                      item.sources && item.sources.length > 1 && h('details', { className: 'hs-details' }, [
                        h('summary', null, `另有 ${item.sources.length - 1} 个来源`),
                        h('div', { className: 'hs-details-panel' }, [
                          item.sources.map((s, sIdx) => h('div', { key: sIdx, style: { marginBottom: sIdx === item.sources.length - 1 ? 0 : 6, fontSize: 12 } }, [
                            h('span', {
                              className: 'hs-tag-pill',
                              style: { marginRight: 6, fontSize: 10 }
                            }, sourceLabelOf(s.source) || 'source'),
                            h('a', {
                              href: s.url,
                              target: '_blank',
                              rel: 'noreferrer',
                              style: { color: 'var(--dsw-alias-brand-primary, #4db6a0)', textDecoration: 'none' }
                            }, s.title || s.url)
                          ]))
                        ])
                      ])
                    ]),
                    h('div', { className: 'hs-row-actions' }, [
                      h('button', {
                        className: 'hs-btn hs-row-btn',
                        title: '用这条候选生成草稿',
                        onClick: () => handleScaffold(item)
                      }, '生成草稿')
                    ])
                  ]);
                })),
            // 今日订阅文章：候选之外的当天原文，默认只露 6 条，需要再展开。
            feedDate && feedItems.length > 0 && h('div', { key: 'feed-items', style: { marginTop: 26 } }, [
              h('div', {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                  padding: '0 2px 10px',
                  marginBottom: 6,
                  borderBottom: '1px solid var(--dsw-alias-border-l1, #2d303b)'
                }
              }, [
                h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' } }, [
                  h('span', { className: 'hs-card-title', style: { fontSize: 13 } }, '今日其他文章'),
                  h('span', { style: { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary, #8c909e)' } },
                    `候选之外的 ${feedItems.length} 条${feedSingleSource ? ` · ${feedSingleSource}` : ''}`
                  )
                ]),
                h('span', { style: { flex: 1 } }),
                feedItems.length > FEED_PREVIEW && h('button', {
                  className: 'hs-btn ghost',
                  style: { padding: '4px 9px', fontSize: 11.5 },
                  onClick: () => setFeedExpanded((value) => !value)
                }, feedExpanded ? '收起' : '展开全部')
              ]),
              h('div', { className: 'hs-list' },
                visibleFeedItems.map((item, idx) => {
                  const when = item.publishedAt ? new Date(item.publishedAt) : null;
                  const whenText = when && !Number.isNaN(when.getTime())
                    ? when.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                    : '';
                  const sourceName = item.sourceName || sourceLabelOf(item.source);
                  return h('div', {
                    key: item.id || `${item.url}-${idx}`,
                    className: 'hs-feed-row',
                    style: {
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '10px 18px',
                      borderTop: idx === 0 ? 'none' : '1px solid var(--dsw-alias-border-l1, #2d303b)'
                    }
                  }, [
                    h('div', { style: { flex: 1, minWidth: 0 } }, [
                      h('a', {
                        href: item.url,
                        target: '_blank',
                        rel: 'noreferrer',
                        style: {
                          color: 'inherit',
                          fontSize: 13.5,
                          fontWeight: 500,
                          textDecoration: 'none',
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }
                      }, item.title || item.url),
                      item.summary && h('div', { className: 'hs-feed-sum' }, item.summary),
                      h('div', { className: 'hs-candidate-meta', style: { marginTop: 4, gap: 6 } }, [
                        showFeedSource && sourceName && h('span', {
                          className: 'hs-tag-pill',
                          style: { fontSize: 10 }
                        }, sourceName),
                        whenText && h('span', { style: { fontSize: 11 } }, whenText)
                      ])
                    ]),
                    h('button', {
                      className: 'hs-btn ghost',
                      style: { padding: '3px 8px', fontSize: 11, flexShrink: 0 },
                      onClick: () => {
                        setScaffoldTarget({
                          title: item.title,
                          url: item.url,
                          summary: item.summary,
                          sources: [{ source: item.source, title: item.title, url: item.url }]
                        });
                        setShowScaffoldModal(true);
                      }
                    }, '生成草稿')
                  ]);
                })
              )
            ])
          ]),

          // ── TAB: 订阅源管理（添加一行 + 行式清单；内置源不单开 hero） ──
          tab === 'sources' && (() => {
            const enabledCount = listedSources.length;
            const customCount = builtinMode ? 0 : configuredSources.length;
            const builtinEnabled = listedSources.filter(s => builtinIds.has(s.id)).length;
            const feedsTotal = state?.digest?.status?.feedsTotal;
            const feedsOk = state?.digest?.status?.feedsOk;
            const kindLabel = (kind) => (
              kind === 'github-release' ? 'GitHub Release'
                : kind === 'hn' ? 'Hacker News'
                  : kind === 'atom' ? 'Atom'
                    : 'RSS / Atom'
            );
            const kindClass = (kind) => (
              kind === 'github-release' ? 'release' : kind === 'hn' ? 'hn' : 'rss'
            );
            const targetOf = (source) => {
              if (source.url) return source.url;
              if (source.repo) return `github.com/${source.repo} · releases.atom（无需 token）`;
              if (source.kind === 'hn') return `Hacker News 榜单 · minPoints ${source.minPoints ?? '—'}`;
              return '';
            };

            const kindOptions = [
              { value: 'rss', label: 'RSS / Atom' },
              { value: 'github-release', label: 'GitHub Release' },
              { value: 'hn', label: 'Hacker News' }
            ];

            return h('div', { key: 'sources-panel' }, [
              h('div', { className: 'hs-cfg-head' }, [
                h('div', null, [
                  h('div', { className: 'hs-cfg-title' }, '订阅源'),
                  h('div', { className: 'hs-cfg-subtitle' },
                    '聚合扫描会并发采集所有启用的源；同一件事被多个源覆盖时，候选的「跨源共现」分才站得住')
                ]),
                builtinMode
                  ? h('span', { className: 'hs-cfg-state warn' }, [h('span', { className: 'hs-cfg-dot' }), '内置默认源生效中'])
                  : h('span', { className: 'hs-cfg-state ok' }, [h('span', { className: 'hs-cfg-dot' }), `${enabledCount} 个源生效中`])
              ]),

              h('div', { className: 'hs-cfg-overview' }, [
                h('div', { className: 'hs-cfg-stat' }, [
                  h('div', { className: 'hs-cfg-stat-label' }, '生效中'),
                  h('div', { className: 'hs-cfg-stat-value' }, [String(enabledCount), h('span', { className: 'weak' }, '个源')])
                ]),
                h('div', { className: 'hs-cfg-stat' }, [
                  h('div', { className: 'hs-cfg-stat-label' }, '自定义'),
                  h('div', { className: 'hs-cfg-stat-value' }, [String(customCount), h('span', { className: 'weak' }, '个')])
                ]),
                h('div', { className: 'hs-cfg-stat' }, [
                  h('div', { className: 'hs-cfg-stat-label' }, '内置'),
                  h('div', { className: 'hs-cfg-stat-value' }, [
                    String(builtinEnabled),
                    h('span', { className: 'weak' }, missingBuiltins.length ? `另有 ${missingBuiltins.length} 个未启用` : '个')
                  ])
                ]),
                h('div', { className: 'hs-cfg-stat' }, [
                  h('div', { className: 'hs-cfg-stat-label' }, '最近抓取'),
                  h('div', { className: 'hs-cfg-stat-value', style: { fontSize: 12 } },
                    feedsTotal == null
                      ? h('span', { className: 'weak' }, '还没有记录')
                      : [
                          h('span', null, `${feedsOk}/${feedsTotal}`),
                          h('span', { className: 'weak' }, feedsOk === feedsTotal ? '全部成功' : '部分失败')
                        ])
                ])
              ]),

              h('div', { className: 'hs-cfg-section' }, [
                h('div', { className: 'hs-cfg-section-head' }, [
                  h('div', { className: 'hs-cfg-section-title' }, '添加'),
                  h('div', { className: 'hs-cfg-section-note' }, 'RSS / Atom · GitHub Release · Hacker News')
                ]),
                h('div', { className: 'hs-card' }, [
                  h('div', { className: `hs-src-add ${newKind === 'hn' ? 'hn' : ''}` }, [
                    h('select', {
                      className: 'hs-select',
                      value: newKind,
                      onChange: (e) => setNewKind(e.target.value)
                    }, kindOptions.map(o => h('option', { key: o.value, value: o.value }, o.label))),
                    h('input', {
                      className: 'hs-input hs-cfg-mono',
                      placeholder: 'swift-org',
                      value: newId,
                      onChange: (e) => setNewId(e.target.value)
                    }),
                    h('input', {
                      className: 'hs-input hs-cfg-mono',
                      placeholder: newKind === 'github-release'
                        ? 'apple/swift'
                        : (newKind === 'hn' ? '留空即可，HN 不需要 URL' : 'https://www.swift.org/atom.xml'),
                      value: newTarget,
                      disabled: newKind === 'hn',
                      onChange: (e) => setNewTarget(e.target.value)
                    }),
                    newKind === 'hn' && h('input', {
                      className: 'hs-input',
                      type: 'number',
                      placeholder: 'minPoints 100',
                      value: newPoints,
                      onChange: (e) => setNewPoints(e.target.value)
                    }),
                    h('button', { className: 'hs-btn primary', onClick: handleAddSource }, '+ 添加')
                  ]),
                  h('div', { className: 'hs-form-hint' },
                    'ID 用于来源标注，改一次就是新源；GitHub Release 填 owner/repo，Hacker News 只需要最低热度')
                ])
              ]),

              h('div', { className: 'hs-cfg-section' }, [
                h('div', { className: 'hs-cfg-section-head' }, [
                  h('div', { className: 'hs-cfg-section-title' }, '订阅源清单'),
                  h('div', { className: 'hs-cfg-section-note' },
                    builtinMode
                      ? '配置里没有自定义源，扫描直接用内置默认源'
                      : '带「内置」标签的来自插件自带推荐源')
                ]),
                h('div', { className: 'hs-card' }, [
                  h('div', { className: 'hs-card-header' }, [
                    h('div', null, [
                      h('div', { className: 'hs-card-title' }, `生效中 ${enabledCount} 个`),
                      h('div', { className: 'hs-card-subtitle' }, '单源失败只记录下来，不中断其他源；失败名单出现在候选页的抓取详情里')
                    ]),
                    !builtinMode && missingBuiltins.length > 0 && h('button', {
                      className: 'hs-btn',
                      onClick: handleEnableBuiltins
                    }, `⚡ 启用全部内置（${missingBuiltins.length}）`)
                  ]),

                  enabledCount === 0 && h('div', {
                    style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #8c909e)', padding: '6px 2px' }
                  }, '还没有任何源：先加一个自定义源，或启用下面的内置推荐源。'),

                  h('div', { className: 'hs-src-rows' }, [
                    listedSources.map(source => h('div', { key: source.id, className: 'hs-src-row' }, [
                      h('span', { className: `hs-src-kind ${kindClass(source.kind)}` }, kindLabel(source.kind)),
                      h('div', { className: 'hs-src-main' }, [
                        h('div', { className: 'hs-src-title' }, [
                          source.id,
                          builtinIds.has(source.id) && h('span', { className: 'hs-src-kind hs-src-builtin' }, '内置')
                        ]),
                        h('div', { className: 'hs-src-target', title: targetOf(source) }, targetOf(source))
                      ]),
                      h('div', { className: 'hs-src-actions' }, builtinMode
                        ? h('span', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary, #9da1b0)' } }, '默认生效')
                        : h('button', {
                            className: 'hs-btn ghost',
                            style: { padding: '3px 8px', fontSize: 11, color: '#f87171' },
                            onClick: () => handleDeleteSource(source.id)
                          }, '移除'))
                    ])),

                    missingBuiltins.map(builtin => h('div', {
                      key: `builtin-${builtin.id}`,
                      className: 'hs-src-row pending'
                    }, [
                      h('span', { className: `hs-src-kind ${kindClass(builtin.kind)}` }, kindLabel(builtin.kind)),
                      h('div', { className: 'hs-src-main' }, [
                        h('div', { className: 'hs-src-title' }, [
                          builtin.id,
                          h('span', { className: 'hs-src-kind hs-src-builtin' }, '内置'),
                          h('span', { className: 'hs-src-kind' }, '未启用')
                        ]),
                        h('div', { className: 'hs-src-target', title: targetOf(builtin) }, targetOf(builtin))
                      ]),
                      h('div', { className: 'hs-src-actions' }, h('button', {
                        className: 'hs-btn',
                        style: { padding: '3px 10px', fontSize: 11 },
                        onClick: () => handleAddPresetSource(builtin)
                      }, '启用'))
                    ]))
                  ])
                ])
              ]),

              // RSS 属于「源」：一条 slim 地址条，不占一整张卡
              h('div', { className: 'hs-src-rss' }, [
                h('span', { className: 'hs-src-rss-label' }, 'RSS 订阅'),
                h('span', { className: 'hs-src-rss-url', title: rssHref }, rssHref),
                h('button', {
                  className: 'hs-btn',
                  style: { padding: '3px 10px', fontSize: 11 },
                  onClick: async () => {
                    try {
                      await navigator.clipboard.writeText(rssHref);
                      showToast('RSS 地址已复制');
                    } catch {
                      showToast('复制失败，请手动复制：' + rssHref, true);
                    }
                  }
                }, '复制'),
                h('a', {
                  href: rssHref,
                  target: '_blank',
                  rel: 'noreferrer',
                  className: 'hs-btn ghost',
                  style: { textDecoration: 'none', padding: '3px 10px', fontSize: 11 }
                }, '打开')
              ])
            ]);
          })(),

          // ── TAB: 草稿箱（只做草稿该做的事：找草稿、看正文、转正、废弃） ──
          (tab === 'drafts' || tab === 'articles') && (() => {
            const drafts = (state?.drafts || []).map(d => ({
              ...d,
              isDraft: true,
              file: d.file || d.path || `docs/draft/${d.slug}/index.md`
            }));

            // 标签只从这些草稿自身取，避免出现「点一下就空列表」的标签
            const draftTags = Array.from(
              new Set(drafts.flatMap(d => (Array.isArray(d.tags) ? d.tags : [])))
            ).slice(0, 12);

            const keyword = articleSearch.trim().toLowerCase();
            const filteredDrafts = drafts.filter(item => {
              if (articleTagFilter !== 'all') {
                if (!Array.isArray(item.tags) || !item.tags.includes(articleTagFilter)) return false;
              }
              if (!keyword) return true;
              return [item.title, item.slug, item.description, ...(Array.isArray(item.tags) ? item.tags : [])]
                .some(value => String(value || '').toLowerCase().includes(keyword));
            });

            const filtersActive = Boolean(keyword) || articleTagFilter !== 'all';
            const resetFilters = () => {
              setArticleSearch('');
              setArticleTagFilter('all');
            };
            const openEditor = (item) => openArticleEditor({ ...item, file: item.file, isDraft: true });

            return h('div', { key: 'drafts-panel' }, [
              h('div', { className: 'hs-card' }, [
                // 工具行：搜索 + 数量 + 清空（只有真的在筛选时才出现）
                h('div', { className: 'hs-drafts-toolbar' }, [
                  h('div', { className: 'hs-search-box' }, [
                    h('svg', {
                      className: 'hs-search-icon',
                      width: 14,
                      height: 14,
                      viewBox: '0 0 24 24',
                      fill: 'none',
                      stroke: 'currentColor',
                      strokeWidth: 2
                    }, [
                      h('circle', { cx: 11, cy: 11, r: 8 }),
                      h('line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 })
                    ]),
                    h('input', {
                      className: 'hs-input hs-search-input',
                      placeholder: '搜索标题、标签...',
                      value: articleSearch,
                      onChange: (e) => setArticleSearch(e.target.value)
                    })
                  ]),
                  h('span', { className: 'hs-drafts-count' }, `${filteredDrafts.length} 篇`),
                  filtersActive && h('button', {
                    className: 'hs-btn sm ghost',
                    onClick: resetFilters
                  }, '清空筛选')
                ]),

                draftTags.length > 1 && h('div', { className: 'hs-drafts-tags' }, [
                  h('span', { className: 'hs-drafts-tags-label' }, '标签'),
                  h('span', {
                    className: `hs-filter-tag ${articleTagFilter === 'all' ? 'active' : ''}`,
                    onClick: () => setArticleTagFilter('all')
                  }, '全部'),
                  ...draftTags.map(tag => h('span', {
                    key: tag,
                    className: `hs-filter-tag ${articleTagFilter === tag ? 'active' : ''}`,
                    onClick: () => setArticleTagFilter(articleTagFilter === tag ? 'all' : tag)
                  }, `#${tag}`))
                ]),

                filteredDrafts.length === 0
                  ? h('div', { className: 'hs-drafts-empty' }, drafts.length === 0 ? [
                      h('div', { style: { fontSize: 22, marginBottom: 6 } }, '📝'),
                      h('div', { style: { fontWeight: 600 } }, '还没有草稿'),
                      h('div', { style: { fontSize: 12, marginTop: 4, color: 'var(--dsw-alias-label-secondary, #8c909e)' } },
                        '去热点候选里挑一个题目，就能一键生成草稿。'),
                      h('button', {
                        className: 'hs-btn primary',
                        style: { marginTop: 12 },
                        onClick: () => setTab('candidates')
                      }, '去看热点候选 →')
                    ] : [
                      h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #8c909e)' } }, '没有匹配的草稿'),
                      h('button', { className: 'hs-btn sm', style: { marginTop: 10 }, onClick: resetFilters }, '清空筛选')
                    ])
                  : h('div', { className: 'hs-drafts-list' }, filteredDrafts.map(item => {
                      const tags = Array.isArray(item.tags) ? item.tags : [];
                      const job = jobStates[item.slug]
                        || (state?.jobs || []).find(j => j && j.slug === item.slug)
                        || null;
                      const writing = job && job.state === 'running';
                      const failed = job && job.state === 'failed';
                      return h('div', {
                        key: `draft-${item.slug}`,
                        className: 'hs-article-card hs-draft-card',
                        title: '点开预览与润色',
                        onClick: () => openEditor(item)
                      }, [
                        h('div', { className: 'hs-article-title-row' }, [
                          h('span', { className: 'hs-article-title', style: { wordBreak: 'break-word' } }, item.title || item.slug),
                          writing && h('button', {
                            key: 'job-running',
                            className: 'hs-tag-pill',
                            title: '看生成链路',
                            style: { cursor: 'pointer', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', borderColor: 'rgba(59, 130, 246, 0.3)' },
                            onClick: (e) => {
                              e.stopPropagation();
                              setProgressSlug(item.slug);
                            }
                          }, '✍️ 写作中'),
                          failed && h('button', {
                            key: 'job-failed',
                            className: 'hs-tag-pill',
                            title: job.error || '写正文失败（点开看是哪一步挂的）',
                            style: { cursor: 'pointer', background: 'rgba(239, 68, 68, 0.12)', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.3)' },
                            onClick: (e) => {
                              e.stopPropagation();
                              setProgressSlug(item.slug);
                            }
                          }, '⚠️ 正文失败'),
                          // 写完了但校验没过：这件事必须留在卡片上，不能只 flash 一个 toast
                          job && job.state === 'done' && job.result?.checks && job.result.checks.ok === false && h('span', {
                            key: 'job-checks',
                            className: 'hs-tag-pill',
                            title: (job.result.checks.violations || []).map(v => `[${v.code}] ${v.message}`).join('\n'),
                            style: { background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', borderColor: 'rgba(245, 158, 11, 0.3)' }
                          }, `⚠️ 校验未过 ${job.result.checks.violations?.length || 0}`),
                          item.pending && h('span', {
                            key: 'draft-pending',
                            className: 'hs-tag-pill',
                            style: { background: 'rgba(148, 163, 184, 0.12)', color: '#94a3b8', borderColor: 'rgba(148, 163, 184, 0.3)' }
                          }, '正文待写'),
                          !item.pending && item.bodyChars > 0 && h('span', {
                            key: 'draft-chars',
                            className: 'hs-draft-date'
                          }, `${item.bodyChars} 字`),
                          item.date && h('span', { className: 'hs-draft-date' }, item.date)
                        ]),
                        item.description && h('div', { className: 'hs-article-desc hs-draft-desc' }, item.description),
                        h('div', { className: 'hs-article-meta' }, [
                          tags.slice(0, 6).map(tag => h('span', {
                            key: tag,
                            className: 'hs-tag-pill',
                            style: { cursor: 'pointer' },
                            onClick: (e) => {
                              e.stopPropagation();
                              setArticleTagFilter(tag);
                            }
                          }, `#${tag}`)),
                          h('div', { className: 'hs-draft-actions' }, [
                            h('button', {
                              className: 'hs-btn sm',
                              style: { padding: '3px 8px', fontSize: 11 },
                              title: '按博客的排版看一遍正文',
                              onClick: (e) => {
                                e.stopPropagation();
                                openBlogPreview(item);
                              }
                            }, '👀 看正文'),
                            h('button', {
                              className: 'hs-btn sm',
                              style: { padding: '3px 8px', fontSize: 11 },
                              onClick: (e) => {
                                e.stopPropagation();
                                openEditor(item);
                              }
                            }, '✏️ 编辑正文'),
                            writing && h('button', {
                              key: 'job-cancel',
                              className: 'hs-btn sm',
                              style: { padding: '3px 8px', fontSize: 11 },
                              onClick: (e) => {
                                e.stopPropagation();
                                cancelWrite(item.slug);
                              }
                            }, '✕ 取消写作'),
                            failed && h('button', {
                              key: 'job-retry',
                              className: 'hs-btn sm',
                              style: { padding: '3px 8px', fontSize: 11 },
                              disabled: Boolean(jobStarting[item.slug]),
                              title: job.error || '重试写正文',
                              onClick: (e) => {
                                e.stopPropagation();
                                retryWrite(item.slug);
                              }
                            }, '🔁 重试写正文'),
                            h('button', {
                              className: 'hs-btn sm primary',
                              style: { padding: '3px 8px', fontSize: 11 },
                              disabled: isPromotingArticle || writing,
                              onClick: (e) => {
                                e.stopPropagation();
                                handlePromoteArticle(item.slug);
                              }
                            }, '🚀 转正发布'),
                            h('button', {
                              className: 'hs-btn sm',
                              style: { padding: '3px 8px', fontSize: 11, color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.3)' },
                              disabled: isDeletingArticle,
                              onClick: (e) => {
                                e.stopPropagation();
                                handleDeleteArticle({ ...item, file: item.file, isDraft: true });
                              }
                            }, '🗑️ 废弃')
                          ])
                        ])
                      ]);
                    }))
              ])
            ]);
          })(),

          // ── TAB: 设置（连接 / 生成 / 发布 / 画像，四组 + 常驻保存条） ──
          tab === 'config' && (() => {
            const field = (label, key, control, hint) => h('div', { className: 'hs-cfg-field' }, [
              h('div', { className: 'hs-cfg-field-label' }, [label, key ? h('span', { className: 'hs-cfg-key' }, key) : null]),
              control,
              hint ? h('div', { className: 'hs-form-hint' }, hint) : null
            ]);

            const numberField = (label, key, value, onChange, unit, hint, extra) =>
              field(
                label,
                key,
                h('div', { className: 'hs-cfg-input-row' }, [
                  h('input', Object.assign({
                    className: 'hs-input',
                    type: 'number',
                    style: { flex: 1, minWidth: 0 },
                    value,
                    onChange: (e) => onChange(e.target.value)
                  }, extra || {})),
                  unit ? h('span', { className: 'hs-cfg-unit' }, unit) : null
                ]),
                hint
              );

            const section = (id, title, note, children) => h('div', {
              className: 'hs-cfg-section',
              key: `sec-${id}`,
              id: `cfg-${id}`
            }, [
              h('div', { className: 'hs-cfg-section-head' }, [
                h('div', { className: 'hs-cfg-section-title' }, title),
                note ? h('div', { className: 'hs-cfg-section-note' }, note) : null
              ]),
              ...children
            ]);

            const stat = (label, value) => h('div', { className: 'hs-cfg-stat' }, [
              h('div', { className: 'hs-cfg-stat-label' }, label),
              h('div', { className: 'hs-cfg-stat-value' }, value)
            ]);

            const drafts = state?.drafts || [];
            const pendingDrafts = drafts.filter(d => d.pending).length;
            const repoName = (state?.blog?.projectRoot || '').split('/').filter(Boolean).pop() || '未绑定';

            return h('div', { key: 'config-panel' }, [
              h('div', { className: 'hs-cfg-head' }, [
                h('div', null, [
                  h('div', { className: 'hs-cfg-title' }, '设置'),
                  h('div', { className: 'hs-cfg-subtitle' }, '连接博客仓库、调整排序与合规参数、绑定部署命令、选择写作模型 —— 保存后服务端热生效')
                ]),
                isBlogConfigured
                  ? h('span', { className: 'hs-cfg-state ok' }, [h('span', { className: 'hs-cfg-dot' }), '已连接'])
                  : h('span', { className: 'hs-cfg-state warn' }, [h('span', { className: 'hs-cfg-dot' }), '未绑定仓库'])
              ]),

              // 四组之间互相隔得远，给一排锚点：点一下直接滚过去
              h('div', { className: 'hs-cfg-jump' }, [
                [['connect', '连接'], ['generate', '生成'], ['publish', '发布'], ['profile', '画像'], ['diagnose', '诊断']].map(([id, label]) =>
                  h('button', {
                    key: id,
                    type: 'button',
                    onClick: () => {
                      const node = typeof document !== 'undefined' ? document.getElementById(`cfg-${id}`) : null;
                      if (node?.scrollIntoView) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                  }, label))
              ]),

              h('div', { className: 'hs-cfg-overview' }, [
                stat('博客仓库', h('span', { className: 'path', title: state?.blog?.projectRoot || '' }, repoName)),
                stat('已发布文章', [
                  h('span', null, `${state?.profile?.articleCount || 0} 篇`),
                  h('span', { className: 'weak' }, `${(state?.profile?.tags || []).length} 个标签`)
                ]),
                stat('草稿', [
                  h('span', null, `${drafts.length} 篇`),
                  h('span', { className: 'weak' }, pendingDrafts > 0 ? `${pendingDrafts} 篇待写` : '都已成稿')
                ]),
                stat('生效订阅源', [
                  h('span', null, `${(state?.activeSources || []).length} 个`),
                  h('span', { className: 'weak' }, state?.sourcesMode === 'builtin' ? '内置默认' : '配置源')
                ]),
                stat('上次部署', lastDeploy
                  ? h('span', {
                      style: { color: lastDeploy.success ? '#34d399' : '#f87171', fontSize: 12, fontWeight: 600 }
                    }, [
                      `${lastDeploy.success ? '✓' : '✗'} ${(Number(lastDeploy.durationMs || 0) / 1000).toFixed(1)}s`,
                      h('span', { className: 'weak' }, new Date(lastDeploy.at).toLocaleDateString())
                    ])
                  : h('span', { className: 'weak' }, '还没有记录'))
              ]),

              section('connect', '连接', '换仓库会重新扫描画像，草稿与文章都跟着新根目录走', [
                h('div', { className: 'hs-card' }, [
                  h('div', { className: 'hs-card-header' }, [
                    h('div', null, [
                      h('div', { className: 'hs-card-title' }, '博客仓库与文档目录'),
                      h('div', { className: 'hs-card-subtitle' }, 'VitePress 项目根目录 · 文章与草稿的落盘位置')
                    ]),
                    isBlogConfigured
                      ? h('span', { className: 'hs-cfg-state ok' }, [h('span', { className: 'hs-cfg-dot' }), '已连接'])
                      : h('span', { className: 'hs-cfg-state warn' }, [h('span', { className: 'hs-cfg-dot' }), '未绑定'])
                  ]),
                  field(
                    '项目根目录',
                    'projectRoot',
                    h('div', { style: { display: 'flex', gap: 8 } }, [
                      h('input', {
                        className: 'hs-input hs-cfg-mono',
                        style: { flex: 1, minWidth: 0 },
                        placeholder: '/Users/you/Code/my-blog',
                        value: blogProjectRoot,
                        onChange: (e) => setBlogProjectRoot(e.target.value)
                      }),
                      h('button', {
                        className: 'hs-btn',
                        type: 'button',
                        disabled: pickingDir,
                        title: '调起系统原生文件夹选择器',
                        onClick: async () => {
                          const dir = await handlePickDirectory();
                          if (dir) setBlogProjectRoot(dir);
                        }
                      }, [h('span', { style: { marginRight: 4 } }, '📁'), pickingDir ? '选择中...' : '选择'])
                    ]),
                    state?.blog?.projectRoot ? `当前生效：${state.blog.projectRoot}` : '尚未绑定，草稿与发布都不可用'
                  ),
                  h('div', { className: 'hs-form-grid', style: { marginTop: 14 } }, [
                    field('文章目录', 'articleDir',
                      h('input', {
                        className: 'hs-input hs-cfg-mono',
                        value: blogArticleDir,
                        onChange: (e) => setBlogArticleDir(e.target.value)
                      }),
                      '转正后的文章落在 <articleDir>/<slug>/'),
                    field('草稿目录', 'draftDir',
                      h('input', {
                        className: 'hs-input hs-cfg-mono',
                        value: blogDraftDir,
                        onChange: (e) => setBlogDraftDir(e.target.value)
                      }),
                      '草稿带 sitemap: false，不进站点地图'),
                    field('数据缓存目录', 'digestDir',
                      h('input', {
                        className: 'hs-input hs-cfg-mono',
                        value: blogDigestDir,
                        onChange: (e) => setBlogDigestDir(e.target.value)
                      }),
                      'digest / raw / 任务状态落在这里')
                  ]),
                  configFilePath && h('div', {
                    className: 'hs-form-hint',
                    style: { marginTop: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', wordBreak: 'break-all' }
                  }, `配置文件：${configFilePath}`)
                ])
              ]),

              section('generate', '生成', '抓多少、留多新、判多重 —— 只影响候选排序与合规闸门', [
                h('div', { className: 'hs-card' }, [
                  h('div', { className: 'hs-card-header' }, [
                    h('div', null, [
                      h('div', { className: 'hs-card-title' }, '抓取与打分'),
                      h('div', { className: 'hs-card-subtitle' }, '确定性公式：3.0×跨源数 + 1.5×新鲜度 + 2.0×关键词 − 5.0×黑名单')
                    ])
                  ]),
                  h('div', { className: 'hs-form-grid' }, [
                    numberField('候选上限', 'limit', rankLimit, setRankLimit, '条 / 天', '单日推荐候选数量（默认 15）'),
                    numberField('回溯时间窗', 'sinceHours', rankSinceHours, setRankSinceHours, '小时', '只采集这段时间内发布的内容（默认 36）')
                  ]),
                  // 两个很少改的参数收起来：页面长度直接少一行
                  h('button', {
                    type: 'button',
                    className: 'hs-cfg-fold',
                    onClick: () => setShowAdvancedRank(v => !v)
                  }, `${showAdvancedRank ? '▾' : '▸'} 高级排序参数（半衰期 / 聚类阈值）`),
                  showAdvancedRank && h('div', { className: 'hs-form-grid', style: { marginTop: 12 } }, [
                    numberField('新鲜度半衰期', 'halfLifeHours', rankHalfLifeHours, setRankHalfLifeHours, '小时', '越过半衰期得分减半（默认 24）'),
                    numberField('聚类阈值', 'clusterThreshold', rankClusterThreshold, setRankClusterThreshold, '0.3–0.95', '标题相似度门槛，越高合并越保守（默认 0.6）', { step: '0.05' })
                  ])
                ]),

                h('div', { className: 'hs-card' }, [
                  h('div', { className: 'hs-card-header' }, [
                    h('div', null, [
                      h('div', { className: 'hs-card-title' }, '发布合规'),
                      h('div', { className: 'hs-card-subtitle' }, '过频与不可信外链都在转正前被三道闸门拦下')
                    ])
                  ]),
                  h('div', { className: 'hs-form-grid' }, [
                    numberField('每日发布上限', 'maxPerDay', publishMaxPerDay, setPublishMaxPerDay, '篇 / 天', '只统计从草稿转正的篇数（默认 3）'),
                    field('外链白名单', 'allowedHosts',
                      h('textarea', {
                        className: 'hs-textarea',
                        style: { height: 76, width: '100%' },
                        placeholder: 'github.com\nswift.org\nnews.ycombinator.com',
                        value: publishAllowedHosts,
                        onChange: (e) => setPublishAllowedHosts(e.target.value)
                      }),
                      '每行一个域名，也可用逗号分隔；发布前逐条比对')
                  ])
                ]),

                h('div', { className: 'hs-card' }, [
                  h('div', { className: 'hs-card-header' }, [
                    h('div', null, [
                      h('div', { className: 'hs-card-title' }, '模型与写作方式'),
                      h('div', { className: 'hs-card-subtitle' }, '写正文与润色都走一次 completion，只用磁盘上已有的材料；两边可以各用一个模型')
                    ]),
                    h('span', { className: 'hs-cfg-state idle' },
                      modelCatalog ? `${(modelCatalog.providers || []).length} 个 provider` : '未接入模型目录')
                  ]),
                  (() => {
                    const providers = modelCatalog?.providers || [];
                    const routes = modelCatalog?.routes || {};
                    if (!modelForm) {
                      return h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #8c909e)' } },
                        modelCatalog === null ? '正在读取模型目录…' : '当前环境没有可用的模型目录（宿主未接入 llm 服务）');
                    }
                    const SEP = '\u0000';
                    const pairOf = (pair) => (pair && pair.provider && pair.model ? `${pair.provider}${SEP}${pair.model}` : '');
                    const setPair = (key, raw) => {
                      const [provider, model] = raw ? raw.split(SEP) : ['', ''];
                      setModelForm(prev => (prev ? { ...prev, [key]: { provider, model } } : prev));
                    };
                    const optionsFor = (allowFollow) => {
                      const opts = [];
                      opts.push(h('option', { key: '__none', value: '' }, allowFollow ? '跟随默认' : '未选择（使用宿主默认）'));
                      for (const provider of providers) {
                        for (const model of (provider.models || [])) {
                          opts.push(h('option', {
                            key: `${provider.provider}${SEP}${model.id}`,
                            value: `${provider.provider}${SEP}${model.id}`
                          }, `${provider.label || provider.provider} · ${model.name || model.id}`));
                        }
                      }
                      return opts;
                    };
                    const modelRow = (key, label, allowFollow) => h('div', { className: 'hs-cfg-model-row', key }, [
                      h('div', { className: 'hs-cfg-field-label', style: { margin: 0 } }, label),
                      h('select', {
                        className: 'hs-input',
                        value: pairOf(modelForm[key]),
                        onChange: (e) => setPair(key, e.target.value)
                      }, optionsFor(allowFollow))
                    ]);
                    const effective = (purpose) => {
                      const route = routes[purpose];
                      return route ? `${route.provider} · ${route.model}` : '未解析到可用模型';
                    };
                    return h('div', null, [
                      modelRow('global', '默认模型', false),
                      modelRow('writer', '写正文', true),
                      modelRow('polish', '润色', true),
                      h('div', { className: 'hs-form-hint', style: { marginTop: 4 } },
                        '写正文与润色都是一次 completion：只用候选素材与已登记补料，不联网、不起子代理。材料不够就先补充料。'),
                      h('div', { className: 'hs-cfg-effective' }, [
                        h('div', null, ['写正文实际会问 ', h('code', null, effective('writer'))]),
                        h('div', null, ['润色实际会问 ', h('code', null, effective('polish'))])
                      ]),
                      h('div', { style: { marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' } }, [
                        h('button', {
                          className: 'hs-btn primary',
                          disabled: savingModels,
                          onClick: handleSaveModels
                        }, savingModels ? '正在保存…' : '保存模型选择'),
                        h('span', { className: 'hs-form-hint', style: { marginTop: 0 } }, '写正文与润色各自读一份，改动只影响下一次生成')
                      ])
                    ]);
                  })()
                ])
              ]),

              section('publish', '发布', 'build → script 顺序执行，任一步失败即停', [
                h('div', { className: 'hs-card', key: 'deploy-card' }, [
                  h('div', { className: 'hs-card-header' }, [
                    h('div', null, [
                      h('div', { className: 'hs-card-title' }, '站点部署'),
                      h('div', { className: 'hs-card-subtitle' }, '两条命令都用你的登录 shell 跑，PATH 与终端一致')
                    ]),
                    deployConfigured
                      ? h('span', { className: 'hs-cfg-state ok' }, [h('span', { className: 'hs-cfg-dot' }), '已绑定'])
                      : h('span', { className: 'hs-cfg-state idle' }, [h('span', { className: 'hs-cfg-dot' }), '未绑定'])
                  ]),
                  h('div', { className: 'hs-form-grid' }, [
                    field('构建命令', 'deploy.build',
                      h('input', {
                        className: 'hs-input hs-cfg-mono',
                        placeholder: 'yarn build',
                        value: deployBuild,
                        onChange: (e) => setDeployBuild(e.target.value)
                      }),
                      '留空跳过构建（deploy.sh 自带构建时适合留空）'),
                    field('部署脚本', 'deploy.script',
                      h('input', {
                        className: 'hs-input hs-cfg-mono',
                        placeholder: './deploy.sh --no-git --skip-build',
                        value: deployScript,
                        onChange: (e) => setDeployScript(e.target.value)
                      }),
                      '必填；面板「部署站点」与 publish 读的都是它，留空保存即解绑')
                  ]),
                  (deployDetected.script || deployDetected.build) && h('div', {
                    style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 12, fontSize: 11.5 }
                  }, [
                    h('span', { style: { color: 'var(--dsw-alias-label-secondary, #8c909e)' } }, '探测到'),
                    deployDetected.build && h('code', { className: 'hs-cfg-unit' }, deployDetected.build),
                    deployDetected.script && h('code', { className: 'hs-cfg-unit' }, deployDetected.script),
                    h('button', {
                      className: 'hs-btn ghost',
                      type: 'button',
                      style: { padding: '2px 8px', fontSize: 11 },
                      onClick: () => {
                        if (deployDetected.build) setDeployBuild(deployDetected.build);
                        if (deployDetected.script) setDeployScript(deployDetected.script);
                        showToast('已填入探测结果，保存后生效');
                      }
                    }, '使用探测结果')
                  ]),
                  h('div', { className: 'hs-cfg-timeline' }, lastDeploy
                    ? [
                        h('span', {
                          style: { color: lastDeploy.success ? '#34d399' : '#f87171', fontWeight: 600 }
                        }, lastDeploy.success
                          ? '✓ 上次部署成功'
                          : `✗ 上次失败${lastDeploy.failedStep ? `（${lastDeploy.failedStep === 'build' ? '构建' : '部署'}阶段）` : ''}`),
                        h('span', null, `${new Date(lastDeploy.at).toLocaleString()} · ${(Number(lastDeploy.durationMs || 0) / 1000).toFixed(1)}s`),
                        h('div', { className: 'hs-cfg-spacer' }),
                        h('button', {
                          className: 'hs-btn ghost',
                          type: 'button',
                          style: { padding: '2px 8px', fontSize: 11 },
                          onClick: () => setDeployResult(lastDeploy)
                        }, '查看输出')
                      ]
                    : [h('span', null, '还没有部署记录；绑定脚本后点右上角「部署站点」跑一次')]),
                  h('div', { style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 } }, [
                    h('button', {
                      className: 'hs-btn',
                      type: 'button',
                      disabled: deploying || !deployConfigured || !isBlogConfigured,
                      title: !deployConfigured
                        ? '先填写并保存部署脚本'
                        : (!isBlogConfigured ? '先绑定博客根目录' : '用已保存的配置立即部署'),
                      onClick: handleDeploy
                    }, deploying ? '部署中...' : '立即部署'),
                    h('span', { className: 'hs-form-hint', style: { marginTop: 0 } },
                      deployConfigured
                        ? `已保存：${savedDeployBuild ? `${savedDeployBuild} && ` : ''}${savedDeployScript}`
                        : '尚未绑定部署脚本'),
                    (deployScript.trim() !== savedDeployScript || deployBuild.trim() !== savedDeployBuild)
                      && h('span', { style: { fontSize: 11, color: '#fbbf24' } }, '（表单已改动，保存后生效）')
                  ])
                ])
              ]),

              section('profile', '画像', '从存量文章归纳，只读；决定候选的 tag 与关键词加权', [
                h('div', { className: 'hs-card' }, [
                  h('div', { className: 'hs-card-header' }, [
                    h('div', null, [
                      h('div', { className: 'hs-card-title' }, '博客画像索引'),
                      h('div', { className: 'hs-card-subtitle' },
                        `${state?.profile?.articleCount || 0} 篇文章 → ${(state?.profile?.tags || []).length} 个标签 · ${(state?.profile?.keywords || []).length} 个关键词`)
                    ]),
                    h('button', {
                      className: 'hs-btn ghost',
                      type: 'button',
                      style: { padding: '2px 8px', fontSize: 11 },
                      onClick: () => {
                        loadState();
                        showToast('已重新探测博客数据');
                      }
                    }, '重新探测')
                  ]),
                  (state?.profile?.tags || []).length > 0 && h('div', { style: { marginBottom: 10 } }, [
                    h('div', { className: 'hs-form-hint', style: { marginTop: 0, marginBottom: 6 } }, '标签体系'),
                    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
                      state.profile.tags.map(t => h('span', { key: t, className: 'hs-tag-pill' }, t))
                    )
                  ]),
                  (state?.profile?.keywords || []).length > 0 && h('div', null, [
                    h('div', { className: 'hs-form-hint', style: { marginTop: 0, marginBottom: 6 } }, '核心关键词'),
                    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
                      state.profile.keywords.map(k => h('span', { key: k, className: 'hs-tag-pill ai' }, k))
                    )
                  ]),
                  (!state?.profile?.tags || state.profile.tags.length === 0) && h('div', {
                    style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #8c909e)' }
                  }, '还没有归纳出画像：绑定仓库或先写几篇带 tags 的文章')
                ])
              ]),

              section('diagnose', '诊断', '出错时只有一条 toast 很难查；这里留当天的错误记录，默认不跨天', [
                h('div', { className: 'hs-card' }, [
                  h('div', { className: 'hs-card-header' }, [
                    h('div', null, [
                      h('div', { className: 'hs-card-title' }, '错误日志'),
                      h('div', { className: 'hs-card-subtitle' },
                        loadingErrors
                          ? '正在读取…'
                          : `今天 ${(errorLog?.entries || []).length} 条${(errorLog?.files || []).length > 1 ? ` · 另有 ${errorLog.files.length - 1} 个历史文件` : ''}`),
                      // 宿主用裸 import() 加载插件模块，Node 进程内会复用旧模块 ——
                      // 改完代码没重启 App 时，面板里看到的报错其实来自旧代码
                      state?.runtime?.loadedAt && h('div', {
                        className: 'hs-form-hint',
                        style: { marginTop: 2, color: (state.runtime.stale || []).length > 0 ? '#fbbf24' : undefined }
                      }, (state.runtime.stale || []).length > 0
                        ? `⚠️ 磁盘上的插件代码比进程里新（${state.runtime.stale.length} 个文件：${state.runtime.stale.slice(0, 3).join('、')}…），要完全退出并重开 DeepSeek Harness 才生效`
                        : `插件代码载入于 ${new Date(state.runtime.loadedAt).toLocaleString('zh-CN')}`)
                    ]),
                    h('div', { style: { display: 'flex', gap: 8 } }, [
                      h('button', {
                        className: 'hs-btn ghost',
                        type: 'button',
                        style: { padding: '2px 8px', fontSize: 11 },
                        disabled: loadingErrors,
                        onClick: loadErrors
                      }, '刷新'),
                      h('button', {
                        className: 'hs-btn ghost',
                        type: 'button',
                        style: { padding: '2px 8px', fontSize: 11, color: '#f87171' },
                        disabled: loadingErrors || (errorLog?.entries || []).length === 0,
                        title: '删除所有错误日志文件（含历史）',
                        onClick: handleClearErrors
                      }, '清空日志')
                    ])
                  ]),
                  (() => {
                    const entries = (errorLog?.entries || []).slice(0, 6);
                    if (entries.length === 0) {
                      return h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary, #8c909e)' } },
                        loadingErrors ? '正在读取…' : '今天没有错误记录');
                    }
                    return h('div', { className: 'hs-src-rows' }, entries.map((entry, index) => h('div', {
                      key: `${entry.at}-${index}`,
                      className: 'hs-src-row',
                      style: { gridTemplateColumns: '150px 120px 1fr' }
                    }, [
                      h('span', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary, #7c8290)' } },
                        new Date(entry.at).toLocaleTimeString('zh-CN', { hour12: false })),
                      h('span', { className: 'hs-src-kind hn' }, entry.source || 'plugin'),
                      h('div', { className: 'hs-src-main' }, [
                        h('div', { style: { fontSize: 12.5, wordBreak: 'break-word' } }, entry.message || '(无消息)'),
                        entry.code && h('div', { className: 'hs-src-target' }, entry.code),
                        entry.detail && h('div', {
                          className: 'hs-src-target',
                          style: { whiteSpace: 'pre-wrap', overflow: 'hidden', maxHeight: 54 }
                        }, entry.detail)
                      ])
                    ])));
                  })()
                ])
              ]),

            ]);
          })(),

        ]),

        // ── 站点部署结果 Modal ──
        renderDeployLiveModal(),

        deployResult && h('div', { className: 'hs-modal-mask', key: 'deploy-modal' }, [
          h('div', { className: 'hs-modal', style: { width: 760, maxWidth: '92vw' } }, [
            h('div', { className: 'hs-modal-header' }, [
              h('h3', { className: 'hs-modal-title' }, deployResult.success
                ? '✅ 站点部署完成'
                : `❌ 部署失败${deployResult.failedStep ? `（${deployResult.failedStep === 'build' ? '构建' : '部署'}阶段）` : ''}`),
              h('button', { className: 'hs-btn ghost', onClick: () => setDeployResult(null) }, '关闭')
            ]),
            h('div', { className: 'hs-modal-body', style: { maxHeight: '60vh', overflowY: 'auto' } }, [
              h('div', {
                style: {
                  display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, marginBottom: 12,
                  color: 'var(--dsw-alias-label-secondary, #8c909e)'
                }
              }, [
                deployResult.at && h('span', null, `时间：${new Date(deployResult.at).toLocaleString()}`),
                h('span', null, `总耗时：${(Number(deployResult.durationMs || 0) / 1000).toFixed(1)}s`),
                deployResult.cwd && h('span', { style: { wordBreak: 'break-all' } }, `工作目录：${deployResult.cwd}`)
              ]),
              (deployResult.steps && deployResult.steps.length
                ? deployResult.steps
                : [{
                    name: 'deploy',
                    script: deployResult.script,
                    success: deployResult.success,
                    code: deployResult.code,
                    timedOut: deployResult.timedOut,
                    durationMs: deployResult.durationMs,
                    stdout: deployResult.stdout,
                    stderr: deployResult.stderr
                  }]
              ).map((step, index) => h('div', {
                key: `step-${index}`,
                style: {
                  marginBottom: 16,
                  paddingTop: index === 0 ? 0 : 12,
                  borderTop: index === 0 ? 'none' : '1px solid var(--dsw-alias-border-l1, #2d303b)'
                }
              }, [
                h('div', {
                  style: {
                    display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
                    marginBottom: 8, fontSize: 12
                  }
                }, [
                  h('span', {
                    style: {
                      fontSize: 11, padding: '2px 8px', borderRadius: 999,
                      background: step.success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(248, 113, 113, 0.15)',
                      color: step.success ? '#34d399' : '#f87171'
                    }
                  }, `${step.name === 'build' ? '构建' : '部署'} · ${step.success ? '成功' : '失败'}`),
                  h('span', null, `退出码：${step.code ?? '无'}`),
                  step.timedOut && h('span', { style: { color: '#f87171' } }, '已超时并强制结束'),
                  h('span', null, `耗时：${(Number(step.durationMs || 0) / 1000).toFixed(1)}s`)
                ]),
                h('div', { style: { marginBottom: 8 } }, [
                  h('div', { className: 'hs-form-label' }, '执行命令'),
                  h('div', { style: deployCodeStyle }, step.script || '（未配置）')
                ]),
                h('div', { style: { marginBottom: 8 } }, [
                  h('div', { className: 'hs-form-label' }, 'stdout'),
                  h('div', { style: deployCodeStyle }, step.stdout?.trim() ? step.stdout : '（无输出）')
                ]),
                step.stderr?.trim() && h('div', null, [
                  h('div', { className: 'hs-form-label' }, 'stderr'),
                  h('div', { style: { ...deployCodeStyle, color: '#f87171' } }, step.stderr)
                ])
              ]))
            ]),
            h('div', { className: 'hs-modal-footer' }, [
              h('button', { className: 'hs-btn', onClick: () => setDeployResult(null) }, '关闭'),
              h('button', {
                className: 'hs-btn primary',
                disabled: deploying,
                onClick: handleDeploy
              }, deploying ? '部署中...' : '重新部署')
            ])
          ])
        ]),

        // ── 设置页底栏：在滚动容器之外，始终贴住面板底部 ──
        tab === 'config' && (() => {
          const dirty = configDirtyCount();
          return h('footer', { className: 'hs-cfg-savebar', key: 'config-savebar' }, [
            h('div', { className: 'hs-cfg-savebar-inner' }, [
              h('div', { className: `hs-cfg-dirty ${dirty === 0 ? 'clean' : ''}` }, [
                h('span', { className: 'hs-cfg-dot' }),
                dirty === 0 ? '没有未保存的改动' : `${dirty} 项未保存`
              ]),
              h('div', { className: 'hs-cfg-spacer' }),
              h('button', {
                className: 'hs-btn',
                disabled: dirty === 0,
                onClick: () => {
                  syncConfigForm(state);
                  showToast('已重置表单为当前配置');
                }
              }, '重置更改'),
              h('button', {
                className: 'hs-btn primary',
                disabled: savingConfig,
                onClick: handleSaveConfig
              }, savingConfig ? '正在保存...' : '保存设置')
            ])
          ]);
        })(),

        // ── 生成草稿 Modal：定标题与目录名（目录名是永久 URL，必须先看一眼） ──
        scaffoldModalItem && h('div', { className: 'hs-modal-mask', key: 'scaffold-modal' }, [
          h('div', { className: 'hs-modal' }, [
            h('div', { className: 'hs-modal-header' }, [
              h('h3', { className: 'hs-modal-title' }, '生成草稿'),
              h('button', {
                className: 'hs-btn ghost',
                style: { padding: '4px 8px' },
                disabled: scaffolding,
                onClick: () => setScaffoldModalItem(null)
              }, '✕')
            ]),
            h('div', { className: 'hs-modal-body' }, [
              h('div', { style: { marginBottom: 12, fontSize: 13, color: 'var(--dsw-alias-label-secondary, #9da1b0)' } }, [
                '目标候选：',
                h('strong', { style: { color: 'var(--dsw-alias-label-primary, #ffffff)' } }, scaffoldModalItem.title)
              ]),
              h('div', { className: 'hs-form-item' }, [
                h('label', { className: 'hs-form-label' }, '文章标题（写入 frontmatter）'),
                h('input', {
                  className: 'hs-input',
                  placeholder: '中文标题这里改，否则会沿用英文 RSS 标题',
                  value: scaffoldTitle,
                  onChange: (e) => setScaffoldTitle(e.target.value),
                  autoFocus: true
                }),
                // AI 起标题：弹窗一打开就请求。拿不到就安静回退原文标题，只留一行灰字。
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 6px' } }, [
                  h('span', {
                    style: { fontSize: 11, fontWeight: 600, color: 'var(--dsw-alias-brand-primary, #4db6a0)' }
                  }, titleSuggestState === 'loading' ? 'AI 正在起标题…' : 'AI 起标题'),
                  titleSuggestState === 'done' && h('button', {
                    className: 'hs-btn ghost',
                    type: 'button',
                    style: { marginLeft: 'auto', padding: '2px 6px', fontSize: 11, color: 'var(--dsw-alias-label-secondary, #9da1b0)' },
                    onClick: () => suggestTitles(scaffoldModalItem)
                  }, '↻ 换一批')
                ]),
                titleSuggestions.length > 0
                  ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } }, titleSuggestions.map((suggestion) => {
                      const active = scaffoldTitle.trim() === suggestion.title;
                      return h('button', {
                        key: `title-${suggestion.slug || suggestion.title}`,
                        type: 'button',
                        title: suggestion.slug ? `slug: ${suggestion.slug}` : '这条建议没给出 slug，目录名仍按标题推算',
                        onClick: () => pickTitleSuggestion(suggestion),
                        style: {
                          textAlign: 'left', fontSize: 12, padding: '5px 10px', borderRadius: 999, cursor: 'pointer',
                          border: active ? '1px solid rgba(77,182,160,.55)' : '1px solid var(--dsw-alias-border-l1, #2d303b)',
                          background: active ? 'rgba(77,182,160,.12)' : 'var(--dsw-alias-bg-layer-2, #1f212a)',
                          color: active ? '#8fe3d0' : 'var(--dsw-alias-label-secondary, #9da1b0)'
                        }
                      }, [
                        h('div', null, suggestion.title),
                        suggestion.slug && h('div', {
                          style: { fontSize: 10, marginTop: 1, color: active ? '#6fc3b1' : '#6f7484' }
                        }, suggestion.slug)
                      ]);
                    }))
                  : titleSuggestState === 'loading'
                    ? h('div', { style: { fontSize: 11, color: '#6f7484' } }, '正在按候选素材拟 3 个中文标题…')
                    : titleSuggestState === 'failed'
                      ? h('div', { style: { fontSize: 11, color: '#8c909e' } }, 'AI 起标题没成功，标题仍用原文，可手动改')
                      : null
              ]),
              // 简介：按定稿标题写，可编辑；失败就保留候选摘要，不阻断建草稿
              h('div', { className: 'hs-form-item' }, [
                h('label', { className: 'hs-form-label' }, '简介（写入 frontmatter）'),
                h('textarea', {
                  className: 'hs-input',
                  rows: 3,
                  style: { resize: 'vertical', lineHeight: 1.55 },
                  placeholder: '按标题生成，也可以自己改',
                  value: scaffoldDescription,
                  onChange: (e) => setScaffoldDescription(e.target.value)
                }),
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 } }, [
                  h('span', {
                    style: {
                      fontSize: 11,
                      color: descriptionChars > 120 ? '#f87171' : '#6f7484'
                    }
                  }, descriptionState === 'loading'
                    ? '正在按标题写简介…'
                    : `${descriptionChars} 字${descriptionState === 'done' ? ' · 按标题生成' : ''}`),
                  h('button', {
                    className: 'hs-btn ghost',
                    type: 'button',
                    style: { marginLeft: 'auto', padding: '2px 6px', fontSize: 11, color: 'var(--dsw-alias-label-secondary, #9da1b0)' },
                    disabled: descriptionState === 'loading',
                    onClick: () => suggestDescription(scaffoldTitle)
                  }, descriptionState === 'failed' ? '↻ 重试' : '↻ 重新生成'),
                  descriptionChars > 120 && h('span', {
                    style: { fontSize: 11, color: '#f87171' }
                  }, '超过 120 字会被校验拦下')
                ]),
                descriptionState === 'failed' && h('div', {
                  style: { fontSize: 11, color: '#8c909e', marginTop: 4 }
                }, 'AI 写简介没成功，先用候选摘要，可手动改')
              ]),
              h('div', { className: 'hs-form-item' }, [
                h('label', { className: 'hs-form-label' }, '目录名 slug（永久 URL，只能小写字母/数字/连字符）'),
                h('div', { style: { display: 'flex', gap: 8 } }, [
                  h('input', {
                    className: 'hs-input',
                    style: { flex: 1 },
                    placeholder: '例如 apple-new-chip',
                    value: scaffoldSlug,
                    onChange: (e) => setScaffoldSlug(e.target.value)
                  }),
                  h('button', {
                    className: 'hs-btn',
                    type: 'button',
                    title: '按标题重新推导目录名',
                    onClick: () => setScaffoldSlug(suggestSlug({ ...scaffoldModalItem, title: scaffoldTitle }))
                  }, '↻ 按标题推算')
                ]),
                scaffoldSlug && !/^[a-z0-9-]+$/.test(scaffoldSlug.trim()) && h('div', {
                  style: { fontSize: 11, color: '#f87171', marginTop: 4 }
                }, '只能用小写字母、数字和连字符')
              ]),
              !isBlogConfigured && h('div', null, [
                h('div', { className: 'hs-alert', style: { margin: '4px 0 12px' } }, [
                  h('div', { className: 'hs-alert-top' }, '需要博客仓库路径'),
                  h('div', { className: 'hs-alert-desc' },
                    '当前尚未绑定博客项目根目录。填一次即可，之后会自动持久化。'
                  )
                ]),
                h('div', { className: 'hs-form-item' }, [
                  h('label', { className: 'hs-form-label' }, '博客项目根目录（绝对路径 · 必填）'),
                  h('div', { style: { display: 'flex', gap: 8 } }, [
                    h('input', {
                      className: 'hs-input',
                      style: { flex: 1 },
                      placeholder: '如 /Users/username/Code/my-blog',
                      value: scaffoldProjectRoot,
                      onChange: (e) => setScaffoldProjectRoot(e.target.value)
                    }),
                    h('button', {
                      className: 'hs-btn',
                      type: 'button',
                      disabled: pickingDir,
                      title: '调起系统原生文件夹选择器',
                      onClick: async () => {
                        const dir = await handlePickDirectory();
                        if (dir) setScaffoldProjectRoot(dir);
                      }
                    }, [h('span', { style: { marginRight: 4 } }, '📁'), pickingDir ? '选择中...' : '选择文件夹'])
                  ])
                ])
              ]),
              h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary, #8c909e)', marginTop: 4 } },
                '确认后建草稿，随即在这个位置展开六步进度：定位候选 → 收素材 → 选模型 → 生成正文 → 写盘与校验。关掉弹窗不影响后台，随时可取消。')
            ]),
            h('div', { className: 'hs-modal-footer' }, [
              h('button', {
                className: 'hs-btn',
                onClick: () => setScaffoldModalItem(null),
                disabled: scaffolding
              }, '取消'),
              h('button', {
                className: 'hs-btn primary',
                disabled: scaffolding,
                onClick: () => {
                  const slug = scaffoldSlug.trim();
                  if (!/^[a-z0-9-]+$/.test(slug)) {
                    showToast('目录名只能用小写字母、数字和连字符', true);
                    return;
                  }
                  if (!scaffoldTitle.trim()) {
                    showToast('请填写文章标题', true);
                    return;
                  }
                  if (!isBlogConfigured && !scaffoldProjectRoot.trim()) {
                    showToast('请填写博客项目根目录路径', true);
                    return;
                  }
                  executeScaffold(scaffoldModalItem, {
                    slug,
                    title: scaffoldTitle.trim(),
                    description: scaffoldDescription.trim(),
                    projectRoot: isBlogConfigured ? '' : scaffoldProjectRoot.trim()
                  });
                }
              }, scaffolding ? '正在生成草稿...' : '确认并生成草稿')
            ])
          ])
        ]),

        // ── 进度弹窗：生成草稿后的六步链路（可关掉，后台照跑） ──
        renderProgressModal(),

        // ── 博客正文查看：套博客排版的只读预览 ──
        blogPreview && h('div', { className: 'hs-modal-mask', key: 'blog-preview-modal', style: { zIndex: 1150 } }, [
          h('div', { className: 'hs-bp-modal' }, [
            h('div', { className: 'hs-bp-header' }, [
              h('div', { style: { minWidth: 0 } }, [
                h('div', { className: 'hs-bp-header-title' }, '博客正文查看'),
                h('div', { className: 'hs-bp-header-sub' },
                  `${blogPreview.item?.slug || ''} · 只读预览，排版近似站点，最终以构建结果为准`)
              ]),
              h('button', {
                className: 'hs-btn ghost',
                style: { padding: '4px 8px' },
                onClick: () => setBlogPreview(null)
              }, '✕')
            ]),
            h('div', { className: 'hs-bp-scroll' }, [
              h('article', { className: 'hs-bp' }, [
                h('h1', { className: 'hs-bp-title' }, blogPreview.item?.title || blogPreview.item?.slug || '未命名'),
                h('div', { className: 'hs-bp-meta' }, [
                  blogPreview.item?.date && h('span', null, blogPreview.item.date),
                  ...(Array.isArray(blogPreview.item?.tags) ? blogPreview.item.tags : [])
                    .slice(0, 8)
                    .map((tag) => h('span', { key: `bp-tag-${tag}`, className: 'hs-bp-tag' }, `#${tag}`)),
                  blogPreview.item?.bodyChars ? h('span', null, `${blogPreview.item.bodyChars} 字`) : null
                ]),
                blogPreview.loading && h('div', { className: 'hs-bp-empty' }, '正在读取正文…'),
                blogPreview.error && h('div', { className: 'hs-bp-empty', style: { color: '#f87171' } }, blogPreview.error),
                !blogPreview.loading && !blogPreview.error && (() => {
                  const body = String(blogPreview.content || '');
                  const hasBody = body.split('\n').slice(1).join('\n').trim().length > 0;
                  if (!hasBody) {
                    return h('div', { className: 'hs-bp-empty' }, '正文还是空的（只有标题与来源引用），先在编辑器里写或点「AI 写正文」');
                  }
                  return renderMarkdownAst(body, { frontmatter: false });
                })()
              ])
            ])
          ])
        ]),

        // ── 在线文章与草稿编辑器 / 预览全屏模态框 ──
        editModalItem && h('div', { className: 'hs-modal-mask', key: 'edit-modal', style: { zIndex: 1050 } }, [
          h('div', { className: 'hs-editor-modal' }, [
            // 头部 Header
            h('div', { className: 'hs-editor-header' }, [
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 } }, [
                h('span', {
                  className: 'hs-tag-pill',
                  style: {
                    background: editModalItem.isDraft ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                    color: editModalItem.isDraft ? '#fbbf24' : '#34d399',
                    borderColor: editModalItem.isDraft ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'
                  }
                }, editModalItem.isDraft ? '草稿编辑' : '已发布文章'),
                h('span', {
                  style: {
                    fontWeight: 600,
                    fontSize: 14,
                    color: 'var(--dsw-alias-label-primary, #ffffff)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }
                }, editModalItem.title || editModalItem.slug),
                h('span', {
                  className: 'hs-article-file',
                  style: {
                    fontSize: 11,
                    maxWidth: 340,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  },
                  title: '点击复制文件路径',
                  onClick: () => copyPath(editModalItem.file)
                }, editModalItem.file)
              ]),

              // 中间模式切换 Tabs
              h('div', { className: 'hs-editor-tabs' }, [
                h('button', {
                  className: `hs-editor-tab-btn ${editViewMode === 'split' ? 'active' : ''}`,
                  onClick: () => setEditViewMode('split')
                }, '双栏并排'),
                h('button', {
                  className: `hs-editor-tab-btn ${editViewMode === 'edit' ? 'active' : ''}`,
                  onClick: () => setEditViewMode('edit')
                }, '纯编辑'),
                h('button', {
                  className: `hs-editor-tab-btn ${editViewMode === 'preview' ? 'active' : ''}`,
                  onClick: () => setEditViewMode('preview')
                }, '纯预览')
              ]),

              // 右侧操作
              h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } }, [
                editModalItem.isDraft && h('button', {
                  className: 'hs-btn sm',
                  title: draftBodyEmpty
                    ? '正文还是空的，先补全正文再来润色'
                    : '按你的要求把正文再润色一遍：只改表达，数字与链接原样保留',
                  disabled: isWritingBody || isPolishingBody || isPromotingArticle || isSavingArticle || isDeletingArticle,
                  onClick: () => setShowPolishPanel((v) => !v)
                }, showPolishPanel ? '✕ 收起润色' : '✨ 正文润色'),
                editModalItem.isDraft && h('button', {
                  className: 'hs-btn sm primary',
                  disabled: isWritingBody || isPolishingBody || isPromotingArticle || isSavingArticle || isDeletingArticle,
                  onClick: () => handlePromoteArticle(editModalItem.slug)
                }, isPromotingArticle ? '转正中...' : '🚀 转正发布'),
                h('button', {
                  className: 'hs-btn sm',
                  style: { color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.3)' },
                  disabled: isDeletingArticle || isSavingArticle,
                  onClick: () => handleDeleteArticle(editModalItem)
                }, isDeletingArticle ? '删除中...' : '🗑️ 删除'),
                h('button', {
                  className: 'hs-btn sm primary',
                  disabled: isSavingArticle || editContent === editOriginalContent || isDeletingArticle,
                  onClick: handleSaveArticle
                }, isSavingArticle ? '保存中...' : (editContent !== editOriginalContent ? '💾 保存修改 *' : '✓ 已保存')),
                h('button', {
                  className: 'hs-btn sm',
                  onClick: () => {
                    if (editContent !== editOriginalContent) {
                      if (!confirm('您有未保存的修改，确定要关闭吗？')) return;
                    }
                    setEditModalItem(null);
                  }
                }, '✕ 关闭')
              ])
            ]),

            // 润色面板：填要求 → 润色；写完还能接着改要求再润一次
            editModalItem.isDraft && (showPolishPanel || isPolishingBody) && h('div', {
              className: 'hs-polish',
              key: 'polish-panel'
            }, [
              h('div', { className: 'hs-polish-head' }, [
                h('span', { className: 'hs-polish-title' }, '✨ 正文润色'),
                h('span', { className: 'hs-polish-sub' }, '只改表达：数字、版本号、日期、链接、引用原话都原样保留')
              ]),
              draftBodyEmpty
                ? h('div', { className: 'hs-polish-empty' }, [
                    h('span', null, isWritingBody ? '正文还没写，正在生成中…' : '正文还是空的，没有东西可润色。'),
                    !isWritingBody && h('button', {
                      className: 'hs-btn sm primary',
                      onClick: handleWriteBody
                    }, '✨ 先生成正文')
                  ])
                : h('div', null, [
                    h('textarea', {
                      className: 'hs-polish-input',
                      rows: 3,
                      placeholder: '这次想怎么改？例如「更口语，去掉赋能/抓手这类词」「压到 800 字以内」「讲清楚和上一版的差别」…留空就按默认的整体润色（去 AI 味、句子有起伏）',
                      value: polishInstruction,
                      disabled: isPolishingBody,
                      onInput: (e) => setPolishInstruction(e.target.value)
                    }),
                    h('div', { className: 'hs-polish-presets' }, [
                      h('span', { className: 'hs-polish-presets-label' }, '常用：'),
                      ...POLISH_PRESETS.map((preset) => h('button', {
                        key: preset.label,
                        className: 'hs-polish-chip',
                        type: 'button',
                        disabled: isPolishingBody,
                        onClick: () => setPolishInstruction((prev) => {
                          const cur = String(prev || '').trim();
                          return cur ? `${cur}；${preset.text}` : preset.text;
                        })
                      }, preset.label))
                    ]),
                    h('div', { className: 'hs-polish-actions' }, [
                      h('span', { className: 'hs-polish-hint' },
                        isPolishingBody
                          ? '正在润色，最长 3 分钟；生成完会自动读回正文'
                          : (polishInstruction.trim() ? '按上面这段要求改，改完直接写盘' : '不填也行：默认去 AI 味、整体通顺')),
                      h('button', {
                        className: 'hs-btn sm',
                        disabled: isPolishingBody,
                        onClick: () => setShowPolishPanel(false)
                      }, '收起'),
                      h('button', {
                        className: 'hs-btn sm primary',
                        disabled: isPolishingBody || isSavingArticle,
                        onClick: handlePolishBody
                      }, isPolishingBody ? '✍️ 润色中...' : '✨ 开始润色')
                    ])
                  ])
            ]),

            // 生成正文进行中：一次 completion 最长要跑 8 分钟，明确告诉用户别关面板
            isWritingBody && h('div', { className: 'hs-body-writing' }, [
              h('span', { className: 'hs-body-writing-spinner' }),
              h('span', null, '正在生成正文：联网补料 → 写正文 → 登记证据'),
              h('span', { className: 'hs-body-writing-sub' }, '通常 1–3 分钟，最长 8 分钟，请保持面板打开'),
            ]),

            // 证据账本：写正文时联网补料登记过什么，转正后仍能追溯
            editSupplements && editSupplements.count > 0 && h('div', { className: 'hs-evidence' }, [
              h('button', {
                className: 'hs-evidence-toggle',
                onClick: () => setShowEvidence((v) => !v)
              }, [
                h('span', null, `📎 证据 ${editSupplements.count} 条`),
                h('span', { className: 'hs-evidence-hosts' },
                  [...new Set(editSupplements.entries.map((e) => e.host))].join(' · ')),
                h('span', { className: 'hs-evidence-caret' }, showEvidence ? '收起' : '展开')
              ]),
              showEvidence && h('div', { className: 'hs-evidence-list' },
                editSupplements.entries.map((entry, i) => h('div', {
                  key: `${entry.url}-${i}`,
                  className: 'hs-evidence-item'
                }, [
                  h('a', {
                    className: 'hs-evidence-link',
                    href: entry.url,
                    target: '_blank',
                    rel: 'noreferrer'
                  }, entry.title || entry.host),
                  h('span', { className: 'hs-evidence-meta' },
                    `${entry.kind || 'other'} · ${entry.chars} 字 · ${(entry.fetchedAt || '').slice(0, 10)}`),
                  entry.preview && h('div', { className: 'hs-evidence-preview' }, entry.preview)
                ]))
              )
            ]),

            // 主体 Body
            h('div', { className: 'hs-editor-body' }, [
              // 左侧/纯编辑区
              (editViewMode === 'split' || editViewMode === 'edit') && h('textarea', {
                className: 'hs-editor-textarea',
                value: editContent,
                placeholder: '在此输入 Markdown 内容...',
                onChange: (e) => setEditContent(e.target.value),
                onKeyDown: (e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                    e.preventDefault();
                    handleSaveArticle();
                  }
                }
              }),

              // 右侧/纯预览区
              (editViewMode === 'split' || editViewMode === 'preview') && h('div', {
                className: 'hs-preview-pane'
              }, [
                renderMarkdownAst(editContent),
                // 正文为空时给一个就地入口，不用先去头部找按钮
                editModalItem.isDraft && draftBodyEmpty && h('div', { className: 'hs-body-empty' }, [
                  h('div', { className: 'hs-body-empty-title' }, [
                    h('span', null, '✍️'),
                    h('span', null, '这篇草稿还没有正文')
                  ]),
                  h('div', { className: 'hs-body-empty-desc' },
                    'scaffold 只写了标题、摘要和来源，正文是空的，所以还不能润色。点下面的按钮，会用候选素材与已登记补料把正文写完；写完就可以用头部的「✨ 正文润色」按你的要求反复润。'),
                  h('div', { className: 'hs-body-empty-actions' }, [
                    h('button', {
                      className: 'hs-btn primary',
                      disabled: isWritingBody,
                      onClick: handleWriteBody
                    }, isWritingBody ? '✍️ 正在生成正文...' : '✨ 生成正文'),
                    h('span', { className: 'hs-body-empty-hint' },
                      isWritingBody
                        ? '最长 8 分钟，请勿关闭面板'
                        : '通常 1–3 分钟 · 使用设置里已保存的写作模式')
                  ])
                ])
              ])
            ])
          ])
        ]),

        // ── 浮动 Toast 通知 ──
        toast && h('div', {
          className: `hs-toast ${toast.isError ? 'err' : ''}`,
          key: 'toast'
        }, [
          h('span', null, toast.isError ? '⚠️' : '✓'),
          toast.message
        ])
      ]);
    }

    // ── cordis 插件扩展定义 ─────────────────────────────────────────
    const inject = ['slots', 'layout', 'uiWorkspace'];

    function apply(ctx) {
      // 1. 注册左侧栏入口 (sidebar.panellist)
      ctx.slots.inject('sidebar.panellist', () => {
        return ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 10,
          label: () => '热点草稿'
        }, HotspotSidebarIcon);
      });

      // 2. 注册主视图 (main keyed slot)
      ctx.slots.inject('main', () => {
        return ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          inject: () => ({
            backToConversation: () => {
              const layout = ctx.get('layout');
              if (layout && typeof layout.selectPanel === 'function') {
                layout.selectPanel(null);
              }
            },
            pickDirectory: async () => {
              const uiWs = ctx.get('uiWorkspace');
              if (uiWs && typeof uiWs.pickDirectory === 'function') {
                try {
                  return await uiWs.pickDirectory();
                } catch (e) {
                  console.warn('[dsh-hotspot] uiWorkspace.pickDirectory error', e);
                }
              }
              return null;
            }
          })
        }, HotspotMainPanel);
      });
    }

    return {
      apply,
      inject
    };
  }
});
