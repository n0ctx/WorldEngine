import { useState } from 'react';
import { createPortal } from 'react-dom';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import Icon from '../ui/Icon.jsx';
import { deleteStateEntity, updateStateEntity } from '../../core/api/state-memory.js';
import { log } from '../../core/utils/logger.js';
import StateMemoryDynamicState from '../state/StateMemoryDynamicState.jsx';
import StateMemoryProfileGroups from '../state/StateMemoryProfileGroups.jsx';
import { visibleProfileDefs } from '../state/profile-defs.js';

export function PinIcon() {
  return (
    <Icon size={16}>
      <path d="M12 17v5" />
      <path d="M9 3h6l-1 6 4 4v2H6v-2l4-4z" />
    </Icon>
  );
}

export default function StateMemoryEntityDetail({ sessionId, entity, typeLabel, present, schema, reload, onClosed }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  const retired = entity.status === 'retired';

  async function runAction(fn, failMessage) {
    setError('');
    try {
      await fn();
      reload();
    } catch (err) {
      setError(err.message || failMessage);
    }
  }

  function togglePinned() {
    runAction(() => updateStateEntity(sessionId, entity.entity_id, { pinned: !entity.pinned }), '置顶失败');
  }

  async function handleDelete() {
    setConfirmDelete(false);
    try {
      await deleteStateEntity(sessionId, entity.entity_id);
      reload();
      onClosed?.();
    } catch (err) {
      log.error('state-memory.entity.delete_failed', err, { toast: err?.message || '删除失败' });
      setError(err.message || '删除失败');
    }
  }

  return (
    <div className="we-sm-detail">
      <div className="we-sm-detail-header">
        <div className="we-sm-detail-heading">
          <h3>{entity.name}</h3>
          <div className="we-sm-detail-meta">
            <span className="we-sm-chip">{typeLabel}</span>
            {present && <span className="we-sm-chip we-sm-chip--accent">在场</span>}
            {retired && <span className="we-sm-chip">已退场</span>}
            {entity.aliases?.length > 0 && <span>又名 {entity.aliases.join('、')}</span>}
          </div>
        </div>
        <div className="we-sm-detail-actions">
          <button
            type="button"
            className={`we-sm-pin-toggle${entity.pinned ? ' is-on' : ''}`}
            aria-pressed={entity.pinned}
            aria-label="置顶"
            title="置顶后每轮都会提供给 AI"
            onClick={togglePinned}
          >
            <PinIcon />
            {entity.pinned ? '已置顶' : '置顶'}
          </button>
          {!retired && (
            <button
              type="button"
              className="we-sm-pin-toggle we-sm-delete-toggle"
              title="删除后标记为已退场，相关关系一并关闭"
              onClick={() => setConfirmDelete(true)}
            >
              删除实体
            </button>
          )}
        </div>
      </div>

      <StateMemoryProfileGroups sessionId={sessionId} entity={entity} defs={visibleProfileDefs(schema, entity)} reload={reload} />

      <StateMemoryDynamicState sessionId={sessionId} entity={entity} reload={reload} includeUserFields />

      {error && (
        <p className="we-settings-toggle-hint mt-2 text-[var(--we-color-accent)]" role="alert">{error}</p>
      )}

      {confirmDelete && createPortal(
        <div className="we-tm-confirm-layer">
          <ConfirmModal
            title="删除该实体？"
            message={`删除后「${entity.name}」将标记为已退场，相关关系会一并关闭。`}
            confirmText="删除"
            cancelText="取消"
            danger
            onConfirm={handleDelete}
            onClose={() => setConfirmDelete(false)}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}
