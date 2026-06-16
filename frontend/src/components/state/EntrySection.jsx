import { useState } from 'react';
import EntryEditor from './EntryEditor';
import { deleteWorldEntry, reorderWorldEntries, updateWorldEntry } from '../../core/api/prompt-entries';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import DragHandle from '../ui/DragHandle.jsx';
import SortableList from '../ui/SortableList.jsx';
import { log } from '../../core/utils/logger.js';

export default function EntrySection({ title, icon, desc, triggerType, entries, worldId, onRefresh }) {
  const [editing, setEditing] = useState(null);
  const [confirmingDeleteEntry, setConfirmingDeleteEntry] = useState(null);
  const entriesKey = entries
    .map((entry) => `${entry.id}:${entry.updated_at ?? ''}:${entry.title}:${entry.keywords?.join(',') ?? ''}`)
    .join('|');

  async function handleDelete() {
    try {
      await deleteWorldEntry(confirmingDeleteEntry.id);
      setConfirmingDeleteEntry(null);
      onRefresh();
    } catch (e) {
      log.error('entry.delete_failed', e, { toast: '删除失败：' + (e?.message || '未知错误') });
    }
  }

  return (
    <div className="we-entry-section">
      <div className="we-entry-section-header">
        <div>
          <span className="we-entry-section-icon">{icon}</span>
          <span className="we-entry-section-title">{title}</span>
          <p className="we-entry-section-desc">{desc}</p>
        </div>
        <button onClick={() => setEditing({})} className="we-entry-section-new-btn">
          + 新建
        </button>
      </div>

      <div className="we-entry-section-list">
        <EntrySortableList
          key={entriesKey}
          entries={entries}
          triggerType={triggerType}
          worldId={worldId}
          onEdit={setEditing}
          onDelete={setConfirmingDeleteEntry}
        />
      </div>

      {editing !== null && (
        <EntryEditor
          worldId={worldId}
          entry={editing?.id ? editing : null}
          defaultTriggerType={triggerType}
          onClose={() => setEditing(null)}
          onSave={() => { setEditing(null); onRefresh(); }}
        />
      )}

      {confirmingDeleteEntry && (
        <ConfirmModal
          title="删除条目"
          message={`确认删除条目「${confirmingDeleteEntry.title}」？此操作不可撤销。`}
          confirmText="删除"
          danger
          onConfirm={handleDelete}
          onClose={() => setConfirmingDeleteEntry(null)}
        />
      )}
    </div>
  );
}

function EntrySortableList({ entries, triggerType, worldId, onEdit, onDelete }) {
  const [localEntries, setLocalEntries] = useState(entries);

  async function handleReorderEnd(finalItems) {
    await reorderWorldEntries(worldId, finalItems.map((entry) => entry.id));
  }

  async function handleToggleEnabled(entry) {
    const newEnabled = entry.enabled === 0 ? 1 : 0;
    setLocalEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, enabled: newEnabled } : e));
    try {
      await updateWorldEntry(entry.id, { enabled: newEnabled });
    } catch (e) {
      setLocalEntries((prev) => prev.map((ee) => ee.id === entry.id ? { ...ee, enabled: entry.enabled } : ee));
      log.error('entry.toggle_failed', e, { toast: '切换失败：' + (e?.message || '未知错误') });
    }
  }

  if (localEntries.length === 0) {
    return <div className="we-entry-section-empty">暂无条目</div>;
  }

  return (
    <SortableList
      items={localEntries}
      onReorder={setLocalEntries}
      onReorderEnd={handleReorderEnd}
      style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
      renderItem={(entry) => (
        <div className={`we-entry-section-row${entry.enabled === 0 ? ' we-entry-section-row--disabled' : ''}`}>
          <span className="we-entry-section-drag"><DragHandle /></span>
          <div className="we-entry-section-main">
            <span className="we-entry-section-name">{entry.title}</span>
            {triggerType === 'always' && entry.token === 0 && entry.enabled !== 0 && (
              <span className="we-entry-cached-badge" title="此条目进入 CACHED LAYER">
                CACHED
              </span>
            )}
            {triggerType === 'keyword' && entry.active_turns === 0 && entry.enabled !== 0 && (
              <span className="we-entry-cached-badge" title="命中后永久生效">
                永久
              </span>
            )}
            {triggerType === 'keyword' && entry.keywords?.length > 0 && (
              <span className="we-entry-section-keywords">
                触发词：{entry.keywords.slice(0, 3).join(' / ')}{entry.keywords.length > 3 ? '…' : ''}
              </span>
            )}
          </div>
          <div className="we-entry-section-actions">
            <button
              onClick={(e) => { e.stopPropagation(); handleToggleEnabled(entry); }}
              className={`we-entry-section-toggle${entry.enabled === 0 ? ' we-entry-section-toggle--off' : ''}`}
              aria-label={entry.enabled === 0 ? '启用条目' : '禁用条目'}
              title={entry.enabled === 0 ? '已禁用，点击启用' : '点击禁用'}
            >
              <span className="we-entry-section-toggle-thumb" />
            </button>
            <button
              onClick={() => onEdit(entry)}
              className="we-entry-section-action"
            >
              编辑
            </button>
            <button
              onClick={() => onDelete(entry)}
              className="we-entry-section-action we-entry-section-action--danger"
            >
              删除
            </button>
          </div>
        </div>
      )}
    />
  );
}
