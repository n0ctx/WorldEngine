import { useState, useEffect, useRef } from 'react';
import StateFieldEditor from './StateFieldEditor';

const TYPE_LABEL = { text: '文本', number: '数值', boolean: '布尔', enum: '枚举', list: '列表' };
const UPDATE_LABEL = { manual: '手动', llm_auto: 'LLM自动', system_rule: '系统规则' };
const TRIGGER_LABEL = { manual_only: '手动', every_turn: '每轮', keyword_based: '关键词' };

/**
 * StateFieldList — 状态字段模板列表
 * Props:
 *   scope     — 'world' | 'character'
 *   worldId   — 所属世界 ID
 *   listFn    — async (worldId) => fields[]
 *   createFn  — async (worldId, data) => field
 *   updateFn  — async (id, patch) => field
 *   deleteFn  — async (id) => void
 *   reorderFn — async (worldId, orderedIds) => void
 */
export default function StateFieldList({
  scope, worldId, listFn, createFn, updateFn, deleteFn, reorderFn,
}) {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const dragIdx = useRef(null);

  async function load() {
    setLoading(true);
    try {
      setFields(await listFn(worldId));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [worldId]);

  async function handleSave(data) {
    if (editingField) {
      await updateFn(editingField.id, data);
    } else {
      await createFn(worldId, data);
    }
    await load();
  }

  async function handleDelete(id) {
    await deleteFn(id);
    setDeletingId(null);
    await load();
  }

  // ── 拖拽排序 ──
  function handleDragStart(idx) { dragIdx.current = idx; }

  function handleDragOver(e, idx) {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === idx) return;
    const next = [...fields];
    const [moved] = next.splice(dragIdx.current, 1);
    next.splice(idx, 0, moved);
    dragIdx.current = idx;
    setFields(next);
  }

  async function handleDragEnd() {
    dragIdx.current = null;
    await reorderFn(worldId, fields.map((f) => f.id));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider opacity-60">
          {scope === 'world' ? '世界状态字段' : scope === 'persona' ? '玩家状态字段' : '角色状态字段'}
        </span>
        <button
          onClick={() => { setEditingField(null); setShowEditor(true); }}
          className="text-xs px-2.5 py-1 bg-accent text-white rounded-lg hover:opacity-90 transition-opacity"
        >
          + 添加
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-text-secondary opacity-50 py-3 text-center">加载中…</p>
      ) : fields.length === 0 ? (
        <p className="text-xs text-text-secondary opacity-35 italic py-3 text-center">暂无字段</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {fields.map((f, idx) => (
            <FieldRow
              key={f.id}
              field={f}
              onEdit={() => { setEditingField(f); setShowEditor(true); }}
              onDelete={() => setDeletingId(f.id)}
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}

      {showEditor && (
        <StateFieldEditor
          field={editingField}
          scope={scope}
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

function FieldRow({ field, onEdit, onDelete, onDragStart, onDragOver, onDragEnd }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className="group flex items-center gap-2 bg-ivory border border-border rounded-lg px-3 py-2 cursor-grab active:cursor-grabbing select-none hover:border-accent/40 transition-colors"
    >
      <span className="text-text-secondary opacity-25 group-hover:opacity-50 text-xs flex-shrink-0">⠿</span>

      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-sm text-text font-medium truncate">{field.label}</span>
        <span className="text-xs text-text-secondary opacity-50 font-mono truncate">{field.field_key}</span>
        <span className="ml-auto flex gap-1 flex-shrink-0">
          <Badge label={TYPE_LABEL[field.type] ?? field.type} />
          <Badge label={UPDATE_LABEL[field.update_mode] ?? field.update_mode} dim />
          <Badge label={TRIGGER_LABEL[field.trigger_mode] ?? field.trigger_mode} dim />
        </span>
      </div>

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button onClick={onEdit}
          className="w-6 h-6 flex items-center justify-center rounded text-text-secondary hover:text-text hover:bg-sand transition-colors text-xs"
          title="编辑">✎</button>
        <button onClick={onDelete}
          className="w-6 h-6 flex items-center justify-center rounded text-text-secondary hover:text-red-400 hover:bg-sand transition-colors text-xs"
          title="删除">✕</button>
      </div>
    </div>
  );
}

function Badge({ label, dim }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs ${dim
      ? 'text-text-secondary opacity-50 bg-transparent border border-border'
      : 'bg-accent/10 text-accent'
    }`}>
      {label}
    </span>
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
      <div className="we-dialog-panel w-full max-w-sm mx-4" style={{ padding: '24px' }}>
        <h2 style={{ fontFamily: 'var(--we-font-display)', fontSize: '17px', fontWeight: 400, fontStyle: 'italic', color: 'var(--we-ink-primary)', marginBottom: '10px' }}>
          确认删除字段
        </h2>
        <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '13px', color: 'var(--we-vermilion)', marginBottom: '20px' }}>
          此操作无法撤销。
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="we-btn we-btn-sm we-btn-secondary">取消</button>
          <button onClick={handle} disabled={deleting} className="we-btn we-btn-sm we-btn-danger">
            {deleting ? '删除中…' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  );
}
