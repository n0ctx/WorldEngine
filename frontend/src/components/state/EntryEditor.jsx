import { useState } from 'react';
import { createWorldEntry, updateEntry } from '../../api/prompt-entries';

const POSITION_OPTIONS = [
  { value: 'system', label: '系统提示词' },
  { value: 'post', label: '后置提示词' },
];

export default function EntryEditor({ worldId, entry, defaultTriggerType, onClose, onSave }) {
  const isNew = !entry?.id;
  const [form, setForm] = useState({
    title: entry?.title ?? '',
    content: entry?.content ?? '',
    description: entry?.description ?? '',
    keywords: entry?.keywords ? entry.keywords.join(', ') : '',
    position: entry?.position ?? 'system',
    trigger_type: entry?.trigger_type ?? defaultTriggerType ?? 'always',
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    const data = {
      title: form.title.trim(),
      content: form.content,
      description: form.description,
      keywords: form.trigger_type === 'keyword'
        ? form.keywords.split(',').map((k) => k.trim()).filter(Boolean)
        : null,
      position: form.position,
      trigger_type: form.trigger_type,
    };
    try {
      if (isNew) {
        await createWorldEntry(worldId, data);
      } else {
        await updateEntry('world', entry.id, data);
      }
      onSave();
    } finally {
      setSaving(false);
    }
  }

  const fieldStyle = {
    width: '100%',
    padding: '6px 10px',
    fontFamily: 'var(--we-font-serif)',
    fontSize: '13px',
    background: 'var(--we-paper-base)',
    border: '1px solid var(--we-paper-shadow)',
    borderRadius: 'var(--we-radius-sm)',
    color: 'var(--we-ink-primary)',
    boxSizing: 'border-box',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)',
    }}>
      <div style={{
        background: 'var(--we-paper-base)',
        border: '1px solid var(--we-paper-shadow)',
        borderRadius: 'var(--we-radius)',
        width: '100%',
        maxWidth: '520px',
        padding: '24px',
        maxHeight: '80vh',
        overflowY: 'auto',
      }}>
        <h3 style={{
          fontFamily: 'var(--we-font-display)',
          fontSize: '16px',
          color: 'var(--we-ink-primary)',
          fontStyle: 'italic',
          marginBottom: '16px',
        }}>
          {isNew ? '新建条目' : '编辑条目'}
        </h3>

        {/* 标题 */}
        <label style={{ display: 'block', fontSize: '12px', color: 'var(--we-ink-secondary)', marginBottom: '4px' }}>标题</label>
        <input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          style={{ ...fieldStyle, marginBottom: '12px' }}
        />

        {/* 内容 */}
        <label style={{ display: 'block', fontSize: '12px', color: 'var(--we-ink-secondary)', marginBottom: '4px' }}>内容</label>
        <textarea
          value={form.content}
          onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
          rows={4}
          style={{ ...fieldStyle, resize: 'vertical', marginBottom: '12px' }}
        />

        {/* 关键词（仅 keyword 类型） */}
        {form.trigger_type === 'keyword' && (
          <>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--we-ink-secondary)', marginBottom: '4px' }}>触发关键词（逗号分隔）</label>
            <input
              value={form.keywords}
              onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
              placeholder="如：暗影帮, 影堂, 黑市"
              style={{ ...fieldStyle, marginBottom: '12px' }}
            />
          </>
        )}

        {/* 触发描述（仅 llm 类型） */}
        {form.trigger_type === 'llm' && (
          <>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--we-ink-secondary)', marginBottom: '4px' }}>触发条件描述（供 AI 判断）</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              style={{ ...fieldStyle, resize: 'vertical', marginBottom: '12px' }}
            />
          </>
        )}

        {/* 注入位置 */}
        <label style={{ display: 'block', fontSize: '12px', color: 'var(--we-ink-secondary)', marginBottom: '4px' }}>注入位置</label>
        <select
          value={form.position}
          onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
          style={{ ...fieldStyle, marginBottom: '16px' }}
        >
          {POSITION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* 按钮 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            onClick={onClose}
            style={{ fontSize: '13px', color: 'var(--we-ink-faded)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--we-font-serif)' }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.title.trim()}
            style={{
              fontFamily: 'var(--we-font-serif)',
              fontSize: '13px',
              background: 'var(--we-vermilion)',
              color: 'var(--we-paper-base)',
              border: 'none',
              borderRadius: 'var(--we-radius-sm)',
              padding: '6px 16px',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
