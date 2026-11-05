window.__ModuleLoader__.load({
  id: 'dsh-hotspot',
  factory: (require) => {
    const React = require('react');
    const h = React.createElement;
    const useState = React.useState;
    const useEffect = React.useEffect;
    const useCallback = React.useCallback;

    const PANEL_ID = 'dsh-hotspot';
    const API_BASE = '/dsh-hotspot/api';

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
        gap: 16px;
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
      }
      .hs-back-btn {
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

      /* ── 精选推荐 Hero Banner ── */
      .hs-hero-banner {
        background: linear-gradient(135deg, rgba(77, 182, 160, 0.12) 0%, rgba(30, 41, 59, 0.6) 100%);
        border: 1px solid rgba(77, 182, 160, 0.3);
        border-radius: 12px;
        padding: 16px 20px;
        margin-bottom: 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
      }
      .hs-hero-left {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .hs-hero-icon {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        background: rgba(77, 182, 160, 0.2);
        color: var(--dsw-alias-brand-primary, #4db6a0);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .hs-hero-title {
        font-size: 14px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .hs-hero-desc {
        font-size: 12px;
        color: var(--dsw-alias-label-secondary, #9da1b0);
        margin-top: 2px;
      }

      /* ── 候选项目卡片 (Candidate Item) ── */
      .hs-candidate-card {
        background: var(--dsw-alias-bg-layer-1, #181920);
        border: 1px solid var(--dsw-alias-border-l1, #282a34);
        border-radius: 10px;
        padding: 16px;
        margin-bottom: 12px;
        transition: transform 160ms var(--hs-ease-out), border-color 160ms var(--hs-ease-out), box-shadow 160ms var(--hs-ease-out);
        display: flex;
        gap: 16px;
        align-items: flex-start;
      }
      .hs-candidate-card:hover {
        border-color: rgba(77, 182, 160, 0.35);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
      }
      .hs-score-box {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-width: 58px;
        padding: 8px 6px;
        background: rgba(77, 182, 160, 0.08);
        border: 1px solid rgba(77, 182, 160, 0.22);
        border-radius: 8px;
        flex-shrink: 0;
      }
      .hs-score-value {
        font-size: 17px;
        font-weight: 700;
        color: var(--dsw-alias-brand-primary, #4db6a0);
        font-variant-numeric: tabular-nums;
        line-height: 1.1;
      }
      .hs-score-label {
        font-size: 10px;
        color: var(--dsw-alias-label-secondary, #8c909e);
        margin-top: 3px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .hs-candidate-body {
        flex: 1;
        min-width: 0;
      }
      .hs-candidate-title-link {
        font-size: 14px;
        font-weight: 600;
        color: var(--dsw-alias-label-primary, #ececf1);
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        line-height: 1.4;
        transition: color 150ms var(--hs-ease-out);
      }
      .hs-candidate-title-link:hover {
        color: var(--dsw-alias-brand-primary, #4db6a0);
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
      .hs-candidate-summary {
        margin-top: 8px;
        font-size: 12px;
        color: var(--dsw-alias-label-secondary, #9da1b0);
        line-height: 1.6;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .hs-candidate-actions {
        display: flex;
        align-items: center;
        flex-shrink: 0;
        margin-left: 8px;
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

      /* ── 统计数值概览小卡片 ── */
      .hs-stat-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin-bottom: 16px;
      }
      .hs-stat-box {
        background: var(--dsw-alias-bg-layer-1, #181920);
        border: 1px solid var(--dsw-alias-border-l1, #282a34);
        border-radius: 10px;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
      }
      .hs-stat-value {
        font-size: 22px;
        font-weight: 700;
        color: var(--dsw-alias-label-primary, #ffffff);
        font-variant-numeric: tabular-nums;
      }
      .hs-stat-title {
        font-size: 12px;
        color: var(--dsw-alias-label-secondary, #8c909e);
        margin-top: 4px;
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

    // ── 主面板视图组件 ───────────────────────────────────────────
    function HotspotMainPanel(props) {
      ensureStyles();

      const [tab, setTab] = useState('candidates');
      const [loading, setLoading] = useState(false);
      const [running, setRunning] = useState(false);
      const [state, setState] = useState(null);
      const [filter, setFilter] = useState('');
      const [filterTag, setFilterTag] = useState('all');
      const [toast, setToast] = useState(null);

      // 新增源表单
      const [newId, setNewId] = useState('');
      const [newKind, setNewKind] = useState('rss');
      const [newTarget, setNewTarget] = useState('');
      const [newPoints, setNewPoints] = useState(100);

      // 博客工程与系统参数配置表单状态
      const [blogProjectRoot, setBlogProjectRoot] = useState('');
      const [blogArticleDir, setBlogArticleDir] = useState('docs');
      const [blogDraftDir, setBlogDraftDir] = useState('docs/draft');
      const [blogDigestDir, setBlogDigestDir] = useState('.hotspot');
      const [rankLimit, setRankLimit] = useState(15);
      const [rankSinceHours, setRankSinceHours] = useState(36);
      const [rankHalfLifeHours, setRankHalfLifeHours] = useState(24);
      const [rankClusterThreshold, setRankClusterThreshold] = useState(0.6);
      const [publishMaxPerDay, setPublishMaxPerDay] = useState(3);
      const [publishAllowedHosts, setPublishAllowedHosts] = useState('');
      const [savingConfig, setSavingConfig] = useState(false);

      // 博客根目录快速绑定与生成草稿必填弹窗状态
      const [quickBlogRoot, setQuickBlogRoot] = useState('');
      const [savingQuickBlog, setSavingQuickBlog] = useState(false);
      const [scaffoldModalItem, setScaffoldModalItem] = useState(null);
      const [scaffoldProjectRoot, setScaffoldProjectRoot] = useState('');
      const [scaffolding, setScaffolding] = useState(false);

      const isBlogConfigured = Boolean(state?.blog?.configured && state?.blog?.projectRoot);

      const syncConfigForm = (val) => {
        if (!val) return;
        const cfg = val.config || {};
        const b = val.blog || {};
        setBlogProjectRoot(cfg.projectRoot || b.projectRoot || '');
        setBlogArticleDir(cfg.articleDir || b.articleDir || 'docs');
        setBlogDraftDir(cfg.draftDir || b.draftDir || 'docs/draft');
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

      const handleScaffold = (item) => {
        if (!isBlogConfigured) {
          setScaffoldModalItem(item);
          setScaffoldProjectRoot(blogProjectRoot || '');
          return;
        }
        executeScaffold(item);
      };

      const executeScaffold = async (item, customRoot) => {
        try {
          setScaffolding(true);
          const payload = { id: item.id };
          if (customRoot) payload.projectRoot = customRoot.trim();

          const res = await fetch(`${API_BASE}/scaffold`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          if (data.ok) {
            showToast(`草稿生成成功：${data.value.file || data.value.slug}`);
            setScaffoldModalItem(null);
            await loadState();
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
        const currentSources = state?.config?.sources || [];
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
        const currentSources = state?.config?.sources || [];
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

      const handleDeleteSource = async (id) => {
        const currentSources = (state?.config?.sources || []).filter(s => s.id !== id);
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
            draftDir: blogDraftDir.trim() || 'docs/draft',
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

      // 筛选候选
      const rawItems = state?.digest?.items || [];
      const items = rawItems.filter(item => {
        if (filterTag === 'highScore' && item.score < 100) return false;
        if (filterTag === 'multiSource' && item.sourceCount <= 1) return false;
        if (!filter) return true;
        const q = filter.toLowerCase();
        return (
          item.title?.toLowerCase().includes(q) ||
          item.tags?.some(t => t.toLowerCase().includes(q)) ||
          item.summary?.toLowerCase().includes(q)
        );
      });

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
            h('span', { className: 'hs-tab-count' }, state?.config?.sources?.length || 0)
          ]),
          h('button', {
            className: `hs-tab ${tab === 'articles' ? 'active' : ''}`,
            onClick: () => setTab('articles'),
            key: 'tab-a'
          }, [
            '博文与草稿',
            h('span', { className: 'hs-tab-count' }, (state?.drafts?.length || 0) + (state?.articles?.length || 0))
          ]),
          h('button', {
            className: `hs-tab ${tab === 'config' ? 'active' : ''}`,
            onClick: () => setTab('config'),
            key: 'tab-cfg'
          }, '策略与路径配置')
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
              h('div', { style: { display: 'flex', gap: 10, marginTop: 4 } }, [
                h('input', {
                  className: 'hs-input',
                  style: { flex: 1 },
                  placeholder: '输入博客根目录绝对路径，如 /Users/username/Code/my-blog',
                  value: quickBlogRoot,
                  onChange: (e) => setQuickBlogRoot(e.target.value)
                }),
                h('button', {
                  className: 'hs-btn primary',
                  onClick: handleSaveQuickBlog,
                  disabled: savingQuickBlog
                }, savingQuickBlog ? '绑定中...' : '快速绑定博客根目录')
              ])
            ]),

            // 搜索与快捷过滤条
            h('div', {
              style: {
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                flexWrap: 'wrap',
                marginBottom: 16
              }
            }, [
              h('div', { style: { position: 'relative', flex: '1 1 240px' } }, [
                h('input', {
                  className: 'hs-input',
                  style: { width: '100%', paddingLeft: 34 },
                  placeholder: '搜索标题、标签或摘要关键词...',
                  value: filter,
                  onChange: (e) => setFilter(e.target.value)
                }),
                h('svg', {
                  width: 14,
                  height: 14,
                  viewBox: '0 0 24 24',
                  fill: 'none',
                  stroke: 'currentColor',
                  strokeWidth: 2,
                  style: {
                    position: 'absolute',
                    left: 11,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--dsw-alias-label-secondary, #8c909e)',
                    pointerEvents: 'none'
                  }
                }, [
                  h('circle', { cx: 11, cy: 11, r: 8 }),
                  h('line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 })
                ])
              ]),
              h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } }, [
                h('button', {
                  className: `hs-btn ${filterTag === 'all' ? 'primary' : 'ghost'}`,
                  style: { padding: '5px 10px', fontSize: 12 },
                  onClick: () => setFilterTag('all')
                }, `全部 (${rawItems.length})`),
                h('button', {
                  className: `hs-btn ${filterTag === 'highScore' ? 'primary' : 'ghost'}`,
                  style: { padding: '5px 10px', fontSize: 12 },
                  onClick: () => setFilterTag('highScore')
                }, '🔥 高分精选 (≥100)'),
                h('button', {
                  className: `hs-btn ${filterTag === 'multiSource' ? 'primary' : 'ghost'}`,
                  style: { padding: '5px 10px', fontSize: 12 },
                  onClick: () => setFilterTag('multiSource')
                }, '🌐 多源共现 (>1)')
              ])
            ]),

            // 候选列表
            items.length === 0
              ? h('div', {
                  className: 'hs-card',
                  style: { textAlign: 'center', padding: '40px 20px', color: 'var(--dsw-alias-label-secondary, #8c909e)' }
                }, [
                  h('div', { style: { fontSize: 32, marginBottom: 8 } }, '📡'),
                  h('div', { style: { fontSize: 14, fontWeight: 500 } },
                    state?.digest ? '没有符合当前筛选条件的候选热点' : '暂无聚合候选热点'
                  ),
                  h('div', { style: { fontSize: 12, marginTop: 4 } },
                    '点击右上角「立即扫描抓取」获取最新全网技术热点'
                  )
                ])
              : items.map((item, idx) => {
                  const isHighRank = item.score >= 100;
                  return h('div', { className: 'hs-candidate-card', key: item.id || idx }, [
                    // 得分与序号指示盒
                    h('div', { className: 'hs-score-box' }, [
                      h('div', { className: 'hs-score-value' }, item.score),
                      h('div', { className: 'hs-score-label' }, `RANK #${idx + 1}`)
                    ]),
                    // 主体信息
                    h('div', { className: 'hs-candidate-body' }, [
                      h('a', {
                        className: 'hs-candidate-title-link',
                        href: item.url,
                        target: '_blank',
                        rel: 'noreferrer'
                      }, [
                        item.title,
                        h('svg', {
                          width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, style: { opacity: 0.7, flexShrink: 0 }
                        }, [
                          h('path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }),
                          h('polyline', { points: '15 3 21 3 21 9' }),
                          h('line', { x1: 10, y1: 14, x2: 21, y2: 3 })
                        ])
                      ]),
                      h('div', { className: 'hs-candidate-meta' }, [
                        h('span', { style: { color: isHighRank ? 'var(--dsw-alias-brand-primary, #4db6a0)' : 'inherit', fontWeight: 500 } },
                          `共现源：${item.sourceCount} 个`
                        ),
                        item.slugHint && h('span', { className: 'hs-tag-pill' }, `slug: ${item.slugHint}`),
                        (item.tags || []).map(t => {
                          const isAI = /ai|gpt|llm|agent|model/i.test(t);
                          const isCode = /swift|rust|go|python|js|ts/i.test(t);
                          const cls = isAI ? 'hs-tag-pill ai' : isCode ? 'hs-tag-pill code' : 'hs-tag-pill';
                          return h('span', { className: cls, key: t }, `#${t}`);
                        })
                      ]),
                      item.summary && h('div', { className: 'hs-candidate-summary' }, item.summary),
                      // 来源详情
                      item.sources && item.sources.length > 0 && h('details', { className: 'hs-details' }, [
                        h('summary', null, [
                          h('svg', { width: 11, height: 11, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, [
                            h('polyline', { points: '6 9 12 15 18 9' })
                          ]),
                          `查看 ${item.sources.length} 个原文来源与佐证`
                        ]),
                        h('div', { className: 'hs-details-panel' }, [
                          item.sources.map((s, sIdx) => h('div', { key: sIdx, style: { marginBottom: 6, fontSize: 12 } }, [
                            h('span', {
                              className: 'hs-tag-pill',
                              style: { marginRight: 6, fontSize: 10 }
                            }, s.sourceId || 'source'),
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
                    // 操作按钮
                    h('div', { className: 'hs-candidate-actions' }, [
                      h('button', {
                        className: `hs-btn ${!isBlogConfigured ? 'primary' : ''}`,
                        onClick: () => handleScaffold(item)
                      }, [
                        h('svg', { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, [
                          h('path', { d: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' }),
                          h('path', { d: 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' })
                        ]),
                        !isBlogConfigured ? '指定路径生成草稿' : '生成草稿'
                      ])
                    ])
                  ]);
                })
          ]),

          // ── TAB: 订阅源管理 ──
          tab === 'sources' && h('div', { key: 'sources-panel' }, [
            // 官方精选推荐源 Hero Banner
            h('div', { className: 'hs-hero-banner' }, [
              h('div', { className: 'hs-hero-left' }, [
                h('div', { className: 'hs-hero-icon' }, [
                  h('svg', { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2 }, [
                    h('path', { d: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z' })
                  ])
                ]),
                h('div', null, [
                  h('div', { className: 'hs-hero-title' }, [
                    '官方内置推荐源：SoPilot AI 爆款推文',
                    h('span', { className: 'hs-tag-pill ai', style: { fontSize: 10 } }, 'RSS 专线')
                  ]),
                  h('div', { className: 'hs-hero-desc' },
                    '自动聚合跟踪 Twitter / X 今日海外高赞、高转发的前沿 AI 讨论与技术爆款贴。'
                  ),
                  h('div', { style: { fontSize: 11, fontFamily: 'monospace', color: 'var(--dsw-alias-brand-primary, #4db6a0)', marginTop: 4 } },
                    'https://sopilot.net/rss/hottweets'
                  )
                ])
              ]),
              h('div', null, [
                (state?.config?.sources || []).some(
                  (s) => s.url === 'https://sopilot.net/rss/hottweets' || s.id === 'sopilot-hottweets'
                )
                  ? h('span', {
                      className: 'hs-tag-pill',
                      style: { background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', borderColor: 'rgba(16, 185, 129, 0.3)', padding: '5px 12px' }
                    }, '✓ 活跃订阅中')
                  : h('button', {
                      className: 'hs-btn primary',
                      onClick: () => handleAddPresetSource({
                        id: 'sopilot-hottweets',
                        name: 'SoPilot AI 爆款推文',
                        kind: 'rss',
                        url: 'https://sopilot.net/rss/hottweets'
                      })
                    }, '+ 一键加入订阅列表')
              ])
            ]),

            // 新增源表单 Card
            h('div', { className: 'hs-card' }, [
              h('div', { className: 'hs-card-header' }, [
                h('div', null, [
                  h('div', { className: 'hs-card-title' }, '添加新的采集订阅源'),
                  h('div', { className: 'hs-card-subtitle' }, '支持 RSS/Atom 播客、GitHub Release 版本更新与 Hacker News 热门榜单')
                ])
              ]),
              h('div', { className: 'hs-form-grid', style: { marginBottom: 14 } }, [
                h('div', { className: 'hs-form-item' }, [
                  h('label', { className: 'hs-form-label' }, '源标识 ID'),
                  h('input', {
                    className: 'hs-input',
                    placeholder: '如 swift-org 或 vercel-blog',
                    value: newId,
                    onChange: (e) => setNewId(e.target.value)
                  })
                ]),
                h('div', { className: 'hs-form-item' }, [
                  h('label', { className: 'hs-form-label' }, '数据源类型'),
                  h('select', {
                    className: 'hs-select',
                    value: newKind,
                    onChange: (e) => setNewKind(e.target.value)
                  }, [
                    h('option', { value: 'rss' }, 'RSS / Atom Feed'),
                    h('option', { value: 'github-release' }, 'GitHub Release 仓库'),
                    h('option', { value: 'hn' }, 'Hacker News 榜单')
                  ])
                ]),
                h('div', { className: 'hs-form-item', style: { gridColumn: newKind === 'hn' ? 'span 1' : 'span 2' } }, [
                  h('label', { className: 'hs-form-label' }, newKind === 'github-release' ? 'GitHub 仓库 (owner/repo)' : 'Feed URL 地址'),
                  h('input', {
                    className: 'hs-input',
                    placeholder: newKind === 'github-release' ? '例如 apple/swift 或 facebook/react' : 'https://...',
                    value: newTarget,
                    onChange: (e) => setNewTarget(e.target.value)
                  })
                ]),
                newKind === 'hn' && h('div', { className: 'hs-form-item' }, [
                  h('label', { className: 'hs-form-label' }, '最低热度分数 (minPoints)'),
                  h('input', {
                    className: 'hs-input',
                    type: 'number',
                    placeholder: '100',
                    value: newPoints,
                    onChange: (e) => setNewPoints(e.target.value)
                  })
                ])
              ]),
              h('button', {
                className: 'hs-btn primary',
                onClick: handleAddSource
              }, '+ 确认添加此订阅源')
            ]),

            // 现有订阅源列表 Card
            h('div', { className: 'hs-card' }, [
              h('div', { className: 'hs-card-header' }, [
                h('div', { className: 'hs-card-title' }, `活跃订阅源清单 (${state?.config?.sources?.length || 0})`),
                h('div', { className: 'hs-card-subtitle' }, '聚合扫描时将并发采集以下所有数据源')
              ]),
              h('table', { className: 'hs-table' }, [
                h('thead', null, [
                  h('tr', null, [
                    h('th', { style: { width: 140 } }, 'ID 标识'),
                    h('th', { style: { width: 120 } }, '类型'),
                    h('th', null, '抓取目标 / 规则'),
                    h('th', { style: { width: 80, textAlign: 'right' } }, '操作')
                  ])
                ]),
                h('tbody', null, [
                  (state?.config?.sources || []).map(s => {
                    let typeBadgeClass = 'hs-tag-pill';
                    if (s.kind === 'rss') typeBadgeClass = 'hs-tag-pill ai';
                    if (s.kind === 'github-release') typeBadgeClass = 'hs-tag-pill code';
                    return h('tr', { key: s.id }, [
                      h('td', { style: { fontWeight: 600 } }, s.id),
                      h('td', null, h('span', { className: typeBadgeClass }, s.kind)),
                      h('td', { style: { color: 'var(--dsw-alias-label-secondary, #9da1b0)', fontFamily: 'monospace', fontSize: 12 } },
                        s.url || s.repo || `Hacker News (minPoints: ${s.minPoints})`
                      ),
                      h('td', { style: { textAlign: 'right' } }, h('button', {
                        className: 'hs-btn danger',
                        style: { padding: '3px 8px', fontSize: 11 },
                        onClick: () => handleDeleteSource(s.id)
                      }, '移除'))
                    ]);
                  })
                ])
              ])
            ])
          ]),

          // ── TAB: 博文与草稿 ──
          tab === 'articles' && h('div', { key: 'articles-panel' }, [
            // 概览指标
            h('div', { className: 'hs-stat-grid' }, [
              h('div', { className: 'hs-stat-box' }, [
                h('div', { className: 'hs-stat-value', style: { color: '#f59e0b' } }, state?.drafts?.length || 0),
                h('div', { className: 'hs-stat-title' }, '待发布草稿')
              ]),
              h('div', { className: 'hs-stat-box' }, [
                h('div', { className: 'hs-stat-value', style: { color: 'var(--dsw-alias-brand-primary, #4db6a0)' } }, state?.articles?.length || 0),
                h('div', { className: 'hs-stat-title' }, '已发布博文')
              ]),
              h('div', { className: 'hs-stat-box' }, [
                h('div', { className: 'hs-stat-value', style: { color: '#38bdf8' } }, state?.profile?.tags?.length || 0),
                h('div', { className: 'hs-stat-title' }, '博客体系标签')
              ])
            ]),

            // 草稿列表
            h('div', { className: 'hs-card' }, [
              h('div', { className: 'hs-card-header' }, [
                h('div', { className: 'hs-card-title' }, `待完善的草稿文件 (${state?.drafts?.length || 0})`),
                h('div', { className: 'hs-card-subtitle' }, '通过 hotspot_scaffold 落地，默认自带 sitemap:false')
              ]),
              (state?.drafts || []).length === 0
                ? h('div', { style: { padding: '24px 0', textAlign: 'center', color: 'var(--dsw-alias-label-secondary, #8c909e)' } },
                    '暂无未发布的草稿文件，可在候选列表中点击「生成草稿」'
                  )
                : (state?.drafts || []).map(d => h('div', {
                    key: d.slug,
                    style: {
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 0',
                      borderBottom: '1px solid var(--dsw-alias-border-l1, #282a34)'
                    }
                  }, [
                    h('div', null, [
                      h('div', { style: { fontWeight: 600 } }, d.title || d.slug),
                      h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary, #8c909e)', fontFamily: 'monospace', marginTop: 2 } },
                        d.path || d.slug
                      )
                    ]),
                    h('span', { className: 'hs-tag-pill' }, 'Draft')
                  ]))
            ]),

            // 已发布博文
            h('div', { className: 'hs-card' }, [
              h('div', { className: 'hs-card-header' }, [
                h('div', { className: 'hs-card-title' }, `已发布博文库 (${state?.articles?.length || 0})`),
                h('div', { className: 'hs-card-subtitle' }, '已存在于 docs 中的有效文章')
              ]),
              h('div', { style: { maxHeight: 380, overflowY: 'auto' } }, [
                (state?.articles || []).length === 0
                  ? h('div', { style: { padding: '20px 0', textAlign: 'center', color: 'var(--dsw-alias-label-secondary, #8c909e)' } }, '未探测到已发布的博文')
                  : (state?.articles || []).map(a => h('div', {
                      key: a.slug,
                      style: {
                        padding: '10px 0',
                        borderBottom: '1px solid var(--dsw-alias-border-l1, #282a34)'
                      }
                    }, [
                      h('div', { style: { fontWeight: 500 } }, a.title || a.slug),
                      h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary, #8c909e)', marginTop: 2 } }, [
                        h('span', { style: { fontFamily: 'monospace', marginRight: 8 } }, `slug: ${a.slug}`),
                        (a.tags || []).length > 0 && h('span', null, `标签: ${a.tags.join(', ')}`)
                      ])
                    ]))
              ])
            ])
          ]),

          // ── TAB: 策略与路径配置 ──
          tab === 'config' && h('div', { key: 'config-panel' }, [
            // 1. 博客仓库路径 Card
            h('div', { className: 'hs-card' }, [
              h('div', { className: 'hs-card-header' }, [
                h('div', null, [
                  h('div', { className: 'hs-card-title' }, '博客仓库与文档目录'),
                  h('div', { className: 'hs-card-subtitle' }, '指定外部博客项目根路径，保存后服务端热生效并自动刷新博客画像')
                ]),
                h('span', {
                  className: 'hs-tag-pill',
                  style: {
                    background: isBlogConfigured ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                    color: isBlogConfigured ? '#34d399' : '#fbbf24',
                    borderColor: isBlogConfigured ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'
                  }
                }, isBlogConfigured ? '● 已连接生效' : '○ 未绑定路径')
              ]),
              h('div', { style: { marginBottom: 14 } }, [
                h('label', { className: 'hs-form-label' }, '博客项目根目录绝对路径 (projectRoot)'),
                h('input', {
                  className: 'hs-input',
                  style: { width: '100%' },
                  placeholder: '/Users/you/Code/my-blog',
                  value: blogProjectRoot,
                  onChange: (e) => setBlogProjectRoot(e.target.value)
                }),
                h('div', { className: 'hs-form-hint' }, `当前生效路径: ${state?.blog?.projectRoot || '未配置'}`)
              ]),
              h('div', { className: 'hs-form-grid' }, [
                h('div', { className: 'hs-form-item' }, [
                  h('label', { className: 'hs-form-label' }, '正式文章目录 (articleDir)'),
                  h('input', {
                    className: 'hs-input',
                    value: blogArticleDir,
                    onChange: (e) => setBlogArticleDir(e.target.value)
                  }),
                  h('div', { className: 'hs-form-hint' }, '已发布文章相对目录（默认 docs）')
                ]),
                h('div', { className: 'hs-form-item' }, [
                  h('label', { className: 'hs-form-label' }, '草稿输出目录 (draftDir)'),
                  h('input', {
                    className: 'hs-input',
                    value: blogDraftDir,
                    onChange: (e) => setBlogDraftDir(e.target.value)
                  }),
                  h('div', { className: 'hs-form-hint' }, '生成草稿输出目录（默认 docs/draft）')
                ]),
                h('div', { className: 'hs-form-item' }, [
                  h('label', { className: 'hs-form-label' }, '数据缓存目录 (digestDir)'),
                  h('input', {
                    className: 'hs-input',
                    value: blogDigestDir,
                    onChange: (e) => setBlogDigestDir(e.target.value)
                  }),
                  h('div', { className: 'hs-form-hint' }, '热点扫描数据落盘目录（默认 .hotspot）')
                ])
              ])
            ]),

            // 2. 打分参数 Card
            h('div', { className: 'hs-card' }, [
              h('div', { className: 'hs-card-header' }, [
                h('div', null, [
                  h('div', { className: 'hs-card-title' }, '热点抓取与打分算法'),
                  h('div', { className: 'hs-card-subtitle' }, '根据跨源共现、新鲜度半衰期和聚类阈值过滤噪点')
                ])
              ]),
              h('div', { className: 'hs-form-grid' }, [
                h('div', { className: 'hs-form-item' }, [
                  h('label', { className: 'hs-form-label' }, '推荐候选上限 (limit)'),
                  h('input', {
                    className: 'hs-input',
                    type: 'number',
                    value: rankLimit,
                    onChange: (e) => setRankLimit(e.target.value)
                  }),
                  h('div', { className: 'hs-form-hint' }, '单日推荐候选数量上限（默认 15）')
                ]),
                h('div', { className: 'hs-form-item' }, [
                  h('label', { className: 'hs-form-label' }, '采集回溯时间窗 (sinceHours)'),
                  h('input', {
                    className: 'hs-input',
                    type: 'number',
                    value: rankSinceHours,
                    onChange: (e) => setRankSinceHours(e.target.value)
                  }),
                  h('div', { className: 'hs-form-hint' }, '只采集过去多少小时内的新闻（默认 36h）')
                ]),
                h('div', { className: 'hs-form-item' }, [
                  h('label', { className: 'hs-form-label' }, '新鲜度半衰期 (halfLifeHours)'),
                  h('input', {
                    className: 'hs-input',
                    type: 'number',
                    value: rankHalfLifeHours,
                    onChange: (e) => setRankHalfLifeHours(e.target.value)
                  }),
                  h('div', { className: 'hs-form-hint' }, '指数衰减半衰期（默认 24h）')
                ]),
                h('div', { className: 'hs-form-item' }, [
                  h('label', { className: 'hs-form-label' }, '并查集去重阈值 (clusterThreshold)'),
                  h('input', {
                    className: 'hs-input',
                    type: 'number',
                    step: '0.05',
                    value: rankClusterThreshold,
                    onChange: (e) => setRankClusterThreshold(e.target.value)
                  }),
                  h('div', { className: 'hs-form-hint' }, '相似度门槛（0.3~0.95，默认 0.6）')
                ])
              ])
            ]),

            // 3. 发布合规与安全
            h('div', { className: 'hs-card' }, [
              h('div', { className: 'hs-card-header' }, [
                h('div', null, [
                  h('div', { className: 'hs-card-title' }, '发布安全与外链合规'),
                  h('div', { className: 'hs-card-subtitle' }, '防止过频发布或夹带未经授权的不可信外部链接')
                ])
              ]),
              h('div', { style: { marginBottom: 14 } }, [
                h('label', { className: 'hs-form-label' }, '每日最大发布篇数 (maxPerDay)'),
                h('input', {
                  className: 'hs-input',
                  type: 'number',
                  style: { width: 140 },
                  value: publishMaxPerDay,
                  onChange: (e) => setPublishMaxPerDay(e.target.value)
                }),
                h('div', { className: 'hs-form-hint' }, '限制每天从草稿推到正式发布的上限')
              ]),
              h('div', { className: 'hs-form-item' }, [
                h('label', { className: 'hs-form-label' }, '允许的外链域名白名单 (allowedHosts)'),
                h('textarea', {
                  className: 'hs-textarea',
                  style: { height: 80, width: '100%' },
                  placeholder: 'github.com\nswift.org\nnews.ycombinator.com\nsopilot.net',
                  value: publishAllowedHosts,
                  onChange: (e) => setPublishAllowedHosts(e.target.value)
                }),
                h('div', { className: 'hs-form-hint' }, '每行一个域名或以逗号分隔，文章发布前自动化检查')
              ])
            ]),

            // 4. 当前博客画像索引 Card
            h('div', { className: 'hs-card' }, [
              h('div', { className: 'hs-card-header' }, [
                h('div', { className: 'hs-card-title' }, '当前博客画像索引'),
                h('div', { className: 'hs-card-subtitle' }, '自动学习已发布博文的专栏与受众偏好')
              ]),
              h('div', { style: { display: 'flex', gap: 20, marginBottom: 12, fontSize: 13 } }, [
                h('span', null, `探测到已发布文章：${state?.profile?.articleCount || 0} 篇`),
                h('span', null, `草稿总数：${state?.drafts?.length || 0} 篇`)
              ]),
              (state?.profile?.tags || []).length > 0 && h('div', { style: { marginBottom: 10 } }, [
                h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary, #8c909e)', marginBottom: 6 } }, '已形成标签体系 (Tags):'),
                h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
                  state.profile.tags.map(t => h('span', { key: t, className: 'hs-tag-pill' }, t))
                )
              ]),
              (state?.profile?.keywords || []).length > 0 && h('div', null, [
                h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary, #8c909e)', marginBottom: 6 } }, '核心关键词 (Keywords):'),
                h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
                  state.profile.keywords.map(k => h('span', { key: k, className: 'hs-tag-pill ai' }, k))
                )
              ])
            ]),

            // 5. 底部操作按钮栏
            h('div', {
              style: {
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                paddingTop: 8,
                paddingBottom: 24
              }
            }, [
              h('button', {
                className: 'hs-btn primary',
                disabled: savingConfig,
                onClick: handleSaveConfig
              }, savingConfig ? '正在保存...' : '保存策略与路径配置'),
              h('button', {
                className: 'hs-btn',
                onClick: () => {
                  syncConfigForm(state);
                  showToast('已重置表单为当前配置');
                }
              }, '重置更改'),
              h('button', {
                className: 'hs-btn',
                onClick: () => {
                  loadState();
                  showToast('已重新探测博客数据');
                }
              }, '重新探测博客数据')
            ])
          ])
        ]),

        // ── 强制提供博客路径生成草稿的 Modal 弹窗 ──
        scaffoldModalItem && h('div', { className: 'hs-modal-mask', key: 'scaffold-modal' }, [
          h('div', { className: 'hs-modal' }, [
            h('div', { className: 'hs-modal-header' }, [
              h('h3', { className: 'hs-modal-title' }, '指定博客项目并生成草稿'),
              h('button', {
                className: 'hs-btn ghost',
                style: { padding: '4px 8px' },
                onClick: () => setScaffoldModalItem(null)
              }, '✕')
            ]),
            h('div', { className: 'hs-modal-body' }, [
              h('div', { style: { marginBottom: 12, fontSize: 13, color: 'var(--dsw-alias-label-secondary, #9da1b0)' } }, [
                '目标候选：',
                h('strong', { style: { color: 'var(--dsw-alias-label-primary, #ffffff)' } }, scaffoldModalItem.title)
              ]),
              h('div', { className: 'hs-alert', style: { marginBottom: 16 } }, [
                h('div', { className: 'hs-alert-top' }, '需要博客仓库路径'),
                h('div', { className: 'hs-alert-desc' },
                  '当前尚未绑定博客项目根目录。请提供目标博客仓库绝对路径（如 VitePress 根目录），系统将立即自动持久化并落地草稿，后续无需重复输入。'
                )
              ]),
              h('div', { className: 'hs-form-item' }, [
                h('label', { className: 'hs-form-label' }, '博客项目根目录（绝对路径 · 必填）'),
                h('input', {
                  className: 'hs-input',
                  style: { width: '100%' },
                  placeholder: '/Users/username/Code/my-blog',
                  value: scaffoldProjectRoot,
                  onChange: (e) => setScaffoldProjectRoot(e.target.value),
                  autoFocus: true
                })
              ])
            ]),
            h('div', { className: 'hs-modal-footer' }, [
              h('button', {
                className: 'hs-btn',
                onClick: () => setScaffoldModalItem(null),
                disabled: scaffolding
              }, '取消'),
              h('button', {
                className: 'hs-btn primary',
                onClick: () => {
                  const root = scaffoldProjectRoot.trim();
                  if (!root) {
                    showToast('请填写博客项目根目录路径', true);
                    return;
                  }
                  executeScaffold(scaffoldModalItem, root);
                },
                disabled: scaffolding
              }, scaffolding ? '正在生成草稿...' : '确认并生成草稿')
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
    const inject = ['slots', 'layout'];

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
