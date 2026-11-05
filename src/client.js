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
      /* ── 候选页顶部概览（今日状态 + RSS 订阅） ── */
      .hs-overview {
        background: var(--dsw-alias-bg-layer-1, #181920);
        border: 1px solid var(--dsw-alias-border-l1, #282a34);
        border-radius: 10px;
        padding: 14px 16px;
        margin-bottom: 14px;
      }
      .hs-overview-top {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .hs-overview-date {
        font-size: 15px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .hs-status-pill {
        font-size: 11px;
        padding: 1px 8px;
        border-radius: 999px;
        border: 1px solid currentColor;
        opacity: 0.9;
      }
      .hs-overview-stats {
        display: flex;
        gap: 22px;
        flex-wrap: wrap;
        margin-top: 10px;
      }
      .hs-mini-stat b {
        display: block;
        font-size: 17px;
        font-weight: 600;
        line-height: 1.2;
        font-variant-numeric: tabular-nums;
      }
      .hs-mini-stat span {
        font-size: 11px;
        color: var(--dsw-alias-label-secondary, #8c909e);
      }
      .hs-rss-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px dashed var(--dsw-alias-border-l1, #2c2f3a);
      }
      .hs-rss-url {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 11.5px;
        color: var(--dsw-alias-brand-primary, #4db6a0);
        background: var(--dsw-alias-bg-layer-2, #21232d);
        border: 1px solid var(--dsw-alias-border-l1, #2c2f3a);
        border-radius: 5px;
        padding: 3px 8px;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .hs-rss-note {
        font-size: 11px;
        line-height: 1.6;
        color: var(--dsw-alias-label-secondary, #8c909e);
        margin-top: 6px;
      }
      .hs-feed-row:hover {
        background: rgba(255, 255, 255, 0.02);
      }
      .hs-feed-summary {
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        overflow: hidden;
        font-size: 11.5px;
        color: var(--dsw-alias-label-secondary, #8c909e);
      }
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
    function parseInlineMarkdown(text) {
      if (!text) return '';
      const parts = [];
      let remaining = String(text);
      let keyIdx = 0;

      while (remaining) {
        const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
        const codeMatch = remaining.match(/`([^`]+)`/);
        const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);

        let firstMatch = null;
        let matchType = null;
        let earliestIndex = remaining.length;

        if (linkMatch && linkMatch.index < earliestIndex) {
          earliestIndex = linkMatch.index;
          firstMatch = linkMatch;
          matchType = 'link';
        }
        if (codeMatch && codeMatch.index < earliestIndex) {
          earliestIndex = codeMatch.index;
          firstMatch = codeMatch;
          matchType = 'code';
        }
        if (boldMatch && boldMatch.index < earliestIndex) {
          earliestIndex = boldMatch.index;
          firstMatch = boldMatch;
          matchType = 'bold';
        }

        if (!firstMatch) {
          parts.push(remaining);
          break;
        }

        if (firstMatch.index > 0) {
          parts.push(remaining.slice(0, firstMatch.index));
        }

        if (matchType === 'link') {
          parts.push(h('a', {
            key: `link-${keyIdx++}`,
            href: firstMatch[2],
            target: '_blank',
            rel: 'noopener noreferrer'
          }, firstMatch[1]));
        } else if (matchType === 'code') {
          parts.push(h('code', { key: `code-${keyIdx++}` }, firstMatch[1]));
        } else if (matchType === 'bold') {
          parts.push(h('strong', { key: `bold-${keyIdx++}` }, firstMatch[1]));
        }

        remaining = remaining.slice(firstMatch.index + firstMatch[0].length);
      }

      return parts;
    }

    function renderMarkdownAst(content) {
      if (!content) return null;
      const lines = String(content).split(/\r?\n/);
      const elements = [];
      let inFrontmatter = false;
      const frontmatterLines = [];
      let inCodeBlock = false;
      const codeBlockLines = [];
      let inList = false;
      let listItems = [];
      let listType = 'ul';

      const flushList = () => {
        if (inList && listItems.length > 0) {
          elements.push(h(listType, { key: `list-${elements.length}` }, listItems.map((li, idx) => h('li', { key: idx }, parseInlineMarkdown(li)))));
          listItems = [];
          inList = false;
        }
      };

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Frontmatter
        if (i === 0 && line.trim() === '---') {
          inFrontmatter = true;
          continue;
        }
        if (inFrontmatter) {
          if (line.trim() === '---') {
            inFrontmatter = false;
            elements.push(h('div', { className: 'hs-preview-frontmatter', key: 'fm' }, [
              h('div', { style: { fontWeight: 600, marginBottom: 4, color: 'var(--dsw-alias-brand-primary, #4db6a0)' } }, '📋 Frontmatter 元数据'),
              ...frontmatterLines.map((fml, idx) => h('div', { key: idx }, fml))
            ]));
          } else {
            frontmatterLines.push(line);
          }
          continue;
        }

        // Codeblock
        if (line.trim().startsWith('```')) {
          if (!inCodeBlock) {
            flushList();
            inCodeBlock = true;
            codeBlockLines.length = 0;
          } else {
            inCodeBlock = false;
            elements.push(h('pre', { key: `code-${elements.length}` }, [
              h('code', null, codeBlockLines.join('\n'))
            ]));
            codeBlockLines.length = 0;
          }
          continue;
        }
        if (inCodeBlock) {
          codeBlockLines.push(line);
          continue;
        }

        // 标题
        const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);
        if (headerMatch) {
          flushList();
          const level = headerMatch[1].length;
          elements.push(h(`h${level}`, { key: `h-${elements.length}` }, parseInlineMarkdown(headerMatch[2])));
          continue;
        }

        // 分割线
        if (/^(\*\*\*|---|___)$/.test(line.trim())) {
          flushList();
          elements.push(h('hr', { key: `hr-${elements.length}` }));
          continue;
        }

        // 引用块
        if (line.trim().startsWith('>')) {
          flushList();
          const quoteText = line.replace(/^>\s?/, '');
          elements.push(h('blockquote', { key: `quote-${elements.length}` }, [
            h('p', null, parseInlineMarkdown(quoteText))
          ]));
          continue;
        }

        // 列表
        const ulMatch = line.match(/^[-*+]\s+(.*)$/);
        if (ulMatch) {
          if (!inList || listType !== 'ul') {
            flushList();
            inList = true;
            listType = 'ul';
          }
          listItems.push(ulMatch[1]);
          continue;
        }
        const olMatch = line.match(/^(\d+)\.\s+(.*)$/);
        if (olMatch) {
          if (!inList || listType !== 'ol') {
            flushList();
            inList = true;
            listType = 'ol';
          }
          listItems.push(olMatch[2]);
          continue;
        }

        // 空行
        if (!line.trim()) {
          flushList();
          continue;
        }

        // 段落
        flushList();
        elements.push(h('p', { key: `p-${elements.length}` }, parseInlineMarkdown(line)));
      }

      flushList();
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

      // 文章列表搜索与过滤状态
      const [articleSearch, setArticleSearch] = useState('');
      const [articleTabFilter, setArticleTabFilter] = useState('all'); // 'all' | 'published' | 'draft'
      const [articleTagFilter, setArticleTagFilter] = useState('all');

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
      const [deployScript, setDeployScript] = useState('');
      const [deployBuild, setDeployBuild] = useState('');
      const [deploying, setDeploying] = useState(false);
      const [deployResult, setDeployResult] = useState(null);
      const [savingConfig, setSavingConfig] = useState(false);

      // 博客根目录快速绑定与生成草稿必填弹窗状态
      const [quickBlogRoot, setQuickBlogRoot] = useState('');
      const [savingQuickBlog, setSavingQuickBlog] = useState(false);
      const [scaffoldModalItem, setScaffoldModalItem] = useState(null);
      const [scaffoldProjectRoot, setScaffoldProjectRoot] = useState('');
      const [scaffolding, setScaffolding] = useState(false);
      const [pickingDir, setPickingDir] = useState(false);

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
          return null;
        } catch (e) {
          console.warn('[dsh-hotspot] handlePickDirectory error:', e);
          return null;
        } finally {
          setPickingDir(false);
        }
      };

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
       * 让写作子代理替当前草稿补全正文。
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
          `让写作子代理为「${label}」${empty ? '完成正文' : '重写正文'}？`,
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

      const handleEnableBuiltins = async () => {
        const currentSources = state?.config?.sources || [];
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

      const handleDeploy = async () => {
        if (deploying) return;
        setDeploying(true);
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
          const seconds = (Number(value.durationMs || 0) / 1000).toFixed(1);
          showToast(
            value.success ? `✅ 站点部署完成（${seconds}s）` : `❌ 部署失败：${data.message}（${seconds}s）`,
            !value.success
          );
        } catch (err) {
          showToast(err.message || '部署请求失败', true);
        } finally {
          setDeploying(false);
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

      // 顶部概览：日期、抓取健康度、各阶段数量与 RSS 订阅地址。
      // 状态与数字全部派生自 state，页面不自己再存一份。
      const FEED_PREVIEW = 24;
      const digest = state?.digest || null;
      const digestDate = digest?.date || '';
      const digestStatus = digest?.status || null;
      const digestGenerated = digest?.generatedAt
        ? new Date(digest.generatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '';
      const health = !digestStatus
        ? null
        : digestStatus.degraded
          ? { text: '严重降级', color: '#f87171' }
          : digestStatus.feedsOk === digestStatus.feedsTotal
            ? { text: '抓取正常', color: '#34d399' }
            : { text: '部分降级', color: '#f59e0b' };
      const rssPath = state?.feed?.rssPath || '/dsh-hotspot/rss.xml';
      const rssHref = (typeof window !== 'undefined' ? window.location.origin : '') + rssPath;
      const sourceLabelOf = (id) => {
        if (!id) return '';
        const all = [...(state?.config?.sources || []), ...(state?.builtinSources || [])];
        return all.find((source) => source.id === id)?.name || id;
      };
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
      const missingBuiltins = builtinSources.filter((s) => !configuredSourceIds.has(s.id));

      const deployConfigured = Boolean(state?.config?.deploy?.configured);
      const savedDeployScript = state?.config?.deploy?.script || '';
      const savedDeployBuild = state?.config?.deploy?.build || '';
      const deployDetected = state?.config?.deploy?.detected || { script: '', build: '' };
      const configFilePath = state?.config?.configFile || '';
      const deployHistory = state?.config?.deploy?.history || [];
      const lastDeploy = deployHistory[0] || null;
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
                      : '先在「策略与路径配置」里绑定部署脚本',
                    true
                  );
                  return;
                }
                handleDeploy();
              },
              disabled: deploying || !isBlogConfigured,
              title: !isBlogConfigured
                ? '先在「策略与路径配置」里绑定博客项目根目录'
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
              deploying ? '部署中...' : '部署站点'
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

            // 今日概览 + RSS：一眼看到抓取健康度与产出，订阅地址可直接复制
            h('div', { className: 'hs-overview', key: 'overview' }, [
              h('div', { className: 'hs-overview-top' }, [
                h('span', { className: 'hs-overview-date' }, digestDate || '今天还没有抓取'),
                health && h('span', {
                  className: 'hs-status-pill',
                  style: { color: health.color }
                }, health.text),
                h('span', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary, #8c909e)' } },
                  digestGenerated ? `生成于 ${digestGenerated}` : '抓取一次后这里会显示各阶段产出'),
                h('span', { style: { flex: 1 } }),
                h('button', {
                  className: 'hs-btn ghost',
                  style: { padding: '4px 9px', fontSize: 11.5 },
                  onClick: async () => {
                    try {
                      if (typeof navigator === 'undefined' || !navigator.clipboard) throw new Error('clipboard unavailable');
                      await navigator.clipboard.writeText(rssHref);
                      showToast('RSS 订阅地址已复制');
                    } catch {
                      showToast('复制失败，请手动复制：' + rssHref, true);
                    }
                  }
                }, '复制 RSS'),
                h('a', {
                  className: 'hs-btn ghost',
                  href: rssHref,
                  target: '_blank',
                  rel: 'noreferrer',
                  style: { padding: '4px 9px', fontSize: 11.5, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }
                }, '打开 RSS')
              ]),
              h('div', { className: 'hs-overview-stats' },
                overviewStats.map(([label, value]) => h('div', { className: 'hs-mini-stat', key: label }, [
                  h('b', null, String(value)),
                  h('span', null, label)
                ]))
              ),
              h('div', { className: 'hs-rss-bar' }, [
                h('span', {
                  className: 'hs-tag-pill',
                  style: { fontSize: 10, color: '#34d399', borderColor: 'rgba(52, 211, 153, 0.35)' }
                }, 'RSS'),
                h('code', { className: 'hs-rss-url', title: rssHref }, rssHref)
              ]),
              h('div', { className: 'hs-rss-note' },
                `阅读器里候选 ${rawItems.length} 条排最前（按当天生成时间），其后是今日抓到的其余文章，单次最多 80 条。`
              )
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
                          `来源：${
                            [...new Set((item.sources || []).map((s) => sourceLabelOf(s.source)).filter(Boolean))].join('、') ||
                            (item.sourceCount > 1 ? `${item.sourceCount} 个源` : '未知')
                          }${item.sourceCount > 1 ? ` · ${item.sourceCount} 源共现` : ''}`
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
                            }, sourceLabelOf(s.source) || s.sourceId || 'source'),
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
                }),

            // 今日订阅文章：候选排在前面，这里只补候选之外的当天原文条目。
            // 默认折叠到 24 条 —— raw 一天上百条，全量铺开会把候选页拉得很长。
            feedDate && feedItems.length > 0 && h('div', { key: 'feed-items', style: { marginTop: 26 } }, [
              h('div', {
                style: {
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 10,
                  flexWrap: 'wrap',
                  padding: '0 2px 10px',
                  marginBottom: 6,
                  borderBottom: '1px solid var(--dsw-alias-border-l1, #2d303b)'
                }
              }, [
                h('div', null, [
                  h('div', { className: 'hs-card-title' }, [
                    '今日订阅文章 ',
                    h('span', { style: { color: 'var(--dsw-alias-brand-primary, #4db6a0)' } }, `(${feedItems.length})`)
                  ]),
                  h('div', { className: 'hs-card-subtitle' },
                    `${feedDate} · 候选 ${rawItems.length} 条已排在上方，这里是候选之外抓到的原文`
                  )
                ]),
                h('span', { style: { flex: 1 } }),
                feedItems.length > FEED_PREVIEW && h('button', {
                  className: 'hs-btn ghost',
                  style: { padding: '4px 9px', fontSize: 11.5 },
                  onClick: () => setFeedExpanded((value) => !value)
                }, feedExpanded ? '收起' : `展开全部 ${feedItems.length} 条`),
                h('a', {
                  href: rssHref,
                  target: '_blank',
                  rel: 'noreferrer',
                  className: 'hs-btn ghost',
                  style: { padding: '4px 9px', fontSize: 11.5, textDecoration: 'none' }
                }, '订阅 RSS')
              ]),
              h('div', { className: 'hs-card', style: { padding: '2px 0' } },
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
                      h('div', { className: 'hs-candidate-meta', style: { marginTop: 3 } }, [
                        sourceName && h('span', {
                          className: 'hs-tag-pill',
                          style: { fontSize: 10 }
                        }, sourceName),
                        whenText && h('span', { style: { fontSize: 11 } }, whenText),
                        item.summary && h('span', { className: 'hs-feed-summary', style: { minWidth: 0 } }, item.summary)
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
              ),
              !feedExpanded && feedItems.length > FEED_PREVIEW && h('div', { style: { textAlign: 'center', padding: '8px 0 0' } }, [
                h('button', {
                  className: 'hs-btn ghost',
                  style: { fontSize: 11.5 },
                  onClick: () => setFeedExpanded(true)
                }, `还有 ${feedItems.length - FEED_PREVIEW} 条，展开查看`)
              ])
            ])
          ]),

          // ── TAB: 订阅源管理 ──
          tab === 'sources' && h('div', { key: 'sources-panel' }, [
            // 内置精选源 Hero：只解释「内置是什么」，不再单开一块列表
            h('div', { className: 'hs-hero-banner' }, [
              h('div', { className: 'hs-hero-left' }, [
                h('div', { className: 'hs-hero-icon' }, [
                  h('svg', { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2 }, [
                    h('path', { d: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z' })
                  ])
                ]),
                h('div', null, [
                  h('div', { className: 'hs-hero-title' }, [
                    '内置精选源',
                    h('span', { className: 'hs-tag-pill ai', style: { fontSize: 10 } }, `${builtinSources.length} 个 · 开箱即用`)
                  ]),
                  h('div', { className: 'hs-hero-desc' },
                    '插件自带的推荐源不单独占一块列表：启用后就出现在下方「订阅源清单」里，并带「内置」标签。'
                  )
                ])
              ]),
              missingBuiltins.length > 0
                ? h('button', { className: 'hs-btn primary', onClick: handleEnableBuiltins }, [
                    h('span', { style: { marginRight: 4 } }, '⚡'),
                    `一键启用全部（${missingBuiltins.length}）`
                  ])
                : h('span', {
                    className: 'hs-tag-pill',
                    style: { background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', borderColor: 'rgba(16, 185, 129, 0.3)', padding: '5px 12px' }
                  }, '✓ 内置源已全部启用')
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

            // 现有订阅源列表 Card：内置源并进同一张表，用「内置」标签区分
            h('div', { className: 'hs-card' }, [
              h('div', { className: 'hs-card-header' }, [
                h('div', null, [
                  h('div', { className: 'hs-card-title' },
                    `订阅源清单（已启用 ${configuredSources.length}${missingBuiltins.length ? ` · 内置待启用 ${missingBuiltins.length}` : ''}）`
                  ),
                  h('div', { className: 'hs-card-subtitle' }, '聚合扫描时会并发采集所有已启用的源；带「内置」标签的来自插件自带推荐源')
                ])
              ]),
              h('table', { className: 'hs-table' }, [
                h('thead', null, [
                  h('tr', null, [
                    h('th', { style: { width: 170 } }, 'ID 标识'),
                    h('th', { style: { width: 120 } }, '类型'),
                    h('th', null, '抓取目标 / 规则'),
                    h('th', { style: { width: 80, textAlign: 'right' } }, '操作')
                  ])
                ]),
                h('tbody', null, [
                  configuredSources.map(s => {
                    let typeBadgeClass = 'hs-tag-pill';
                    if (s.kind === 'rss') typeBadgeClass = 'hs-tag-pill ai';
                    if (s.kind === 'github-release') typeBadgeClass = 'hs-tag-pill code';
                    return h('tr', { key: s.id }, [
                      h('td', { style: { fontWeight: 600 } }, [
                        s.id,
                        builtinIds.has(s.id) && h('span', {
                          className: 'hs-tag-pill',
                          style: { marginLeft: 6, fontSize: 10, background: 'rgba(99, 102, 241, 0.18)', color: '#a5b4fc', borderColor: 'rgba(99, 102, 241, 0.35)' }
                        }, '内置')
                      ]),
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
                  }),
                  missingBuiltins.map(b => h('tr', { key: `builtin-${b.id}`, style: { opacity: 0.75 } }, [
                    h('td', { style: { fontWeight: 600 } }, [
                      b.id,
                      h('span', {
                        className: 'hs-tag-pill',
                        style: { marginLeft: 6, fontSize: 10, background: 'rgba(99, 102, 241, 0.18)', color: '#a5b4fc', borderColor: 'rgba(99, 102, 241, 0.35)' }
                      }, '内置')
                    ]),
                    h('td', null, h('span', { className: 'hs-tag-pill ai' }, b.kind || 'rss')),
                    h('td', { style: { color: 'var(--dsw-alias-label-secondary, #9da1b0)', fontFamily: 'monospace', fontSize: 12 } },
                      b.url || b.repo || ''
                    ),
                    h('td', { style: { textAlign: 'right' } }, h('button', {
                      className: 'hs-btn',
                      style: { padding: '3px 8px', fontSize: 11 },
                      onClick: () => handleAddPresetSource(b)
                    }, '启用'))
                  ]))
                ])
              ])
            ])
          ]),

          // ── TAB: 草稿箱（专注待发布草稿的管理、在线润色、转正与删除，不干预已发布博文） ──
          (tab === 'drafts' || tab === 'articles') && (() => {
            const drafts = (state?.drafts || []).map(d => ({
              ...d,
              isDraft: true,
              file: d.file || d.path || `docs/draft/${d.slug}/index.md`
            }));

            // 搜索过滤与标签筛选
            const filteredDrafts = drafts.filter(item => {
              if (articleTagFilter !== 'all') {
                if (!Array.isArray(item.tags) || !item.tags.includes(articleTagFilter)) return false;
              }
              if (articleSearch.trim()) {
                const q = articleSearch.trim().toLowerCase();
                const titleMatch = (item.title || '').toLowerCase().includes(q);
                const slugMatch = (item.slug || '').toLowerCase().includes(q);
                const tagMatch = Array.isArray(item.tags) && item.tags.some(t => String(t).toLowerCase().includes(q));
                const fileMatch = (item.file || item.path || '').toLowerCase().includes(q);
                const descMatch = (item.description || '').toLowerCase().includes(q);
                if (!titleMatch && !slugMatch && !tagMatch && !fileMatch && !descMatch) return false;
              }
              return true;
            });

            const availableTags = (state?.profile?.tags || []).slice(0, 15);

            const handleCopyPath = (filePath) => {
              if (!filePath) return;
              try {
                if (navigator?.clipboard?.writeText) {
                  navigator.clipboard.writeText(filePath);
                  showToast(`已复制草稿路径: ${filePath}`);
                } else {
                  showToast(filePath);
                }
              } catch {
                showToast(filePath);
              }
            };

            return h('div', { key: 'drafts-panel' }, [
              // 概览指标卡片
              h('div', { className: 'hs-stat-grid' }, [
                h('div', { className: 'hs-stat-box' }, [
                  h('div', { className: 'hs-stat-value', style: { color: 'var(--dsw-alias-brand-primary, #4db6a0)' } }, drafts.length),
                  h('div', { className: 'hs-stat-title' }, '待发布草稿总数')
                ]),
                h('div', { className: 'hs-stat-box' }, [
                  h('div', { className: 'hs-stat-value', style: { color: '#f59e0b', fontSize: 16, fontFamily: 'monospace' } }, state?.blog?.draftDir || 'docs/draft'),
                  h('div', { className: 'hs-stat-title' }, '草稿落地相对目录')
                ]),
                h('div', { className: 'hs-stat-box' }, [
                  h('div', { className: 'hs-stat-value', style: { color: isBlogConfigured ? '#34d399' : '#f87171', fontSize: 16 } },
                    isBlogConfigured ? '已绑定' : '未绑定'
                  ),
                  h('div', { className: 'hs-stat-title' }, '博客项目状态')
                ]),
                h('div', { className: 'hs-stat-box' }, [
                  h('div', { className: 'hs-stat-value', style: { color: '#38bdf8' } }, state?.profile?.tags?.length || 0),
                  h('div', { className: 'hs-stat-title' }, '博客参考标签库')
                ])
              ]),

              // 搜索与过滤工具栏
              h('div', { className: 'hs-card', style: { padding: '14px 18px' } }, [
                h('div', { style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 } }, [
                  // 搜索框
                  h('div', { className: 'hs-search-box', style: { flex: '1 1 240px' } }, [
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
                      placeholder: '搜索草稿标题、slug、标签或路径...',
                      value: articleSearch,
                      onChange: (e) => setArticleSearch(e.target.value)
                    })
                  ]),

                  // 快速清空搜索
                  articleSearch.trim() && h('button', {
                    className: 'hs-btn sm',
                    onClick: () => setArticleSearch('')
                  }, '清空搜索')
                ]),

                // 热门标签快捷过滤
                availableTags.length > 0 && h('div', { style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--dsw-alias-border-l1, #282a34)' } }, [
                  h('span', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary, #8c909e)', marginRight: 4 } }, '标签过滤:'),
                  h('span', {
                    className: `hs-filter-tag ${articleTagFilter === 'all' ? 'active' : ''}`,
                    style: { cursor: 'pointer' },
                    onClick: () => setArticleTagFilter('all')
                  }, '全部标签'),
                  ...availableTags.map(tag => h('span', {
                    key: tag,
                    className: `hs-filter-tag ${articleTagFilter === tag ? 'active' : ''}`,
                    style: { cursor: 'pointer' },
                    onClick: () => setArticleTagFilter(articleTagFilter === tag ? 'all' : tag)
                  }, `#${tag}`))
                ])
              ]),

              // 草稿卡片列表
              h('div', { className: 'hs-card' }, [
                h('div', { className: 'hs-card-header' }, [
                  h('div', null, [
                    h('div', { className: 'hs-card-title' }, `草稿明细 (${filteredDrafts.length} / ${drafts.length})`),
                    h('div', { className: 'hs-card-subtitle' },
                      '专注管理由热点聚合生成的待发布草稿（支持预览润色、补料核验、转正发布与废弃删除，不干预博客正式文章）'
                    )
                  ]),
                  (articleSearch || articleTagFilter !== 'all') && h('button', {
                    className: 'hs-btn sm',
                    onClick: () => {
                      setArticleSearch('');
                      setArticleTagFilter('all');
                    }
                  }, '重置筛选')
                ]),

                filteredDrafts.length === 0
                  ? h('div', { style: { padding: '36px 0', textAlign: 'center', color: 'var(--dsw-alias-label-secondary, #8c909e)' } }, [
                      h('div', { style: { fontSize: 24, marginBottom: 8 } }, '📝'),
                      h('div', { style: { fontWeight: 500 } }, '暂无符合条件的草稿'),
                      h('div', { style: { fontSize: 12, marginTop: 4 } }, '可在「热点候选」中点击一键生成草稿，草稿将落地到 docs/draft 目录')
                    ])
                  : h('div', null, filteredDrafts.map(item => {
                      const filePath = item.file || item.path || `docs/draft/${item.slug}/index.md`;
                      return h('div', {
                        key: `draft-${item.slug}`,
                        className: 'hs-article-card'
                      }, [
                        // 标题行与状态
                        h('div', { className: 'hs-article-title-row' }, [
                          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 } }, [
                            h('span', {
                              className: 'hs-tag-pill',
                              style: {
                                background: 'rgba(245, 158, 11, 0.15)',
                                color: '#fbbf24',
                                borderColor: 'rgba(245, 158, 11, 0.3)',
                                fontSize: 11
                              }
                            }, '草稿 (sitemap:false)'),
                            h('span', { className: 'hs-article-title', style: { wordBreak: 'break-word' } }, item.title || item.slug)
                          ]),
                          item.date && h('span', {
                            style: {
                              fontSize: 11,
                              color: 'var(--dsw-alias-label-secondary, #8c909e)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              flexShrink: 0
                            }
                          }, [
                            h('svg', { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, [
                              h('rect', { x: 3, y: 4, width: 18, height: 18, rx: 2, ry: 2 }),
                              h('line', { x1: 16, y1: 2, x2: 16, y2: 6 }),
                              h('line', { x1: 8, y1: 2, x2: 8, y2: 6 }),
                              h('line', { x1: 3, y1: 10, x2: 21, y2: 10 })
                            ]),
                            item.date
                          ])
                        ]),

                        // 描述（如有）
                        item.description && h('div', { className: 'hs-article-desc' }, item.description),

                        // 底部元数据与操作
                        h('div', { className: 'hs-article-meta' }, [
                          // 文件路径胶囊
                          h('span', {
                            className: 'hs-article-file',
                            title: '点击复制草稿文件路径',
                            onClick: () => handleCopyPath(filePath)
                          }, [
                            h('svg', { width: 11, height: 11, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 }, [
                              h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
                              h('polyline', { points: '14 2 14 8 20 8' })
                            ]),
                            filePath,
                            h('span', { style: { fontSize: 10, color: 'var(--dsw-alias-brand-primary, #4db6a0)', marginLeft: 2 } }, '📋')
                          ]),

                          // slug
                          h('span', { style: { fontFamily: 'monospace', color: '#6e7382' } }, `slug: ${item.slug}`),

                          // 标签
                          (item.tags || []).length > 0 && h('div', { style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
                            item.tags.map(t => h('span', {
                              key: t,
                              className: 'hs-tag-pill',
                              style: { cursor: 'pointer' },
                              onClick: () => setArticleTagFilter(t)
                            }, `#${t}`))
                          ),

                          // 操作按钮区：专注草稿的预览润色、转正发布与废弃删除
                          h('div', { style: { display: 'flex', gap: 6, marginLeft: 'auto', alignItems: 'center' } }, [
                            h('button', {
                              className: 'hs-btn sm',
                              style: { padding: '3px 8px', fontSize: 11 },
                              onClick: () => openArticleEditor({ ...item, file: filePath, isDraft: true })
                            }, '✏️ 预览与润色'),
                            h('button', {
                              className: 'hs-btn sm primary',
                              style: { padding: '3px 8px', fontSize: 11 },
                              disabled: isPromotingArticle,
                              onClick: () => handlePromoteArticle(item.slug)
                            }, '🚀 转正发布'),
                            h('button', {
                              className: 'hs-btn sm',
                              style: { padding: '3px 8px', fontSize: 11, color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.3)' },
                              disabled: isDeletingArticle,
                              onClick: () => handleDeleteArticle({ ...item, file: filePath, isDraft: true })
                            }, '🗑️ 废弃草稿')
                          ])
                        ])
                      ]);
                    }))
              ])
            ]);
          })(),

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
                h('div', { style: { display: 'flex', gap: 8 } }, [
                  h('input', {
                    className: 'hs-input',
                    style: { flex: 1 },
                    placeholder: '选择或输入博客根目录绝对路径，如 /Users/you/Code/my-blog',
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
                  }, [
                    h('span', { style: { marginRight: 4 } }, '📁'),
                    pickingDir ? '选择中...' : '选择文件夹'
                  ])
                ]),
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

            // 4. 站点部署 Card
            h('div', { className: 'hs-card', key: 'deploy-card' }, [
              h('div', { className: 'hs-card-header' }, [
                h('div', null, [
                  h('div', { className: 'hs-card-title' }, '站点部署'),
                  h('div', { className: 'hs-card-subtitle' }, '先构建、再执行部署脚本，两步都在博客根目录下跑；构建失败即停，不会带着旧产物上线')
                ]),
                h('span', {
                  style: {
                    fontSize: 11,
                    padding: '3px 9px',
                    borderRadius: 999,
                    whiteSpace: 'nowrap',
                    background: deployConfigured ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                    color: deployConfigured ? '#34d399' : '#94a3b8'
                  }
                }, deployConfigured ? '已绑定' : '未绑定')
              ]),
              (deployDetected.script || deployDetected.build) && h('div', {
                style: {
                  display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
                  padding: '10px 12px', marginBottom: 12, borderRadius: 8,
                  background: 'rgba(59, 130, 246, 0.10)',
                  border: '1px solid rgba(59, 130, 246, 0.28)',
                  fontSize: 12
                }
              }, [
                h('span', { style: { color: '#93c5fd' } }, '在博客根目录探测到：'),
                deployDetected.build && h('code', { style: { color: '#e2e8f0' } }, `build = ${deployDetected.build}`),
                deployDetected.script && h('code', { style: { color: '#e2e8f0' } }, `deploy = ${deployDetected.script}`),
                h('button', {
                  className: 'hs-btn',
                  type: 'button',
                  onClick: () => {
                    if (deployDetected.build) setDeployBuild(deployDetected.build);
                    if (deployDetected.script) setDeployScript(deployDetected.script);
                    showToast('已填入探测结果，点「保存策略与路径配置」后生效');
                  }
                }, '使用探测结果')
              ]),
              h('div', { className: 'hs-form-item' }, [
                h('label', { className: 'hs-form-label' }, '构建命令 (deploy.build · 可选)'),
                h('input', {
                  className: 'hs-input',
                  style: { width: '100%', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
                  placeholder: 'yarn build',
                  value: deployBuild,
                  onChange: (e) => setDeployBuild(e.target.value)
                }),
                h('div', { className: 'hs-form-hint' }, '留空则跳过构建，直接执行部署脚本。CLI 的 hotspot publish 也读这一项。')
              ]),
              h('div', { className: 'hs-form-item' }, [
                h('label', { className: 'hs-form-label' }, '部署脚本 (deploy.script · 必填)'),
                h('textarea', {
                  className: 'hs-textarea',
                  style: { height: 86, width: '100%', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
                  placeholder: './deploy.sh --no-git --skip-build',
                  value: deployScript,
                  onChange: (e) => setDeployScript(e.target.value)
                }),
                h('div', { className: 'hs-form-hint' }, '用你的登录 shell（zsh/bash -l）在博客根目录执行，PATH 与终端一致，nvm/yarn/ssh-agent 都能找到；单步最长 10 分钟，输出保留末尾 64KB。留空保存即解绑。')
              ]),
              h('div', { style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' } }, [
                h('button', {
                  className: 'hs-btn',
                  type: 'button',
                  disabled: deploying || !deployConfigured || !isBlogConfigured,
                  title: !deployConfigured
                    ? '先在下方填写并保存部署脚本'
                    : (!isBlogConfigured ? '先在「博客仓库与文档目录」绑定博客根目录' : '用已保存的配置立即部署'),
                  onClick: handleDeploy
                }, deploying ? '部署中...' : '立即部署'),
                h('span', { className: 'hs-form-hint', style: { marginTop: 0 } },
                  deployConfigured
                    ? `已保存：${savedDeployBuild ? `${savedDeployBuild} && ` : ''}${savedDeployScript}`
                    : '尚未绑定部署脚本'),
                configFilePath && h('span', {
                  className: 'hs-form-hint',
                  style: { marginTop: 0, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', wordBreak: 'break-all' }
                }, `配置文件：${configFilePath}`),
                (deployScript.trim() !== savedDeployScript || deployBuild.trim() !== savedDeployBuild)
                  && h('span', { style: { fontSize: 11, color: '#fbbf24' } }, '（表单已改动，保存后生效）')
              ]),
              lastDeploy && h('div', { style: { marginTop: 12 } }, [
                h('div', { className: 'hs-form-label' }, '上次部署'),
                h('div', {
                  style: {
                    display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', fontSize: 12,
                    color: lastDeploy.success ? '#34d399' : '#f87171'
                  }
                }, [
                  h('span', null, lastDeploy.success
                    ? '✓ 成功'
                    : `✗ 失败${lastDeploy.failedStep ? `（${lastDeploy.failedStep === 'build' ? '构建' : '部署'}阶段）` : ''}`),
                  h('span', { style: { color: 'var(--dsw-alias-label-secondary, #8c909e)' } },
                    `${new Date(lastDeploy.at).toLocaleString()} · ${(Number(lastDeploy.durationMs || 0) / 1000).toFixed(1)}s`),
                  h('button', {
                    className: 'hs-btn ghost',
                    type: 'button',
                    style: { padding: '2px 8px', fontSize: 11 },
                    onClick: () => setDeployResult(lastDeploy)
                  }, '查看详情')
                ])
              ])
            ]),

            // 5. 当前博客画像索引 Card
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

            // 6. 底部操作按钮栏
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

        // ── 站点部署结果 Modal ──
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
                h('div', { style: { display: 'flex', gap: 8 } }, [
                  h('input', {
                    className: 'hs-input',
                    style: { flex: 1 },
                    placeholder: '选择或输入博客根目录路径，如 /Users/username/Code/my-blog',
                    value: scaffoldProjectRoot,
                    onChange: (e) => setScaffoldProjectRoot(e.target.value),
                    autoFocus: true
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
                  }, [
                    h('span', { style: { marginRight: 4 } }, '📁'),
                    pickingDir ? '选择中...' : '选择文件夹'
                  ])
                ])
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
                  style: {
                    fontSize: 11,
                    color: 'var(--dsw-alias-label-secondary, #8c909e)',
                    fontFamily: 'monospace'
                  }
                }, `(${editModalItem.file})`)
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
                    }, '✨ 先让子代理写正文')
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

            // 生成正文进行中：写作子代理最长要跑 8 分钟，明确告诉用户别关面板
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
                    'scaffold 只写了标题、摘要和来源，正文是空的，所以还不能润色。点下面的按钮，写作子代理会先联网补料、把来源登记进证据账本，再按这些材料把正文写完；写完就可以用头部的「✨ 正文润色」按你的要求反复润。'),
                  h('div', { className: 'hs-body-empty-actions' }, [
                    h('button', {
                      className: 'hs-btn primary',
                      disabled: isWritingBody,
                      onClick: handleWriteBody
                    }, isWritingBody ? '✍️ 正在生成正文...' : '✨ 让子代理写正文'),
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
