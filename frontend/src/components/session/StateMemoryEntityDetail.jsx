import { useState } from 'react';
import { createPortal } from 'react-dom';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import { deleteStateEntity, updateStateEntity } from '../../core/api/state-memory.js';
import { log } from '../../core/utils/logger.js';
import StateMemoryProfileField from '../state/StateMemoryProfileField.jsx';
import StateMemoryDynamicState from '../state/StateMemoryDynamicState.jsx';
import StateMemoryEntityFields from '../state/StateMemoryEntityFields.jsx';

function groupProfileFields(fieldDefs) {
  const groups = [];
  const byKey = new Map();
  for (const def of fieldDefs) {
    const key = def.group || '';
    if (!byKey.has(key)) {
      const bucket = { key, defs: [] };
      byKey.set(key, bucket);
      groups.push(bucket);
    }
    byKey.get(key).defs.push(def);
  }
  return groups;
}

function visibleProfileFieldDefs(schema, entity) {
  const allFieldDefs = schema?.profileFields?.[entity.type] ?? [];
  const activeKeys = new Set(entity.activeProfileFields ?? []);
  const isCardEntity = !!entity.card_id;
  return allFieldDefs.filter((def) => activeKeys.has(def.key) && (!isCardEntity || def.key === 'outfit'));
}

export default function StateMemoryEntityDetail({ sessionId, entity, schema, reload, onClosed }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  const grouped = groupProfileFields(visibleProfileFieldDefs(schema, entity));

  async function runAction(fn, failMessage) {
    setError('');
    try {
      await fn();
      reload();
    } catch (err) {
      setError(err.message || failMessage);
    }
  }

  function commitProfileField(fieldKey, value) {
    runAction(() => updateStateEntity(sessionId, entity.entity_id, { profile: { [fieldKey]: value } }), '保存失败');
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
        <h3>{entity.name}{entity.status === 'retired' ? '（已退场）' : ''}</h3>
        <label className="we-sm-pin">
          <input type="checkbox" checked={entity.pinned} onChange={togglePinned} />
          置顶
        </label>
      </div>

      {entity.aliases?.length > 0 && (
        <p className="we-settings-toggle-hint">别名：{entity.aliases.join('、')}</p>
      )}

      {entity.card_id && (
        <div className="we-sm-card-note">
          <p className="we-settings-toggle-hint">身份信息以角色卡为准</p>
          {entity.card_description && <p className="we-status-value">{entity.card_description}</p>}
        </div>
      )}

      {grouped.map(({ key, defs }) => (
        <div key={key || 'default'} className="we-state-section">
          {key && (
            <div className="we-state-section-title">
              <span className="we-section-label">{key}</span>
            </div>
          )}
          <div className="we-fields-list">
            {defs.map((def) => (
              <StateMemoryProfileField
                key={def.key}
                fieldDef={def}
                entry={entity.profile?.[def.key]}
                age={def.key === 'age_recorded' ? entity.age : undefined}
                onCommit={(value) => commitProfileField(def.key, value)}
              />
            ))}
          </div>
        </div>
      ))}

      <StateMemoryDynamicState sessionId={sessionId} entity={entity} reload={reload} />
      <StateMemoryEntityFields sessionId={sessionId} entity={entity} reload={reload} />

      {error && (
        <p className="we-settings-toggle-hint mt-2 text-[var(--we-color-accent)]" role="alert">{error}</p>
      )}

      <div className="we-sm-detail-footer">
        <button type="button" className="we-btn we-btn-sm we-btn-danger" onClick={() => setConfirmDelete(true)}>
          删除实体
        </button>
      </div>

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
