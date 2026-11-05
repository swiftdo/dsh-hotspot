window.__ModuleLoader__.load({
  id: 'dsh-hotspot',
  factory: (require) => {
    const React = require('react');
    const h = React.createElement;
    const useState = React.useState;
    const useEffect = React.useEffect;
    const useCallback = React.useCallback;

    const PANEL_ID = 'dsh-hotspot';
    const API_BASE = '/hotspot/api';

    // ── 样式定义（与 DSH 原生主题变量对齐） ─────────────────────────
    const STYLES = `
      .hs-root {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--dsw-alias-bg-base, #15161a);
        color: var(--dsw-alias-label-primary, #e8e8ea);
        font-family: system-ui, -apple-system, "PingFang SC", sans-serif;
        font-size: 13px;
        overflow: hidden;
      }
      .hs-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 20px;
        border-bottom: 1px solid var(--dsw-alias-border-l1, #2e3038);
        background: var(--dsw-alias-bg-base, #15161a);
        flex-shrink: 0;
      }
      .hs-back-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: transparent;
        border: 1px solid var(--dsw-alias-border-l1, #2e3038);
        border-radius: 6px;
        color: var(--dsw-alias-label-secondary, #9b9ca6);
        padding: 4px 8px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.15s ease;
      }
      .hs-back-btn:hover {
        color: var(--dsw-alias-label-primary, #fff);
        border-color: var(--dsw-alias-brand-primary, #4db6a0);
      }
      .hs-title {
        font-size: 15px;
        font-weight: 600;
        margin: 0;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .hs-badge {
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--dsw-alias-bg-layer-2, #22232a);
        border: 1px solid var(--dsw-alias-border-l1, #2e3038);
        color: var(--dsw-alias-label-secondary, #9b9ca6);
        font-weight: normal;
      }
      .hs-header-actions {
        margin-left: auto;
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .hs-btn {
        font: inherit;
        color: var(--dsw-alias-label-primary, #e8e8ea);
        background: var(--dsw-alias-bg-layer-2, #22232a);
        border: 1px solid var(--dsw-alias-border-l1, #2e3038);
        border-radius: 6px;
        padding: 5px 12px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .hs-btn:hover {
        border-color: var(--dsw-alias-brand-primary, #4db6a0);
      }
      .hs-btn.primary {
        background: var(--dsw-alias-brand-primary, #4db6a0);
        color: #0d1a17;
        font-weight: 500;
        border-color: transparent;
      }
      .hs-btn.primary:hover {
        opacity: 0.9;
      }
      .hs-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .hs-nav {
        display: flex;
        gap: 2px;
        padding: 8px 20px 0;
        border-bottom: 1px solid var(--dsw-alias-border-l1, #2e3038);
        background: var(--dsw-alias-bg-layer-1, #1c1d23);
        flex-shrink: 0;
      }
      .hs-tab {
        background: transparent;
        border: 1px solid transparent;
        border-bottom: 0;
        border-radius: 6px 6px 0 0;
        color: var(--dsw-alias-label-secondary, #9b9ca6);
        padding: 6px 14px;
        cursor: pointer;
        font-size: 13px;
        transition: all 0.15s ease;
      }
      .hs-tab:hover {
        color: var(--dsw-alias-label-primary, #fff);
      }
      .hs-tab.active {
        background: var(--dsw-alias-bg-base, #15161a);
        color: var(--dsw-alias-brand-primary, #4db6a0);
        border-color: var(--dsw-alias-border-l1, #2e3038);
        border-bottom-color: var(--dsw-alias-bg-base, #15161a);
        margin-bottom: -1px;
        font-weight: 500;
      }
      .hs-content {
        flex: 1;
        overflow-y: auto;
        padding: 16px 20px 48px;
        max-width: 1040px;
        margin: 0 auto;
        width: 100%;
        box-sizing: border-box;
      }
      .hs-card {
        background: var(--dsw-alias-bg-layer-1, #1c1d23);
        border: 1px solid var(--dsw-alias-border-l1, #2e3038);
        border-radius: 8px;
        padding: 14px 16px;
        margin-bottom: 14px;
      }
      .hs-item-row {
        display: flex;
        gap: 12px;
        align-items: flex-start;
      }
      .hs-item-main {
        flex: 1;
        min-width: 0;
      }
      .hs-item-title {
        font-size: 14px;
        font-weight: 500;
        color: var(--dsw-alias-label-primary, #e8e8ea);
        text-decoration: none;
        display: inline-block;
        margin-bottom: 4px;
      }
      .hs-item-title:hover {
        color: var(--dsw-alias-brand-primary, #4db6a0);
        text-decoration: underline;
      }
      .hs-item-meta {
        color: var(--dsw-alias-label-secondary, #9b9ca6);
        font-size: 12px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        margin-top: 4px;
      }
      .hs-score-badge {
        color: var(--dsw-alias-brand-primary, #4db6a0);
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }
      .hs-tag {
        font-size: 11px;
        color: var(--dsw-alias-label-secondary, #9b9ca6);
        border: 1px solid var(--dsw-alias-border-l1, #2e3038);
        border-radius: 4px;
        padding: 1px 6px;
      }
      .hs-details {
        margin-top: 8px;
        font-size: 12px;
      }
      .hs-details summary {
        cursor: pointer;
        color: var(--dsw-alias-label-secondary, #9b9ca6);
        user-select: none;
      }
      .hs-details-content {
        margin-top: 6px;
        padding: 8px 12px;
        background: var(--dsw-alias-bg-layer-2, #22232a);
        border-radius: 6px;
        color: var(--dsw-alias-label-secondary, #9b9ca6);
        line-height: 1.5;
      }
      .hs-input {
        font: inherit;
        color: var(--dsw-alias-label-primary, #e8e8ea);
        background: var(--dsw-alias-bg-layer-2, #22232a);
        border: 1px solid var(--dsw-alias-border-l1, #2e3038);
        border-radius: 6px;
        padding: 6px 10px;
        outline: none;
      }
      .hs-input:focus {
        border-color: var(--dsw-alias-brand-primary, #4db6a0);
      }
      .hs-textarea {
        font: inherit;
        color: var(--dsw-alias-label-primary, #e8e8ea);
        background: var(--dsw-alias-bg-layer-2, #22232a);
        border: 1px solid var(--dsw-alias-border-l1, #2e3038);
        border-radius: 6px;
        padding: 8px 10px;
        outline: none;
        resize: vertical;
        line-height: 1.5;
        font-size: 13px;
        box-sizing: border-box;
      }
      .hs-textarea:focus {
        border-color: var(--dsw-alias-brand-primary, #4db6a0);
      }
      .hs-form-label {
        display: block;
        font-size: 12px;
        font-weight: 500;
        color: var(--dsw-alias-label-secondary, #9b9ca6);
        margin-bottom: 6px;
      }
      .hs-form-hint {
        font-size: 11px;
        color: var(--dsw-alias-label-secondary, #9b9ca6);
        margin-top: 4px;
        line-height: 1.4;
      }
      .hs-table {
        width: 100%;
        border-collapse: collapse;
      }
      .hs-table th, .hs-table td {
        text-align: left;
        padding: 8px 10px;
        border-bottom: 1px solid var(--dsw-alias-border-l1, #2e3038);
      }
      .hs-table th {
        color: var(--dsw-alias-label-secondary, #9b9ca6);
        font-weight: 500;
        font-size: 12px;
      }
      .hs-toast {
        position: fixed;
        bottom: 24px;
        right: 24px;
        padding: 10px 16px;
        border-radius: 6px;
        background: var(--dsw-alias-bg-layer-2, #22232a);
        border: 1px solid var(--dsw-alias-border-l1, #2e3038);
        border-left: 4px solid var(--dsw-alias-brand-primary, #4db6a0);
        color: var(--dsw-alias-label-primary, #e8e8ea);
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 1000;
        font-size: 13px;
        animation: hs-fade-in 0.2s ease;
      }
      .hs-toast.err {
        border-left-color: var(--dsw-alias-state-error-primary, #d9636b);
      }
      @keyframes hs-fade-in {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;

    function ensureStyles() {
      if (typeof document === 'undefined') return;
      let el = document.getElementById('hotspot-plugin-styles');
      if (!el) {
        el = document.createElement('style');
        el.id = 'hotspot-plugin-styles';
        el.textContent = STYLES;
        document.head.appendChild(el);
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

    // ── 主面板主视图组件 ───────────────────────────────────────────
    function HotspotMainPanel(props) {
      ensureStyles();

      const [tab, setTab] = useState('candidates');
      const [loading, setLoading] = useState(false);
      const [running, setRunning] = useState(false);
      const [state, setState] = useState(null);
      const [filter, setFilter] = useState('');
      const [toast, setToast] = useState(null);

      // 新增源状态
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

      // 抓取并加载状态
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
            showToast(`抓取完成：聚合生成 ${data.value.items.length} 个候选`);
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

      const handleScaffold = async (item) => {
        try {
          const res = await fetch(`${API_BASE}/scaffold`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: item.id })
          });
          const data = await res.json();
          if (data.ok) {
            showToast(`草稿生成成功：${data.value.articlePath}`);
            await loadState();
          } else {
            showToast(data.message || '生成草稿失败', true);
          }
        } catch (err) {
          showToast(err.message, true);
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
            showToast('博客与系统配置已成功保存并动态生效！');
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
      const items = (state?.digest?.items || []).filter(item => {
        if (!filter) return true;
        const q = filter.toLowerCase();
        return (
          item.title?.toLowerCase().includes(q) ||
          item.tags?.some(t => t.toLowerCase().includes(q)) ||
          item.summary?.toLowerCase().includes(q)
        );
      });

      return h('div', { className: 'hs-root' }, [
        // 头部
        h('header', { className: 'hs-header', key: 'header' }, [
          props?.backToConversation && h('button', {
            className: 'hs-back-btn',
            onClick: props.backToConversation,
            title: '返回对话'
          }, [
            h('svg', {
              width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', key: 'icon'
            }, [
              h('path', {
                d: 'M10 3.5 5.5 8l4.5 4.5',
                stroke: 'currentColor',
                strokeWidth: 1.6,
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
                key: 'p'
              })
            ]),
            '返回会话'
          ]),
          h('h1', { className: 'hs-title', key: 'title' }, [
            '热点草稿',
            state?.digest?.date && h('span', { className: 'hs-badge', key: 'date' }, state.digest.date)
          ]),
          h('div', { className: 'hs-header-actions', key: 'actions' }, [
            h('button', {
              className: 'hs-btn',
              onClick: loadState,
              disabled: loading
            }, loading ? '刷新中...' : '刷新'),
            h('button', {
              className: 'hs-btn primary',
              onClick: handleRun,
              disabled: running
            }, running ? '正在抓取...' : '立即抓取')
          ])
        ]),

        // 导航选项卡
        h('nav', { className: 'hs-nav', key: 'nav' }, [
          h('button', {
            className: `hs-tab ${tab === 'candidates' ? 'active' : ''}`,
            onClick: () => setTab('candidates'),
            key: 'tab-c'
          }, `热点候选 (${items.length})`),
          h('button', {
            className: `hs-tab ${tab === 'sources' ? 'active' : ''}`,
            onClick: () => setTab('sources'),
            key: 'tab-s'
          }, `订阅源 (${state?.config?.sources?.length || 0})`),
          h('button', {
            className: `hs-tab ${tab === 'articles' ? 'active' : ''}`,
            onClick: () => setTab('articles'),
            key: 'tab-a'
          }, `博文与草稿 (${(state?.drafts?.length || 0) + (state?.articles?.length || 0)})`),
          h('button', {
            className: `hs-tab ${tab === 'config' ? 'active' : ''}`,
            onClick: () => setTab('config'),
            key: 'tab-cfg'
          }, '策略配置')
        ]),

        // 内容区
        h('main', { className: 'hs-content', key: 'main' }, [
          // ── TAB: 热点候选 ──
          tab === 'candidates' && h('div', { key: 'candidates-panel' }, [
            h('div', { style: { marginBottom: 12 } }, [
              h('input', {
                className: 'hs-input',
                style: { width: '100%', boxSizing: 'border-box' },
                placeholder: '过滤标题、标签或摘要关键词...',
                value: filter,
                onChange: (e) => setFilter(e.target.value)
              })
            ]),
            items.length === 0
              ? h('div', { className: 'hs-card', style: { textAlign: 'center', color: 'var(--dsw-alias-label-secondary)' } },
                  state?.digest ? '没有符合筛选条件的候选' : '暂无聚合候选，请点击右上角「立即抓取」运行最新扫描'
                )
              : items.map((item, idx) => {
                  return h('div', { className: 'hs-card', key: item.id || idx }, [
                    h('div', { className: 'hs-item-row' }, [
                      h('div', { className: 'hs-item-main' }, [
                        h('a', {
                          className: 'hs-item-title',
                          href: item.url,
                          target: '_blank',
                          rel: 'noreferrer'
                        }, item.title),
                        h('div', { className: 'hs-item-meta' }, [
                          h('span', { className: 'hs-score-badge' }, `${item.score} 分`),
                          h('span', null, `• ${item.sourceCount} 个源共现`),
                          (item.tags || []).map(t => h('span', { className: 'hs-tag', key: t }, t)),
                          item.slugHint && h('span', { className: 'hs-badge' }, item.slugHint)
                        ]),
                        item.summary && h('div', {
                          style: { marginTop: 6, color: 'var(--dsw-alias-label-secondary)', fontSize: 12 }
                        }, item.summary),
                        item.sources && item.sources.length > 0 && h('details', { className: 'hs-details' }, [
                          h('summary', null, `查看 ${item.sources.length} 个原文来源`),
                          h('div', { className: 'hs-details-content' }, [
                            item.sources.map((s, sIdx) => h('div', { key: sIdx, style: { marginBottom: 4 } }, [
                              h('strong', null, `[${s.sourceId || '源'}] `),
                              h('a', {
                                href: s.url,
                                target: '_blank',
                                rel: 'noreferrer',
                                style: { color: 'var(--dsw-alias-brand-primary)' }
                              }, s.title || s.url)
                            ]))
                          ])
                        ])
                      ]),
                      h('button', {
                        className: 'hs-btn',
                        style: { flexShrink: 0 },
                        onClick: () => handleScaffold(item)
                      }, '生成草稿')
                    ])
                  ]);
                })
          ]),

          // ── TAB: 订阅源 ──
          tab === 'sources' && h('div', { key: 'sources-panel' }, [
            h('div', { className: 'hs-card' }, [
              h('div', { style: { fontWeight: 500, marginBottom: 10 } }, '新增订阅源'),
              h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 } }, [
                h('input', {
                  className: 'hs-input',
                  style: { flex: '1 1 120px' },
                  placeholder: 'ID (如 swift-org)',
                  value: newId,
                  onChange: (e) => setNewId(e.target.value)
                }),
                h('select', {
                  className: 'hs-input',
                  style: { flex: '0 0 130px' },
                  value: newKind,
                  onChange: (e) => setNewKind(e.target.value)
                }, [
                  h('option', { value: 'rss' }, 'RSS'),
                  h('option', { value: 'github-release' }, 'GitHub Release'),
                  h('option', { value: 'hn' }, 'Hacker News')
                ]),
                h('input', {
                  className: 'hs-input',
                  style: { flex: '2 1 220px' },
                  placeholder: newKind === 'github-release' ? 'owner/repo (如 apple/swift)' : 'URL',
                  value: newTarget,
                  onChange: (e) => setNewTarget(e.target.value)
                }),
                newKind === 'hn' && h('input', {
                  className: 'hs-input',
                  type: 'number',
                  style: { flex: '0 0 80px' },
                  placeholder: 'minPoints',
                  value: newPoints,
                  onChange: (e) => setNewPoints(e.target.value)
                })
              ]),
              h('button', {
                className: 'hs-btn primary',
                onClick: handleAddSource
              }, '添加订阅源')
            ]),

            h('div', { className: 'hs-card' }, [
              h('table', { className: 'hs-table' }, [
                h('thead', null, [
                  h('tr', null, [
                    h('th', null, 'ID'),
                    h('th', null, '类型'),
                    h('th', null, '目标地址 / 仓库'),
                    h('th', { style: { width: 60 } }, '操作')
                  ])
                ]),
                h('tbody', null, [
                  (state?.config?.sources || []).map(s => h('tr', { key: s.id }, [
                    h('td', { style: { fontWeight: 500 } }, s.id),
                    h('td', null, h('span', { className: 'hs-badge' }, s.kind)),
                    h('td', { style: { color: 'var(--dsw-alias-label-secondary)' } }, s.url || s.repo || `minPoints: ${s.minPoints}`),
                    h('td', null, h('button', {
                      className: 'hs-btn',
                      style: { padding: '2px 8px', fontSize: 12, color: 'var(--dsw-alias-state-error-primary)' },
                      onClick: () => handleDeleteSource(s.id)
                    }, '删除'))
                  ]))
                ])
              ])
            ])
          ]),

          // ── TAB: 博文与草稿 ──
          tab === 'articles' && h('div', { key: 'articles-panel' }, [
            h('div', { className: 'hs-card' }, [
              h('div', { style: { fontWeight: 500, marginBottom: 8 } }, `现有草稿 (${state?.drafts?.length || 0})`),
              (state?.drafts || []).length === 0
                ? h('div', { style: { color: 'var(--dsw-alias-label-secondary)' } }, '暂无未发布的草稿')
                : (state?.drafts || []).map(d => h('div', { key: d.slug, style: { padding: '6px 0', borderBottom: '1px solid var(--dsw-alias-border-l1)' } }, [
                    h('div', { style: { fontWeight: 500 } }, d.title || d.slug),
                    h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } }, `路径: ${d.path || d.slug}`)
                  ]))
            ]),
            h('div', { className: 'hs-card' }, [
              h('div', { style: { fontWeight: 500, marginBottom: 8 } }, `已发布博文 (${state?.articles?.length || 0})`),
              h('div', { style: { maxHeight: 320, overflowY: 'auto' } }, [
                (state?.articles || []).map(a => h('div', { key: a.slug, style: { padding: '6px 0', borderBottom: '1px solid var(--dsw-alias-border-l1)' } }, [
                  h('div', null, a.title || a.slug),
                  h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } }, [
                    `slug: ${a.slug}`,
                    (a.tags || []).length > 0 && ` • 标签: ${a.tags.join(', ')}`
                  ])
                ]))
              ])
            ])
          ]),

          // ── TAB: 配置 ──
          tab === 'config' && h('div', { key: 'config-panel' }, [
            // 1. 博客仓库与目录配置
            h('div', { className: 'hs-card' }, [
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } }, [
                h('div', null, [
                  h('div', { style: { fontWeight: 500, fontSize: 14 } }, '博客仓库与目录配置'),
                  h('div', { className: 'hs-form-hint' }, '配置本地 VitePress 博客仓库绝对路径及文档目录，保存后立即切换生效')
                ]),
                h('span', { className: 'hs-badge', style: { background: 'rgba(77, 182, 160, 0.15)', color: 'var(--dsw-alias-brand-primary, #4db6a0)' } }, '实时生效')
              ]),
              h('div', { style: { marginBottom: 14 } }, [
                h('label', { className: 'hs-form-label' }, '博客根目录 (projectRoot)'),
                h('input', {
                  className: 'hs-input',
                  style: { width: '100%', boxSizing: 'border-box' },
                  placeholder: '输入博客根目录绝对路径（如 /Users/username/my-blog，留空表示当前工作区）',
                  value: blogProjectRoot,
                  onChange: (e) => setBlogProjectRoot(e.target.value)
                }),
                h('div', { className: 'hs-form-hint' }, `当前服务端生效路径: ${state?.blog?.projectRoot || state?.projectRoot || '当前工作区'}`)
              ]),
              h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 } }, [
                h('div', null, [
                  h('label', { className: 'hs-form-label' }, '博文目录 (articleDir)'),
                  h('input', {
                    className: 'hs-input',
                    style: { width: '100%', boxSizing: 'border-box' },
                    placeholder: 'docs',
                    value: blogArticleDir,
                    onChange: (e) => setBlogArticleDir(e.target.value)
                  }),
                  h('div', { className: 'hs-form-hint' }, '已发布文章相对目录')
                ]),
                h('div', null, [
                  h('label', { className: 'hs-form-label' }, '草稿输出目录 (draftDir)'),
                  h('input', {
                    className: 'hs-input',
                    style: { width: '100%', boxSizing: 'border-box' },
                    placeholder: 'docs/draft',
                    value: blogDraftDir,
                    onChange: (e) => setBlogDraftDir(e.target.value)
                  }),
                  h('div', { className: 'hs-form-hint' }, '生成的草稿相对目录')
                ]),
                h('div', null, [
                  h('label', { className: 'hs-form-label' }, '数据缓存目录 (digestDir)'),
                  h('input', {
                    className: 'hs-input',
                    style: { width: '100%', boxSizing: 'border-box' },
                    placeholder: '.hotspot',
                    value: blogDigestDir,
                    onChange: (e) => setBlogDigestDir(e.target.value)
                  }),
                  h('div', { className: 'hs-form-hint' }, '存储每日扫描摘要与缓存')
                ])
              ])
            ]),

            // 2. 排序与打分参数
            h('div', { className: 'hs-card' }, [
              h('div', { style: { fontWeight: 500, fontSize: 14, marginBottom: 12 } }, '热点抓取与打分参数'),
              h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 } }, [
                h('div', null, [
                  h('label', { className: 'hs-form-label' }, '候选数量上限 (limit)'),
                  h('input', {
                    className: 'hs-input',
                    type: 'number',
                    style: { width: '100%', boxSizing: 'border-box' },
                    value: rankLimit,
                    onChange: (e) => setRankLimit(e.target.value)
                  }),
                  h('div', { className: 'hs-form-hint' }, '单日推荐候选上限（默认 15）')
                ]),
                h('div', null, [
                  h('label', { className: 'hs-form-label' }, '抓取回溯窗口 (sinceHours)'),
                  h('input', {
                    className: 'hs-input',
                    type: 'number',
                    style: { width: '100%', boxSizing: 'border-box' },
                    value: rankSinceHours,
                    onChange: (e) => setRankSinceHours(e.target.value)
                  }),
                  h('div', { className: 'hs-form-hint' }, '采集过去多少小时内的新闻')
                ]),
                h('div', null, [
                  h('label', { className: 'hs-form-label' }, '新鲜度半衰期 (halfLifeHours)'),
                  h('input', {
                    className: 'hs-input',
                    type: 'number',
                    style: { width: '100%', boxSizing: 'border-box' },
                    value: rankHalfLifeHours,
                    onChange: (e) => setRankHalfLifeHours(e.target.value)
                  }),
                  h('div', { className: 'hs-form-hint' }, '衰减衰退周期（默认 24h）')
                ]),
                h('div', null, [
                  h('label', { className: 'hs-form-label' }, '聚类相似度阈值 (threshold)'),
                  h('input', {
                    className: 'hs-input',
                    type: 'number',
                    step: '0.05',
                    style: { width: '100%', boxSizing: 'border-box' },
                    value: rankClusterThreshold,
                    onChange: (e) => setRankClusterThreshold(e.target.value)
                  }),
                  h('div', { className: 'hs-form-hint' }, '并查集去重门槛 (0.3~0.95)')
                ])
              ])
            ]),

            // 3. 发布合规与安全规则
            h('div', { className: 'hs-card' }, [
              h('div', { style: { fontWeight: 500, fontSize: 14, marginBottom: 12 } }, '发布安全与外链合规'),
              h('div', { style: { marginBottom: 12 } }, [
                h('label', { className: 'hs-form-label' }, '每日最大发布篇数 (maxPerDay)'),
                h('input', {
                  className: 'hs-input',
                  type: 'number',
                  style: { width: 160 },
                  value: publishMaxPerDay,
                  onChange: (e) => setPublishMaxPerDay(e.target.value)
                }),
                h('div', { className: 'hs-form-hint' }, '限制每天从草稿推到正式发布的上限')
              ]),
              h('div', null, [
                h('label', { className: 'hs-form-label' }, '允许的外链域名白名单 (allowedHosts)'),
                h('textarea', {
                  className: 'hs-textarea',
                  style: { width: '100%', height: 70 },
                  placeholder: '输入允许的外链域名，每行一个或逗号分隔，如：\ngithub.com\nswift.org\nnews.ycombinator.com',
                  value: publishAllowedHosts,
                  onChange: (e) => setPublishAllowedHosts(e.target.value)
                }),
                h('div', { className: 'hs-form-hint' }, '用于文章发布前自动化检查，拦截未经授权的不可信外链')
              ])
            ]),

            // 4. 当前博客画像
            h('div', { className: 'hs-card' }, [
              h('div', { style: { fontWeight: 500, fontSize: 14, marginBottom: 8 } }, '当前博客画像索引'),
              h('div', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12, lineHeight: 1.6, marginBottom: 10 } }, [
                h('div', null, `已探测博文篇数: ${state?.profile?.articleCount || 0} 篇`),
                h('div', null, `草稿总数: ${state?.drafts?.length || 0} 篇`)
              ]),
              (state?.profile?.tags || []).length > 0 && h('div', { style: { marginBottom: 8 } }, [
                h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 } }, '标签体系 (Tags):'),
                h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
                  state.profile.tags.map(t => h('span', { key: t, className: 'hs-tag' }, t))
                )
              ]),
              (state?.profile?.keywords || []).length > 0 && h('div', null, [
                h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 } }, '重点关键词 (Keywords):'),
                h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
                  state.profile.keywords.map(k => h('span', { key: k, className: 'hs-tag', style: { borderColor: 'rgba(77, 182, 160, 0.4)' } }, k))
                )
              ])
            ]),

            // 5. 底部操作按钮栏
            h('div', { style: { display: 'flex', gap: 10, justifyContent: 'flex-start', alignItems: 'center', marginTop: 14, marginBottom: 20 } }, [
              h('button', {
                className: 'hs-btn primary',
                disabled: savingConfig,
                onClick: handleSaveConfig
              }, savingConfig ? '正在保存...' : '保存博客与系统配置'),
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
                  showToast('已刷新博客数据');
                }
              }, '重新探测博客数据')
            ])
          ])
        ]),

        // 浮动 Toast 通知
        toast && h('div', {
          className: `hs-toast ${toast.isError ? 'err' : ''}`,
          key: 'toast'
        }, toast.message)
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

      // 2. 注册主视图 (main keyed slot)，兼容注册 dsh-hotspot 与 hotspot
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
