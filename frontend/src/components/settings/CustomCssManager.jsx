import { useState, useEffect, useRef, useCallback } from 'react';
import {
  listSnippets, createSnippet, updateSnippet, deleteSnippet,
  reorderSnippets, refreshCustomCss,
} from '../../api/custom-css-snippets';
import { useAppModeStore } from '../../store/appMode';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import { SETTINGS_MODE } from './SettingsConstants';
import { pushErrorToast } from '../../utils/toast';

const CSS_REFERENCE_EXAMPLE = `/* ✅ 推荐：改变量协调换肤 */
:root {
  --we-paper-base: #e8dcc8;
  --we-vermilion: #8b2e24;
}

/* ✅ 推荐：改消息样式 */
.we-message-assistant .we-message-content {
  font-size: 18px;
  line-height: 2;
}

/* ✅ 推荐：改用户消息边线颜色 */
.we-message-user { border-left-color: #4a7c8b; }

/* ⚠️  注意：骨架类名可能随版本变化 */
.we-book-spine { ... }`;

export default function CustomCssManager({ settingsMode = SETTINGS_MODE.CHAT }) {
  const [snippets, setSnippets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const dragIdx = useRef(null);
  const appMode = useAppModeStore((s) => s.appMode);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSnippets(await listSnippets({ mode: settingsMode }));
    } finally {
      setLoading(false);
    }
  }, [settingsMode]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(data) {
    if (editingSnippet) {
      await updateSnippet(editingSnippet.id, data);
    } else {
      await createSnippet({ ...data, mode: settingsMode });
    }
    await load();
    await refreshCustomCss(appMode);
  }

  async function handleToggle(snippet) {
    await updateSnippet(snippet.id, { enabled: snippet.enabled ? 0 : 1 });
    await load();
    await refreshCustomCss(appMode);
  }

  async function handleDelete(id) {
    await deleteSnippet(id);
    setDeletingId(null);
    await load();
    await refreshCustomCss(appMode);
  }

  function handleDragStart(idx) { dragIdx.current = idx; }

  function handleDragOver(e, idx) {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === idx) return;
    const next = [...snippets];
    const [moved] = next.splice(dragIdx.current, 1);
    next.splice(idx, 0, moved);
    dragIdx.current = idx;
    setSnippets(next);
  }

  async function handleDragEnd() {
    dragIdx.current = null;
    const items = snippets.map((s, i) => ({ id: s.id, sort_order: i }));
    await reorderSnippets(items);
    await refreshCustomCss(appMode);
  }

  return (
    <div>
      {/* 推荐选择器参考（可折叠） */}
      <div className="we-css-reference">
        <details>
          <summary>推荐选择器参考</summary>
          <div className="we-css-reference-body">
            <pre className="we-css-reference-code">{CSS_REFERENCE_EXAMPLE}</pre>
            <p className="we-css-reference-note">
              稳定锚点类名清单见 DESIGN.md §10.2，标 ⚠️ 的类名可能随版本变化请谨慎。
            </p>
          </div>
        </details>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ fontFamily: 'var(--we-font-display)', fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--we-ink-faded)' }}>
          自定义 CSS 片段
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setEditingSnippet(null); setShowEditor(true); }}
        >
          + 添加
        </Button>
      </div>

      {loading ? (
        <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '13px', color: 'var(--we-ink-faded)', fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
          加载中…
        </p>
      ) : snippets.length === 0 ? (
        <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '13px', color: 'var(--we-ink-faded)', fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
          暂无 CSS 片段
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {snippets.map((s, idx) => (
            <SnippetRow
              key={s.id}
              snippet={s}
              onEdit={() => { setEditingSnippet(s); setShowEditor(true); }}
              onToggle={() => handleToggle(s)}
              onDelete={() => setDeletingId(s.id)}
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}

      {showEditor && (
        <SnippetEditor
          snippet={editingSnippet}
          onSave={handleSave}
          onClose={() => setShowEditor(false)}
        />
      )}

      {deletingId && (
        <DeleteConfirm
          onConfirm={() => handleDelete(deletingId)}
          onClose={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}

function SnippetRow({ snippet, onEdit, onToggle, onDelete, onDragStart, onDragOver, onDragEnd }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className="group"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'var(--we-paper-aged)',
        border: '1px solid var(--we-paper-shadow)',
        padding: '8px 12px',
        cursor: 'grab',
        userSelect: 'none',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--we-ink-faded)'}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--we-paper-shadow)'}
    >
      <span style={{ color: 'var(--we-ink-faded)', fontSize: '12px', flexShrink: 0, opacity: 0.5 }}>⠿</span>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontFamily: 'var(--we-font-serif)', fontSize: '14px', color: 'var(--we-ink-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {snippet.name}
        </span>
        {snippet.content && (
          <span style={{ fontFamily: 'Courier New, monospace', fontSize: '11px', color: 'var(--we-ink-faded)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {snippet.content.trim().slice(0, 40)}{snippet.content.trim().length > 40 ? '…' : ''}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
        <button
          onClick={onToggle}
          title={snippet.enabled ? '点击禁用' : '点击启用'}
          style={{
            fontFamily: 'var(--we-font-serif)',
            fontSize: '11px',
            padding: '2px 8px',
            border: `1px solid ${snippet.enabled ? 'var(--we-vermilion)' : 'var(--we-paper-shadow)'}`,
            color: snippet.enabled ? 'var(--we-vermilion)' : 'var(--we-ink-faded)',
            background: snippet.enabled ? 'var(--we-vermilion-bg)' : 'transparent',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {snippet.enabled ? '启用' : '禁用'}
        </button>
        <button
          onClick={onEdit}
          title="编辑"
          style={{
            width: '24px', height: '24px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none',
            color: 'var(--we-ink-faded)', cursor: 'pointer', fontSize: '12px',
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--we-ink-primary)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--we-ink-faded)'}
        >✎</button>
        <button
          onClick={onDelete}
          title="删除"
          style={{
            width: '24px', height: '24px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none',
            color: 'var(--we-ink-faded)', cursor: 'pointer', fontSize: '12px',
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--we-vermilion)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--we-ink-faded)'}
        >✕</button>
      </div>
    </div>
  );
}

function SnippetEditor({ snippet, onSave, onClose }) {
  const [name, setName] = useState(snippet?.name ?? '');
  const [content, setContent] = useState(snippet?.content ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), content });
      onClose();
    } catch (err) {
      pushErrorToast(`保存失败：${err.message}`);
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--we-color-bg-overlay)' }}>
      <div style={{
        background: 'var(--we-paper-base)',
        border: '1px solid var(--we-paper-shadow)',
        borderRadius: 'var(--we-radius-sm)',
        boxShadow: '0 16px 48px var(--we-color-shadow-xl)',
        width: '100%',
        maxWidth: '640px',
        margin: '0 16px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}>
        <h2 style={{ fontFamily: 'var(--we-font-display)', fontSize: '18px', fontStyle: 'italic', fontWeight: 300, color: 'var(--we-ink-primary)', margin: 0 }}>
          {snippet ? '编辑 CSS 片段' : '新建 CSS 片段'}
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="we-edit-label">片段名称</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：消息气泡样式"
              autoFocus
            />
          </div>

          <div>
            <label className="we-edit-label">CSS 内容</label>
            <Textarea
              rows={12}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder=".message-bubble { background: #fff; }"
              spellCheck={false}
              style={{ fontFamily: 'Courier New, monospace', resize: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '4px' }}>
            <Button variant="ghost" type="button" onClick={onClose}>取消</Button>
            <Button variant="primary" type="submit" disabled={saving || !name.trim()}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirm({ onConfirm, onClose }) {
  const [deleting, setDeleting] = useState(false);
  async function handle() {
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--we-color-bg-overlay)' }}>
      <div style={{
        background: 'var(--we-paper-base)',
        border: '1px solid var(--we-paper-shadow)',
        borderRadius: 'var(--we-radius-sm)',
        boxShadow: '0 16px 48px var(--we-color-shadow-xl)',
        width: '100%',
        maxWidth: '360px',
        margin: '0 16px',
        padding: '24px',
      }}>
        <h2 style={{ fontFamily: 'var(--we-font-display)', fontSize: '18px', fontStyle: 'italic', fontWeight: 300, color: 'var(--we-ink-primary)', margin: '0 0 8px' }}>
          确认删除
        </h2>
        <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '13px', color: 'var(--we-vermilion)', margin: '0 0 20px' }}>
          此操作无法撤销。
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button variant="danger" onClick={handle} disabled={deleting}>
            {deleting ? '删除中…' : '确认删除'}
          </Button>
        </div>
      </div>
    </div>
  );
}
