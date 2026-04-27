import { useState, useEffect, useRef, useCallback } from 'react';
import { SortableList } from '../index';
import StateFieldEditor from './StateFieldEditor';

const TYPE_LABEL = { text: '文本', number: '数值', boolean: '布尔', enum: '枚举', list: '列表' };
const UPDATE_LABEL = { manual: '手动', llm_auto: 'LLM自动', system_rule: '系统规则' };

const DIARY_TIME_FIELD_KEY = 'diary_time';

/**
 * StateFieldList — 状态字段模板列表
 * Props:
 *   scope         — 'world' | 'character'
 *   worldId       — 所属世界 ID
 *   diaryDateMode — 'virtual' | 'real'（仅 scope='world' 时有意义，用于 diary_time 特殊 UI）
 *   listFn        — async (worldId) => fields[]
 *   createFn      — async (worldId, data) => field
 *   updateFn      — async (id, patch) => field
 *   deleteFn      — async (id) => void
 *   reorderFn     — async (worldId, orderedIds) => void
 */
export default function StateFieldList({
  scope, worldId, diaryDateMode, listFn, createFn, updateFn, deleteFn, reorderFn,
}) {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setFields(await listFn(worldId));
    } finally {
      setLoading(false);
    }
  }, [listFn, worldId]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [load]);

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

  const diaryField = fields.find(f => f.field_key === DIARY_TIME_FIELD_KEY);
  const sortableFields = fields.filter(f => f.field_key !== DIARY_TIME_FIELD_KEY);

  function handleReorder(newItems) {
    setFields(diaryField ? [diaryField, ...newItems] : newItems);
  }

  async function handleReorderEnd(finalItems) {
    const allIds = diaryField
      ? [diaryField.id, ...finalItems.map(f => f.id)]
      : finalItems.map(f => f.id);
    await reorderFn(worldId, allIds);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wider opacity-60">
          {scope === 'world' ? '世界状态字段' : scope === 'persona' ? '玩家状态字段' : '角色状态字段'}
        </span>
        <button
          onClick={() => { setEditingField(null); setShowEditor(true); }}
          className="text-xs px-3 py-1 bg-accent text-white rounded-lg hover:opacity-90 transition-opacity"
        >
          + 添加
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-text-secondary opacity-50 py-3 text-center">加载中…</p>
      ) : fields.length === 0 ? (
        <p className="text-xs text-text-secondary opacity-35 italic py-3 text-center">暂无字段</p>
      ) : (
        <div className="flex flex-col gap-2">
          {diaryField && (
            <FieldRow
              field={diaryField}
              isDiaryTime={true}
              onEdit={() => { setEditingField(diaryField); setShowEditor(true); }}
              onDelete={() => setDeletingId(diaryField.id)}
            />
          )}
          {sortableFields.length > 0 && (
            <SortableList
              items={sortableFields}
              onReorder={handleReorder}
              onReorderEnd={handleReorderEnd}
              renderItem={(f) => (
                <FieldRow
                  field={f}
                  isDiaryTime={false}
                  onEdit={() => { setEditingField(f); setShowEditor(true); }}
                  onDelete={() => setDeletingId(f.id)}
                />
              )}
              className="flex flex-col gap-2"
            />
          )}
        </div>
      )}

      {showEditor && (
        <StateFieldEditor
          field={editingField}
          scope={scope}
          diaryDateMode={editingField?.field_key === DIARY_TIME_FIELD_KEY ? diaryDateMode : undefined}
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

function FieldRow({ field, isDiaryTime, onEdit, onDelete }) {
  return (
    <div
      className={`we-field-row group flex items-center gap-2 px-3 py-2 select-none${isDiaryTime ? '' : ' cursor-grab active:cursor-grabbing'}`}
    >
      <span className={`text-text-secondary text-xs flex-shrink-0${isDiaryTime ? ' opacity-0' : ' opacity-25 group-hover:opacity-50'}`}>⠿</span>

      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-sm text-text font-medium truncate">{field.label}</span>
        {isDiaryTime && (
          <span className="text-xs opacity-40 flex-shrink-0" title="日记时间字段，由系统管理">§</span>
        )}
        <span className="text-xs text-text-secondary opacity-50 font-mono truncate">{field.field_key}</span>
        <span className="ml-auto flex gap-1 flex-shrink-0">
          <Badge label={TYPE_LABEL[field.type] ?? field.type} />
          <Badge label={UPDATE_LABEL[field.update_mode] ?? field.update_mode} dim />
        </span>
      </div>

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button onClick={onEdit}
          className="w-6 h-6 flex items-center justify-center rounded text-text-secondary hover:text-text hover:bg-sand transition-colors text-xs"
          title="编辑">✎</button>
        {!isDiaryTime && (
          <button onClick={onDelete}
            className="w-6 h-6 flex items-center justify-center rounded text-text-secondary hover:text-[var(--we-color-text-danger)] hover:bg-sand transition-colors text-xs"
            title="删除">✕</button>
        )}
      </div>
    </div>
  );
}

function Badge({ label, dim }) {
  return (
    <span className={dim ? 'we-field-badge' : 'we-field-badge-accent'}>
      {label}
    </span>
  );
}

function DeleteConfirm({ onConfirm, onClose }) {
  const [deleting, setDeleting] = useState(false);
  const mouseDownOnBackdropRef = useRef(false);
  async function handle() {
    setDeleting(true);
    await onConfirm();
    setDeleting(false);
  }
  return (
    <div
      className="fixed inset-0 z-[var(--we-z-modal)] flex items-center justify-center bg-black/60"
      onMouseDown={(e) => { mouseDownOnBackdropRef.current = e.target === e.currentTarget; }}
      onClick={() => { if (mouseDownOnBackdropRef.current && !deleting) onClose(); }}
    >
      <div className="we-dialog-panel mx-4 w-full max-w-sm p-6">
        <h2 className="mb-3 text-[17px] font-normal italic text-[var(--we-color-text-primary)] [font-family:var(--we-font-display)]">
          确认删除字段
        </h2>
        <p className="mb-5 text-[13px] text-[var(--we-color-accent)] [font-family:var(--we-font-serif)]">
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
