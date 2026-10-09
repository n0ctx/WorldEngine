import Badge from '../../../components/ui/Badge.jsx';
import Card from '../../../components/ui/Card.jsx';
import DragHandle from '../../../components/ui/DragHandle.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import SortableList from '../../../components/ui/SortableList.jsx';
import ToggleSwitch from '../../../components/ui/ToggleSwitch.jsx';
import DeleteButton from '../../../components/motion/DeleteButton.jsx';
import { TRIGGER_LABEL } from '../constants.js';

// ── 设定条目：普通列表（按机制筛选，不可拖拽——sort_order 是跨类型的全局顺序，
//    筛选后的子集内拖拽会破坏真实顺序，拖拽排序统一放到「调整顺序」视图里做）──
export function EntryPlainList({ entries, selectedId, onSelect, onToggle, onDelete }) {
  if (entries.length === 0) {
    return <EmptyState size="sm" title="暂无条目" />;
  }
  return (
    <div className="we-entry-section-list" data-testid="entry-list">
      {entries.map((entry) => (
        <Card
          key={entry.id}
          variant="outlined"
          density="compact"
          interactive
          selected={entry.id === selectedId}
          role="button"
          tabIndex={0}
          data-trigger={entry.trigger_type}
          className={`we-entry-section-row${entry.enabled === 0 ? ' we-entry-section-row--disabled' : ''}`}
          onClick={() => onSelect(entry)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(entry); } }}
        >
          <div className="we-entry-section-main">
            <div className="we-entry-section-title-line">
              <span className="we-entry-section-name">{entry.title || '（无标题）'}</span>
              <Badge>{TRIGGER_LABEL[entry.trigger_type]}</Badge>
              {entry.trigger_type === 'always' && entry.token === 0 && entry.enabled !== 0 && (
                <Badge title="此条目进入 prompt 缓存前缀，稳定不变以提高缓存命中率">已缓存</Badge>
              )}
              {entry.trigger_type === 'keyword' && entry.active_turns === 0 && entry.enabled !== 0 && (
                <Badge title="命中后永久生效">永久</Badge>
              )}
            </div>
            {entry.trigger_type === 'keyword' && entry.keywords?.length > 0 && (
              <span className="we-entry-section-keywords" title={entry.keywords.join(' / ')}>
                触发词：{entry.keywords.slice(0, 3).join(' / ')}{entry.keywords.length > 3 ? '…' : ''}
              </span>
            )}
          </div>
          <div className="we-entry-section-actions">
            <span onClick={(e) => e.stopPropagation()}>
              <ToggleSwitch size="sm" checked={entry.enabled !== 0} onChange={() => onToggle(entry)} label="启用条目" />
            </span>
            <DeleteButton label={`删除条目「${entry.title || '（无标题）'}」`} onConfirm={() => onDelete(entry)} />
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── 设定条目：完整注入顺序视图（跨全部 trigger_type 一起拖拽，落库到 sort_order）──
export function EntryOrderList({ entries, onReorder, onReorderEnd, onToggle }) {
  if (entries.length === 0) {
    return <EmptyState size="sm" title="暂无条目" />;
  }
  return (
    <SortableList
      items={entries}
      onReorder={onReorder}
      onReorderEnd={onReorderEnd}
      useHandle
      style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
      renderItem={(entry, dragHandleProps) => (
        <Card
          variant="outlined"
          density="compact"
          data-trigger={entry.trigger_type}
          className={`we-entry-section-row${entry.enabled === 0 ? ' we-entry-section-row--disabled' : ''}`}
        >
          <span className="we-entry-section-drag" {...dragHandleProps}><DragHandle /></span>
          <div className="we-entry-section-main">
            <div className="we-entry-section-title-line">
              <span className="we-entry-section-name">{entry.title || '（无标题）'}</span>
              <Badge>{TRIGGER_LABEL[entry.trigger_type]}</Badge>
            </div>
          </div>
          <div className="we-entry-section-actions">
            <span onClick={(e) => e.stopPropagation()}>
              <ToggleSwitch size="sm" checked={entry.enabled !== 0} onChange={() => onToggle(entry)} label="启用条目" />
            </span>
          </div>
        </Card>
      )}
    />
  );
}
