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
    <div style={{ marginBottom: '28px' }}>
      {/* 标题行：icon + title + desc + "新建"按钮 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <div>
          <span style={{ fontSize: '16px', marginRight: '6px', color: 'var(--we-vermilion)' }}>{icon}</span>
          <span style={{
            fontFamily: 'var(--we-font-display)',
            fontSize: '16px',
            color: 'var(--we-paper-base)',
            fontStyle: 'italic',
          }}>
            {title}
          </span>
          <p style={{ fontSize: '13px', color: 'var(--we-paper-shadow)', marginTop: '2px', marginLeft: '22px' }}>
            {desc}
          </p>
        </div>
        <button
          onClick={() => setEditing({})}
          style={{
            fontFamily: 'var(--we-font-serif)',
            fontSize: '13px',
            color: 'var(--we-vermilion)',
            background: 'none',
            border: '1px solid var(--we-vermilion)',
            borderRadius: 'var(--we-radius-sm)',
            padding: '4px 12px',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          + 新建
        </button>
      </div>

      {/* 条目列表 */}
      <div style={{
        border: '1px solid var(--we-paper-shadow)',
        borderRadius: 'var(--we-radius)',
        overflow: 'hidden',
      }}>
        {entries.map((entry, i) => (
          <div key={entry.id} style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderBottom: i < entries.length - 1 ? '1px solid var(--we-paper-shadow)' : 'none',
            background: 'var(--we-paper-base)',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontFamily: 'var(--we-font-serif)', fontSize: '14px', color: 'var(--we-ink-primary)' }}>
                {entry.title}
              </span>
              <span style={{
                marginLeft: '8px',
                fontSize: '11px',
                color: 'var(--we-ink-faded)',
                background: 'var(--we-paper-shadow)',
                borderRadius: '4px',
                padding: '1px 6px',
              }}>
                {entry.position === 'system' ? '系统提示词' : '后置提示词'}
              </span>
              {triggerType === 'keyword' && entry.keywords?.length > 0 && (
                <span style={{ marginLeft: '6px', fontSize: '12px', color: 'var(--we-ink-secondary)' }}>
                  触发词：{entry.keywords.slice(0, 3).join(' / ')}{entry.keywords.length > 3 ? '…' : ''}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              <button
                onClick={() => setEditing(entry)}
                style={{ fontSize: '12px', color: 'var(--we-ink-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                编辑
              </button>
              <button
                onClick={() => setConfirmingDeleteEntry(entry)}
                style={{ fontSize: '12px', color: 'var(--we-vermilion)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                删除
              </button>
            </div>
          </div>
        ))}
        {entries.length === 0 && (
          <div style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: 'var(--we-ink-faded)', background: 'var(--we-paper-base)' }}>
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
