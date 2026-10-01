import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { PencilLine, Trash2 } from 'lucide-react';
import { SortableList } from '../index';
import Button from '../ui/Button.jsx';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import IconButton from '../ui/IconButton.jsx';
import DragHandle from '../ui/DragHandle.jsx';
import StateFieldEditor from './StateFieldEditor';
import { log } from '../../core/utils/logger.js';

const TYPE_LABEL = { text: '文本', number: '数值', boolean: '布尔', enum: '枚举', list: '列表', datetime: '时间', table: '表格' };
const UPDATE_LABEL = { manual: '手动', llm_auto: 'LLM自动', system_rule: '系统规则' };

/**
 * StateFieldList — 状态字段模板列表
 * Props:
 *   scope         — 'world' | 'character'
 *   worldId       — 所属世界 ID
 *   listFn        — async (worldId) => fields[]
 *   createFn      — async (worldId, data) => field
 *   updateFn      — async (id, patch) => field
 *   deleteFn      — async (id) => void
 *   reorderFn     — async (worldId, orderedIds) => void
 */
export default function StateFieldList({
  scope, worldId, listFn, createFn, updateFn, deleteFn, reorderFn,
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
    try {
      await deleteFn(id);
    } catch (err) {
      log.error('state_field.delete_failed', err, { toast: err.message || '删除字段失败' });
      return;
    }
    setDeletingId(null);
    await load();
  }

  function handleReorder(newItems) {
    setFields(newItems);
  }

  async function handleReorderEnd(finalItems) {
    await reorderFn(worldId, finalItems.map(f => f.id));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="we-type-eyebrow text-[var(--we-color-text-tertiary)] uppercase">
          {scope === 'world' ? '世界状态字段' : scope === 'persona' ? '玩家状态字段' : '角色状态字段'}
        </span>
        <Button size="sm" onClick={() => { setEditingField(null); setShowEditor(true); }}>
          + 添加
        </Button>
      </div>

      {loading ? (
        <p className="we-type-caption text-[var(--we-color-text-faint)] py-3 text-center">加载中…</p>
      ) : fields.length === 0 ? (
        <p className="we-type-caption text-[var(--we-color-text-faint)] italic py-3 text-center">暂无字段</p>
      ) : (
        <div className="flex flex-col gap-2">
          <SortableList
            items={fields}
            onReorder={handleReorder}
            onReorderEnd={handleReorderEnd}
            renderItem={(f) => (
              <FieldRow
                field={f}
                onEdit={() => { setEditingField(f); setShowEditor(true); }}
                onDelete={() => setDeletingId(f.id)}
              />
            )}
            className="flex flex-col gap-2"
          />
        </div>
      )}

      <AnimatePresence>
        {showEditor && (
          <StateFieldEditor
            field={editingField}
            scope={scope}
            onSave={handleSave}
            onClose={() => setShowEditor(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deletingId && (
          <ConfirmModal
            title="确认删除字段"
            message="此操作无法撤销。"
            confirmText="确认删除"
            danger
            onConfirm={() => handleDelete(deletingId)}
            onClose={() => setDeletingId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function FieldRow({ field, onEdit, onDelete }) {
  return (
    <div className="we-field-row group flex items-center gap-2 px-3 py-2 select-none cursor-grab active:cursor-grabbing">
      <DragHandle className="flex-shrink-0 text-[var(--we-color-text-faint)] group-hover:text-[var(--we-color-text-tertiary)] transition-colors" />

      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="we-type-ui text-[var(--we-color-text-primary)] truncate">{field.label}</span>
        <span className="we-type-caption text-[var(--we-color-text-faint)] [font-family:var(--we-font-mono)] truncate">{field.field_key}</span>
        <span className="ml-auto flex gap-1 flex-shrink-0">
          <Badge label={TYPE_LABEL[field.type] ?? field.type} />
          <Badge label={UPDATE_LABEL[field.update_mode] ?? field.update_mode} dim />
        </span>
      </div>

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <IconButton size="sm" label="编辑" onClick={onEdit}>
          <PencilLine size={16} />
        </IconButton>
        <IconButton size="sm" variant="danger" label="删除" onClick={onDelete}>
          <Trash2 size={16} />
        </IconButton>
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
