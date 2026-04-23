import { useState } from 'react';
import { createWorldEntry, updateWorldEntry } from '../../api/prompt-entries';
import MarkdownEditor from '../ui/MarkdownEditor';

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
        await updateWorldEntry(entry.id, data);
      }
      onSave();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="we-entry-editor-overlay" onClick={onClose}>
      <div
        className="we-entry-editor-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="we-entry-editor-title">
          {isNew ? '新建条目' : '编辑条目'}
        </h3>

        {/* 标题 */}
        <label className="we-entry-editor-label">标题</label>
        <input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          className="we-entry-editor-field we-entry-editor-field-mb"
        />

        {/* 内容 */}
        <label className="we-entry-editor-label">内容</label>
        <div className="we-entry-editor-content-wrap">
          <MarkdownEditor
            value={form.content}
            onChange={(md) => setForm((f) => ({ ...f, content: md }))}
            placeholder="条目内容…"
            minHeight={120}
          />
        </div>

        {/* 关键词（仅 keyword 类型） */}
        {form.trigger_type === 'keyword' && (
          <>
            <label className="we-entry-editor-label">触发关键词（逗号分隔）</label>
            <input
              value={form.keywords}
              onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
              placeholder="如：暗影帮, 影堂, 黑市"
              className="we-entry-editor-field we-entry-editor-field-mb"
            />
          </>
        )}

        {/* 触发描述（仅 llm 类型） */}
        {form.trigger_type === 'llm' && (
          <>
            <label className="we-entry-editor-label">触发条件描述（供 AI 判断）</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="we-entry-editor-field we-entry-editor-field-mb we-entry-editor-field--resizable"
            />
          </>
        )}

        {/* 注入位置 */}
        <label className="we-entry-editor-label">注入位置</label>
        <select
          value={form.position}
          onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
          className="we-entry-editor-select"
        >
          {POSITION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* 按钮 */}
        <div className="we-entry-editor-footer">
          <button onClick={onClose} className="we-entry-editor-cancel">
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.title.trim()}
            className="we-entry-editor-save"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
