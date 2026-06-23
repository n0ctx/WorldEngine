/**
 * Provider Safety Banner
 *
 * 订阅全局 provider safety signal bus，在聊天/写作主区底部展示当前一条
 * "Provider 安全机制已触发" 的提示。
 *
 *   - role="alert" 朗读
 *   - 严重度 critical/high/medium/low/info 映射到 we-* status token 配色
 *   - 不展示原始敏感文本，只展示 provider/model/signal/phase
 *   - 点击 toggle 详情；点击关闭按钮显式 dismiss
 */
import { useEffect, useState, useMemo } from 'react';
import { subscribeProviderSafetySignals } from '../../core/api/provider-safety-events.js';

const SEVERITY_LABEL = {
  critical: '关键',
  high: '高',
  medium: '中',
  low: '低',
  info: '提示',
  unknown: '未知',
};

const FAMILY_LABEL = {
  safety: 'Provider 安全机制',
  refusal: 'Provider 拒绝回答',
  sensitive: 'Provider 敏感判定',
  content_filter: 'Provider 内容过滤',
  provider_error: 'Provider 错误',
  policy: 'Provider 政策提醒',
  operational: 'Provider 运行信号',
  unknown: 'Provider 信号',
};

function severityModifier(sev) {
  return `we-provider-safety-banner--${sev || 'unknown'}`;
}

export default function ProviderSafetyBanner() {
  const [signal, setSignal] = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    return subscribeProviderSafetySignals((s) => {
      setSignal(s);
      setExpanded(false);
    });
  }, []);

  const details = useMemo(() => {
    if (!signal) return [];
    const rows = [
      ['Provider', signal.provider],
      ['Model', signal.model],
      ['Signal', signal.signalName],
      ['Stage', signal.phase],
      ['Severity', SEVERITY_LABEL[signal.severity] || signal.severity],
      ['Action', signal.action],
    ];
    if (signal.rawFinishReason) rows.push(['finish_reason', signal.rawFinishReason]);
    if (signal.nativeFinishReason) rows.push(['native_finish_reason', signal.nativeFinishReason]);
    if (signal.stopReason) rows.push(['stop_reason', signal.stopReason]);
    if (signal.providerErrorCode) rows.push(['error.code', signal.providerErrorCode]);
    return rows.filter(([, v]) => v != null && v !== '');
  }, [signal]);

  if (!signal) return null;

  const title = FAMILY_LABEL[signal.signalFamily] || FAMILY_LABEL.unknown;
  const stopped = signal.action === 'stream_stopped_by_provider' || signal.action === 'response_omitted_by_provider' || signal.action === 'request_blocked_by_provider';

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`we-provider-safety-banner ${severityModifier(signal.severity)}`}
    >
      <div className="we-provider-safety-banner__head">
        <span className="we-provider-safety-banner__dot" aria-hidden="true" />
        <div className="we-provider-safety-banner__title-block">
          <div className="we-provider-safety-banner__title">{title} 已触发</div>
          <div className="we-provider-safety-banner__subtitle">
            {stopped ? '生成已由上游停止。' : '已记录到诊断面板。'}
            <span className="we-provider-safety-banner__sep">·</span>
            {signal.provider}
            {signal.model ? ` / ${signal.model}` : ''}
            <span className="we-provider-safety-banner__sep">·</span>
            {signal.signalName}
          </div>
        </div>
        <button
          type="button"
          className="we-provider-safety-banner__btn"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? '收起' : '详情'}
        </button>
        <button
          type="button"
          className="we-provider-safety-banner__close"
          aria-label="关闭安全信号提示"
          onClick={() => setSignal(null)}
        >
          ×
        </button>
      </div>
      {expanded && (
        <dl className="we-provider-safety-banner__details">
          {details.map(([k, v]) => (
            <div key={k} className="we-provider-safety-banner__row">
              <dt className="we-provider-safety-banner__key">{k}</dt>
              <dd className="we-provider-safety-banner__val">{String(v)}</dd>
            </div>
          ))}
          <div className="we-provider-safety-banner__row we-provider-safety-banner__row--evt-id">
            <dt className="we-provider-safety-banner__key">Event ID</dt>
            <dd className="we-provider-safety-banner__val">{signal.id}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
