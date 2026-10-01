import Badge from '../../../components/ui/Badge.jsx';
import { FIELD_SCOPE_KEYS, SCOPES, TRIGGER_LABEL, TRIGGER_TYPES } from '../constants.js';

// ── 右栏空态：不用一句灰字占满六成屏，改为整个世界规则的概览——
//    各类型条目数、启用/禁用数、状态字段数、注入顺序前几条 ──
export default function RulesOverview({ entries, fieldsByScope, hint }) {
  const enabledCount = entries.filter((e) => e.enabled !== 0).length;
  const disabledCount = entries.length - enabledCount;
  const fieldTotal = FIELD_SCOPE_KEYS.reduce((sum, k) => sum + fieldsByScope[k].length, 0);
  const orderPreview = [...entries]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .slice(0, 5);

  return (
    <div className="we-workshop-detail-inner we-rules-overview we-on-shell">
      <div className="we-workshop-section">
        <span className="we-workshop-section-title">设定条目</span>
        <div className="we-rules-overview-stats">
          {TRIGGER_TYPES.map((t) => (
            <div key={t.key} className="we-rules-overview-stat">
              <span className="we-rules-overview-stat-value">{entries.filter((e) => e.trigger_type === t.key).length}</span>
              <span className="we-rules-overview-stat-label">{t.label}</span>
            </div>
          ))}
          <div className="we-rules-overview-stat">
            <span className="we-rules-overview-stat-value">{enabledCount}</span>
            <span className="we-rules-overview-stat-label">已启用</span>
          </div>
          <div className="we-rules-overview-stat">
            <span className="we-rules-overview-stat-value">{disabledCount}</span>
            <span className="we-rules-overview-stat-label">已禁用</span>
          </div>
        </div>
      </div>

      <div className="we-workshop-section">
        <span className="we-workshop-section-title">状态字段</span>
        <div className="we-rules-overview-stats">
          {FIELD_SCOPE_KEYS.map((k) => (
            <div key={k} className="we-rules-overview-stat">
              <span className="we-rules-overview-stat-value">{fieldsByScope[k].length}</span>
              <span className="we-rules-overview-stat-label">{SCOPES[k].label}</span>
            </div>
          ))}
          <div className="we-rules-overview-stat">
            <span className="we-rules-overview-stat-value">{fieldTotal}</span>
            <span className="we-rules-overview-stat-label">合计</span>
          </div>
        </div>
      </div>

      {orderPreview.length > 0 && (
        <div className="we-workshop-section">
          <span className="we-workshop-section-title">注入顺序（前 {orderPreview.length} 条）</span>
          <ol className="we-rules-overview-order">
            {orderPreview.map((e) => (
              <li key={e.id} className={e.enabled === 0 ? 'is-disabled' : undefined}>
                <Badge>{TRIGGER_LABEL[e.trigger_type]}</Badge>
                <span>{e.title || '（无标题）'}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="we-workshop-empty">{hint}</p>
    </div>
  );
}
