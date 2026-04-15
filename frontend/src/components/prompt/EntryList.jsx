import { useState, useEffect, useRef } from 'react';
import {
  listGlobalEntries, listWorldEntries, listCharacterEntries,
  createGlobalEntry, createWorldEntry, createCharacterEntry,
  updateEntry, deleteEntry, reorderEntries,
} from '../../api/prompt-entries';
import EntryEditor from './EntryEditor';

/**
 * EntryList — Prompt 条目列表，支持增删改查和拖拽排序
 * Props:
 *   type    — 'global' | 'world' | 'character'
 *   scopeId — worldId（world 类型）或 characterId（character 类型），global 不需要
 */
export default function EntryList({ type, scopeId }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const dragIdx = useRef(null);

  async function loadEntries() {
    setLoading(true);
    try {
      let list;
      if (type === 'global') list = await listGlobalEntries();
      else if (type === 'world') list = await listWorldEntries(scopeId);
      else list = await listCharacterEntries(scopeId);
      setEntries(list);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadEntries(); }, [type, scopeId]);

  async function handleSave(data) {
    if (editingEntry) {
      await updateEntry(type, editingEntry.id, data);
    } else {
      if (type === 'global') await createGlobalEntry(data);
      else if (type === 'world') await createWorldEntry(scopeId, data);
      else await createCharacterEntry(scopeId, data);
    }
    await loadEntries();
  }

  async function handleDelete(id) {
    await deleteEntry(type, id);
    setDeletingId(null);
    await loadEntries();
  }

  function openCreate() {
    setEditingEntry(null);
    setShowEditor(true);
  }

  function openEdit(entry) {
    setEditingEntry(entry);
    setShowEditor(true);
  }

  // ─── 拖拽排序 ───────────────────────────────────────────────────

  function handleDragStart(idx) {
    dragIdx.current = idx;
  }

  function handleDragOver(e, idx) {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === idx) return;
    const next = [...entries];
    const [moved] = next.splice(dragIdx.current, 1);
    next.splice(idx, 0, moved);
    dragIdx.current = idx;
    setEntries(next);
  }

  async function handleDragEnd() {
    dragIdx.current = null;
    const orderedIds = entries.map((e) => e.id);
    const opts = type === 'world' ? { worldId: scopeId } : type === 'character' ? { characterId: scopeId } : {};
    await reorderEntries(type, orderedIds, opts);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-text">Prompt 条目</h3>
        <button
          onClick={openCreate}
          className="text-xs px-3 py-1.5 bg-accent text-white rounded-lg hover:opacity-90 transition-opacity"
        >
          + 添加
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-text-secondary opacity-60 py-4 text-center">加载中…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-text-secondary opacity-40 italic py-4 text-center">暂无条目</p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry, idx) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              onEdit={() => openEdit(entry)}
              onDelete={() => setDeletingId(entry.id)}
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}

      {showEditor && (
        <EntryEditor
          entry={editingEntry}
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

function EntryRow({ entry, onEdit, onDelete, onDragStart, onDragOver, onDragEnd }) {
  const keywords = Array.isArray(entry.keywords) ? entry.keywords : [];

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className="group flex items-start gap-3 bg-ivory border border-border rounded-lg px-3 py-3 cursor-grab active:cursor-grabbing select-none hover:border-accent/40 transition-colors"
    >
      {/* 拖拽图标 */}
      <span className="text-text-secondary opacity-30 group-hover:opacity-60 mt-0.5 text-xs flex-shrink-0">⠿</span>

      {/* 内容 */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text truncate">{entry.title}</p>
        {entry.summary ? (
          <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{entry.summary}</p>
        ) : null}
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {keywords.map((kw) => (
              <span
                key={kw}
                className="px-1.5 py-0.5 bg-accent/10 text-accent text-xs rounded"
              >
                {kw}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button
          onClick={onEdit}
          className="w-7 h-7 flex items-center justify-center rounded text-text-secondary hover:text-text hover:bg-sand transition-colors text-xs"
          title="编辑"
        >
          ✎
        </button>
        <button
          onClick={onDelete}
          className="w-7 h-7 flex items-center justify-center rounded text-text-secondary hover:text-red-400 hover:bg-sand transition-colors text-xs"
          title="删除"
        >
          ✕
        </button>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-canvas border border-border rounded-2xl shadow-whisper w-full max-w-sm mx-4 p-6">
        <h2 className="text-base font-semibold text-text mb-2">确认删除</h2>
        <p className="text-sm text-red-400 mb-5">此操作无法撤销。</p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text transition-colors">取消</button>
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
