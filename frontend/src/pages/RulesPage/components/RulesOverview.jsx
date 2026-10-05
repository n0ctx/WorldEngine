import Badge from '../../../components/ui/Badge.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import SectionTitle from '../../../components/ui/SectionTitle.jsx';
import { FIELD_SCOPE_KEYS, SCOPES, TRIGGER_LABEL } from '../constants.js';

// ── 右栏空态：下一轮会发给 AI 的内容——
//    挑选口径与后端拼提示词一致（backend/prompts/segments.js）：只发启用且有正文的条目；
//    一直生效的每轮都发（常驻缓存的在前），其余三类满足条件才发；状态字段只发有值的 ──
export default function RulesOverview({ entries, fieldsByScope, hint }) {
  const sendable = entries.filter((e) => e.enabled !== 0 && e.content);
  const always = sendable
    .filter((e) => e.trigger_type === 'always')
    .sort((a, b) => ((a.token ?? 1) - (b.token ?? 1)) || ((a.sort_order ?? 0) - (b.sort_order ?? 0)));
  const conditional = sendable
    .filter((e) => e.trigger_type !== 'always')
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const unsentCount = entries.length - sendable.length;

  return (
    <div className="we-workshop-detail-inner we-rules-overview we-on-shell">
      <div className="we-workshop-section">
        <SectionTitle level="group">下一轮会发给 AI 的内容</SectionTitle>
        <p className="we-rules-overview-note">
          只算这一页管理的设定和状态；角色人设、玩家设定、全局提示词和剧情记忆也会一起发。
        </p>
      </div>

      <div className="we-workshop-section">
        <SectionTitle level="eyebrow">每轮都发</SectionTitle>
        {always.length > 0 ? (
          <ol className="we-rules-overview-order">
            {always.map((e) => <li key={e.id}><span>{e.title || '（无标题）'}</span></li>)}
          </ol>
        ) : (
          <p className="we-rules-overview-note">还没有「一直生效」的设定条目，AI 不知道这个世界的前提。</p>
        )}
      </div>

      {conditional.length > 0 && (
        <div className="we-workshop-section">
          <SectionTitle level="eyebrow">满足条件时才发</SectionTitle>
          <ul className="we-rules-overview-order we-rules-overview-order--plain">
            {conditional.map((e) => (
              <li key={e.id}>
                <Badge>{TRIGGER_LABEL[e.trigger_type]}</Badge>
                <span>{e.title || '（无标题）'}</span>
                {e.trigger_type === 'keyword' && e.keywords?.length > 0 && (
                  <span className="we-rules-overview-note">{e.keywords.join('、')}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="we-workshop-section">
        <SectionTitle level="eyebrow">状态</SectionTitle>
        <p className="we-rules-overview-note">
          有值的状态字段每轮附上当前值：
          {FIELD_SCOPE_KEYS.map((k) => `${SCOPES[k].label} ${fieldsByScope[k].length} 项`).join(' · ')}
        </p>
      </div>

      {unsentCount > 0 && (
        <p className="we-rules-overview-note">另有 {unsentCount} 条已禁用或没有正文，不会发。</p>
      )}

      <EmptyState size="sm" title={hint} />
    </div>
  );
}
