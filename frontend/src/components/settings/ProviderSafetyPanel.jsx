/**
 * Provider Safety Panel
 *
 * 列出最近的 provider 安全/拒绝/敏感/过滤/截断信号；支持按 provider、severity、
 * signalName 过滤；点击行展开 raw provider meta；不展示原文。
 */
import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  listProviderSafetyEvents,
  getProviderSafetyStats,
  subscribeProviderSafetySignals,
} from '../../core/api/provider-safety-events.js';
import { log } from '../../core/utils/logger.js';

const SEVERITY_OPTIONS = [
  { value: '', label: '全部严重度' },
  { value: 'critical', label: '关键' },
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
  { value: 'info', label: '提示' },
];

function formatTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch { return iso; }
}

function MetaTable({ event }) {
  const rows = [];
  if (event.rawFinishReason) rows.push(['finish_reason', event.rawFinishReason]);
  if (event.nativeFinishReason) rows.push(['native_finish_reason', event.nativeFinishReason]);
  if (event.stopReason) rows.push(['stop_reason', event.stopReason]);
  if (event.providerErrorCode) rows.push(['error.code', event.providerErrorCode]);
  if (event.providerErrorType) rows.push(['error.type', event.providerErrorType]);
  if (event.chunkIndex != null) rows.push(['chunk_index', event.chunkIndex]);
  if (event.emittedCharsBeforeTrigger != null) rows.push(['emitted_chars_before_trigger', event.emittedCharsBeforeTrigger]);
  return (
    <dl className="we-provider-safety-row__meta-list">
      {rows.map(([k, v]) => (
        <div key={k} className="we-provider-safety-row__meta-item">
          <dt>{k}</dt><dd>{String(v)}</dd>
        </div>
      ))}
      {event.contentFilter && (
        <div className="we-provider-safety-row__meta-item we-provider-safety-row__meta-item--wide">
          <dt>contentFilter</dt>
          <dd><pre className="we-provider-safety-row__json">{JSON.stringify(event.contentFilter, null, 2)}</pre></dd>
        </div>
      )}
      {event.geminiSafetyRatings && (
        <div className="we-provider-safety-row__meta-item we-provider-safety-row__meta-item--wide">
          <dt>safetyRatings</dt>
          <dd><pre className="we-provider-safety-row__json">{JSON.stringify(event.geminiSafetyRatings, null, 2)}</pre></dd>
        </div>
      )}
      {event.geminiPromptFeedback && (
        <div className="we-provider-safety-row__meta-item we-provider-safety-row__meta-item--wide">
          <dt>promptFeedback</dt>
          <dd><pre className="we-provider-safety-row__json">{JSON.stringify(event.geminiPromptFeedback, null, 2)}</pre></dd>
        </div>
      )}
      {event.minimaxSensitiveMeta && (
        <div className="we-provider-safety-row__meta-item we-provider-safety-row__meta-item--wide">
          <dt>minimax sensitive</dt>
          <dd><pre className="we-provider-safety-row__json">{JSON.stringify(event.minimaxSensitiveMeta, null, 2)}</pre></dd>
        </div>
      )}
      {event.stopDetails && (
        <div className="we-provider-safety-row__meta-item we-provider-safety-row__meta-item--wide">
          <dt>stop_details</dt>
          <dd><pre className="we-provider-safety-row__json">{JSON.stringify(event.stopDetails, null, 2)}</pre></dd>
        </div>
      )}
    </dl>
  );
}

export default function ProviderSafetyPanel() {
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [providerFilter, setProviderFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [signalFilter, setSignalFilter] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());

  const filters = useMemo(() => ({
    provider: providerFilter || undefined,
    severity: severityFilter || undefined,
    signalName: signalFilter || undefined,
    limit: 50,
  }), [providerFilter, severityFilter, signalFilter]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, agg] = await Promise.all([
        listProviderSafetyEvents(filters),
        getProviderSafetyStats(filters),
      ]);
      setEvents(list?.items || []);
      setStats(agg || null);
    } catch (err) {
      setError(err.message || '加载失败');
      log.error('provider-safety.load_failed', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    // 异步首次拉取 + 订阅外部 signal bus，避免 effect body 同步 setState。
    Promise.resolve().then(() => { if (!cancelled) reload(); });
    const unsub = subscribeProviderSafetySignals(() => { if (!cancelled) reload(); });
    return () => { cancelled = true; unsub(); };
  }, [reload]);

  const providerOptions = useMemo(() => {
    const set = new Set(events.map((e) => e.provider).filter(Boolean));
    if (stats?.byProvider) Object.keys(stats.byProvider).forEach((p) => set.add(p));
    return ['', ...Array.from(set)];
  }, [events, stats]);

  const signalOptions = useMemo(() => {
    const set = new Set(events.map((e) => e.signalName).filter(Boolean));
    if (stats?.bySignal) Object.keys(stats.bySignal).forEach((p) => set.add(p));
    return ['', ...Array.from(set)];
  }, [events, stats]);

  const toggleExpand = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="we-provider-safety-panel">
      <h2 className="we-settings-section-title">Provider 安全信号</h2>
      <p className="we-provider-safety-panel__hint">
        监听 Provider 返回的安全 / 拒绝 / 敏感 / 过滤 / 截断信号。不展示原始敏感文本，只记录归一化后的元数据。
      </p>

      {stats && (
        <div className="we-provider-safety-stats" role="group" aria-label="信号汇总">
          <div className="we-provider-safety-stats__item">
            <span className="we-provider-safety-stats__num">{stats.total ?? 0}</span>
            <span className="we-provider-safety-stats__lbl">总数</span>
          </div>
          {Object.entries(stats.bySeverity || {}).map(([k, v]) => (
            <div key={k} className={`we-provider-safety-stats__item we-provider-safety-stats__item--${k}`}>
              <span className="we-provider-safety-stats__num">{v}</span>
              <span className="we-provider-safety-stats__lbl">{SEVERITY_OPTIONS.find((o) => o.value === k)?.label || k}</span>
            </div>
          ))}
        </div>
      )}

      <div className="we-provider-safety-filters">
        <label className="we-provider-safety-filter">
          <span className="we-provider-safety-filter__lbl">Provider</span>
          <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}>
            {providerOptions.map((p) => (
              <option key={p || '__all'} value={p}>{p || '全部'}</option>
            ))}
          </select>
        </label>
        <label className="we-provider-safety-filter">
          <span className="we-provider-safety-filter__lbl">严重度</span>
          <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
            {SEVERITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="we-provider-safety-filter">
          <span className="we-provider-safety-filter__lbl">Signal</span>
          <select value={signalFilter} onChange={(e) => setSignalFilter(e.target.value)}>
            {signalOptions.map((p) => (
              <option key={p || '__all'} value={p}>{p || '全部'}</option>
            ))}
          </select>
        </label>
        <button type="button" className="we-provider-safety-refresh" onClick={reload} disabled={loading}>
          {loading ? '加载中…' : '刷新'}
        </button>
      </div>

      {error && (
        <p role="alert" className="we-provider-safety-panel__error">{error}</p>
      )}

      {!loading && events.length === 0 ? (
        <div className="we-provider-safety-panel__empty">暂无信号记录。</div>
      ) : (
        <ul className="we-provider-safety-list" aria-label="信号列表">
          {events.map((e) => {
            const open = expanded.has(e.id);
            return (
              <li
                key={e.id}
                className={`we-provider-safety-row we-provider-safety-row--${e.severity || 'unknown'}`}
              >
                <button
                  type="button"
                  className="we-provider-safety-row__head"
                  aria-expanded={open}
                  onClick={() => toggleExpand(e.id)}
                >
                  <span className={`we-provider-safety-row__sev we-provider-safety-row__sev--${e.severity}`}>
                    {SEVERITY_OPTIONS.find((o) => o.value === e.severity)?.label || e.severity}
                  </span>
                  <span className="we-provider-safety-row__name">{e.signalName}</span>
                  <span className="we-provider-safety-row__provider">{e.provider}{e.model ? ` / ${e.model}` : ''}</span>
                  <span className="we-provider-safety-row__phase">{e.phase}</span>
                  <span className="we-provider-safety-row__time">{formatTime(e.createdAt)}</span>
                  <span className="we-provider-safety-row__caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
                </button>
                {open && (
                  <div className="we-provider-safety-row__body">
                    <MetaTable event={e} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
