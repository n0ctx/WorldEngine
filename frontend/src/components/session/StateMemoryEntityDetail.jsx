import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import { IconPin } from '../ui/icons.jsx';
import { deleteStateEntity, updateStateEntity } from '../../core/api/state-memory.js';
import { log } from '../../core/utils/logger.js';
import EntryEditor from '../rules/EntryEditor.jsx';
import MakeCardModal from '../state/MakeCardModal.jsx';
import StateMemoryDynamicState from '../state/StateMemoryDynamicState.jsx';
import StateMemoryProfileGroups from '../state/StateMemoryProfileGroups.jsx';
import { visibleProfileDefs } from '../state/profile-defs.js';

export function PinIcon() {
  return (
    <IconPin size={16} />
  );
}

/** 地点 / 物品 / 势力存为设定条目的草稿：档案逐行写进内容，名字和别名作关键词，默认出现关键词时触发 */
function entryDraftFromEntity(entity, profileDefs) {
  const lines = profileDefs
    .map((def) => [def.label, entity.profile?.[def.key]?.value])
    .filter(([, value]) => (Array.isArray(value) ? value.length > 0 : value))
    .map(([label, value]) => `${label}：${Array.isArray(value) ? value.join('、') : value}`);
  return {
    title: entity.name,
    content: lines.join('\n'),
    keywords: [...new Set([entity.name, ...(entity.aliases ?? [])].filter(Boolean))],
    trigger_type: 'keyword',
    keyword_scope: 'user,assistant',
  };
}

function SaveAsActions({ entityType, onSaveAs }) {
  if (entityType === 'character') {
    return (
      <>
        <Button size="sm" variant="secondary" title="AI 起草后新建一张角色卡" onClick={() => onSaveAs('character')}>
          存为角色卡
        </Button>
        <Button size="sm" variant="secondary" title="AI 起草后新建一张玩家卡" onClick={() => onSaveAs('persona')}>
          存为玩家卡
        </Button>
      </>
    );
  }
  if (entityType === 'player') return null;
  return (
    <Button size="sm" variant="secondary" title="新建一条设定条目，默认出现名字时生效" onClick={() => onSaveAs('entry')}>
      存为设定条目
    </Button>
  );
}

export default function StateMemoryEntityDetail({ sessionId, worldId, entity, typeLabel, present, schema, reload, onClosed }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveAs, setSaveAs] = useState(null);
  const [error, setError] = useState('');

  const retired = entity.status === 'retired';
  const profileDefs = visibleProfileDefs(schema, entity);

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
            <Badge>{typeLabel}</Badge>
            {present && <Badge tone="accent">在场</Badge>}
            {retired && <Badge>已退场</Badge>}
            {entity.aliases?.length > 0 && <span>又名 {entity.aliases.join('、')}</span>}
          </div>
        </div>
        <div className="we-sm-detail-actions">
          <SaveAsActions entityType={entity.type} onSaveAs={setSaveAs} />
          <Button
            size="sm"
            variant="secondary"
            aria-pressed={!!entity.pinned}
            aria-label="置顶"
            title="置顶后每轮都会提供给 AI"
            onClick={togglePinned}
          >
            <PinIcon />
            {entity.pinned ? '已置顶' : '置顶'}
          </Button>
          {!retired && (
            <Button
              size="sm"
              variant="secondary"
              title="删除后标记为已退场，相关关系一并关闭"
              onClick={() => setConfirmDelete(true)}
            >
              删除实体
            </Button>
          )}
        </div>
      </div>

      <StateMemoryProfileGroups sessionId={sessionId} entity={entity} defs={profileDefs} reload={reload} />

      <StateMemoryDynamicState sessionId={sessionId} entity={entity} reload={reload} includeUserFields />

      {error && (
        <p className="we-settings-toggle-hint mt-2 text-[var(--we-color-accent)]" role="alert">{error}</p>
      )}

      <AnimatePresence>
        {confirmDelete && (
          <ConfirmModal
            title="删除该实体？"
            message={`删除后「${entity.name}」将标记为已退场，相关关系会一并关闭。`}
            confirmText="删除"
            cancelText="取消"
            danger
            onConfirm={handleDelete}
            onClose={() => setConfirmDelete(false)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {(saveAs === 'character' || saveAs === 'persona') && (
          <MakeCardModal
            key="make-card"
            kind={saveAs}
            worldId={worldId}
            sessionId={sessionId}
            entity={entity}
            onClose={() => setSaveAs(null)}
            onCreated={() => { setSaveAs(null); reload(); }}
          />
        )}
        {saveAs === 'entry' && (
          <EntryEditor
            key="save-as-entry"
            worldId={worldId}
            entry={entryDraftFromEntity(entity, profileDefs)}
            onClose={() => setSaveAs(null)}
            onSave={() => {
              setSaveAs(null);
              log.success('state-memory.entity.saved_as_entry', null, { toast: '已保存为设定条目' });
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
