import { useState, useEffect, useRef } from 'react';
import {
  listSnippets, createSnippet, updateSnippet, deleteSnippet,
  reorderSnippets, refreshCustomCss,
} from '../../api/customCssSnippets';

export default function CustomCssManager() {
  const [snippets, setSnippets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const dragIdx = useRef(null);

  async function load() {
    setLoading(true);
    try {
      setSnippets(await listSnippets());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave(data) {
    if (editingSnippet) {
      await updateSnippet(editingSnippet.id, data);
    } else {
      await createSnippet(data);
    }
    await load();
    await refreshCustomCss();
  }

  async function handleToggle(snippet) {
    await updateSnippet(snippet.id, { enabled: snippet.enabled ? 0 : 1 });
    await load();
    await refreshCustomCss();
  }

  async function handleDelete(id) {
    await deleteSnippet(id);
    setDeletingId(null);
    await load();
    await refreshCustomCss();
  }

  // ── 拖拽排序 ──
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
    await refreshCustomCss();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-[var(--text)] uppercase tracking-wider opacity-60">
          自定义 CSS 片段
        </span>
        <button
          onClick={() => { setEditingSnippet(null); setShowEditor(true); }}
          className="text-xs px-2.5 py-1 bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition-opacity"
        >
          + 添加
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-[var(--text)] opacity-50 py-3 text-center">加载中…</p>
      ) : snippets.length === 0 ? (
        <p className="text-xs text-[var(--text)] opacity-35 italic py-3 text-center">暂无 CSS 片段</p>
      ) : (
        <div className="flex flex-col gap-1.5">
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
      className="group flex items-center gap-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 cursor-grab active:cursor-grabbing select-none hover:border-[var(--accent-border)] transition-colors"
    >
      <span className="text-[var(--text)] opacity-25 group-hover:opacity-50 text-xs flex-shrink-0">⠿</span>

      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-sm text-[var(--text-h)] font-medium truncate">{snippet.name}</span>
        {snippet.content && (
          <span className="text-xs text-[var(--text)] opacity-40 font-mono truncate">
            {snippet.content.trim().slice(0, 40)}{snippet.content.trim().length > 40 ? '…' : ''}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {/* 启用/禁用开关 */}
        <button
          onClick={onToggle}
          title={snippet.enabled ? '点击禁用' : '点击启用'}
          className={`text-xs px-2 py-0.5 rounded border transition-colors ${
            snippet.enabled
              ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-bg)]'
              : 'border-[var(--border)] text-[var(--text)] opacity-40'
          }`}
        >
          {snippet.enabled ? '启用' : '禁用'}
        </button>

        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="w-6 h-6 flex items-center justify-center rounded text-[var(--text)] hover:text-[var(--text-h)] hover:bg-[var(--border)] transition-colors text-xs"
            title="编辑"
          >✎</button>
          <button
            onClick={onDelete}
            className="w-6 h-6 flex items-center justify-center rounded text-[var(--text)] hover:text-red-400 hover:bg-[var(--border)] transition-colors text-xs"
            title="删除"
          >✕</button>
        </div>
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
      alert(`保存失败：${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-6 flex flex-col gap-4">
        <h2 className="text-base font-semibold text-[var(--text-h)]">
          {snippet ? '编辑 CSS 片段' : '新建 CSS 片段'}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm text-[var(--text)] mb-1">片段名称</label>
            <input
              className="w-full px-3 py-2 bg-[var(--code-bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm focus:outline-none focus:border-[var(--accent)]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：消息气泡样式"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--text)] mb-1">CSS 内容</label>
            <textarea
              className="w-full px-3 py-2 bg-[var(--code-bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm font-mono focus:outline-none focus:border-[var(--accent)] resize-none"
              rows={12}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder=".message-bubble { background: #fff; }"
              spellCheck={false}
            />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-[var(--text)] hover:text-[var(--text-h)] transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="px-5 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存'}
            </button>
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
      <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <h2 className="text-base font-semibold text-[var(--text-h)] mb-2">确认删除</h2>
        <p className="text-sm text-red-400 mb-5">此操作无法撤销。</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--text)] hover:text-[var(--text-h)] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handle}
            disabled={deleting}
            className="px-5 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {deleting ? '删除中…' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  );
}
