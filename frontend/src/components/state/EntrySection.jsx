import { useState } from 'react';
import EntryEditor from './EntryEditor';
import { deleteWorldEntry } from '../../api/prompt-entries';
import ConfirmModal from '../ui/ConfirmModal.jsx';

export default function EntrySection({ title, icon, desc, triggerType, entries, worldId, onRefresh }) {
  const [editing, setEditing] = useState(null); // null=关闭, {}=新建, entry=编辑
  const [confirmingDeleteEntry, setConfirmingDeleteEntry] = useState(null); // null or entry object

  async function handleDelete() {
    try {
      await deleteWorldEntry(confirmingDeleteEntry.id);
      setConfirmingDeleteEntry(null);
      onRefresh();
    } catch (e) {
      // TODO: showToast 为页级函数，此处暂用 alert；待全局 toast 服务建立后替换
      alert('删除失败：' + (e?.message || '未知错误'));
    }
  }

  return (
    <div className="we-entry-section">
      {/* 标题行：icon + title + desc + "新建"按钮 */}
      <div className="we-entry-section-header">
        <div>
          <span className="we-entry-section-icon">{icon}</span>
          <span className="we-entry-section-title">
            {title}
          </span>
          <p className="we-entry-section-desc">
            {desc}
          </p>
        </div>
        <button
          onClick={() => setEditing({})}
          className="we-entry-section-new-btn"
        >
          + 新建
        </button>
      </div>

      {/* 条目列表 */}
      <div className="we-entry-section-list">
        {entries.map((entry, i) => (
          <div
            key={entry.id}
            className={`we-entry-section-row${i < entries.length - 1 ? '' : ' we-entry-section-row--last'}`}
          >
            <div className="we-entry-section-main">
              <span className="we-entry-section-name">
                {entry.title}
              </span>
              {triggerType === 'keyword' && entry.keywords?.length > 0 && (
                <span className="we-entry-section-keywords">
                  触发词：{entry.keywords.slice(0, 3).join(' / ')}{entry.keywords.length > 3 ? '…' : ''}
                </span>
              )}
            </div>
            <div className="we-entry-section-actions">
              <button
                onClick={() => setEditing(entry)}
                className="we-entry-section-action"
              >
                编辑
              </button>
              <button
                onClick={() => setConfirmingDeleteEntry(entry)}
                className="we-entry-section-action we-entry-section-action--danger"
              >
                删除
              </button>
            </div>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="we-entry-section-empty">
            暂无条目
          </div>
        )}
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
