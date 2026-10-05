import { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Book, Pin, Trash2 } from 'lucide-react';
import Button from '../ui/Button.jsx';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import MakeCardModal from './MakeCardModal.jsx';
import EntityStateBlock from './EntityStateBlock.jsx';
import { deleteStateEntity, updateStateEntity } from '../../core/api/state-memory.js';
import { log } from '../../core/utils/logger.js';

/** NPC 页签候选：active 的角色实体，排除玩家、排除主角色（card_id 等于 mainCharacterId），要求在场或置顶 */
function isNpcCandidate(entity, presentIds, mainCharacterId) {
  if (entity.type !== 'character') return false;
  if (entity.status !== 'active') return false;
  if (mainCharacterId && entity.card_id === mainCharacterId) return false;
  return presentIds.includes(entity.entity_id) || !!entity.pinned;
}

/** 在场的排在前，其余（仅置顶）按原有顺序排在后面 */
function sortNpcEntities(entities, presentIds) {
  const present = entities.filter((e) => presentIds.includes(e.entity_id));
  const others = entities.filter((e) => !presentIds.includes(e.entity_id));
  return [...present, ...others];
}

/**
 * 「在场 + 置顶」的 NPC 实体页签，对话和写作两种模式共用。
 * 每个页签内容是 EntityStateBlock，操作栏含置顶/取消置顶、存为角色卡、删除。
 *
 * 返回 { sections, modals }：sections 交给 SectionTabs，modals（制卡/删除确认弹窗）
 * 由调用方放进 belowTabs。
 */
export default function useEntitySections({
  sessionId, worldId, stateMemory, reload, schema, diffKeys, mainCharacterId,
}) {
  const [makeCardEntity, setMakeCardEntity] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const entities = stateMemory?.entities ?? [];
  const relations = stateMemory?.relations ?? [];

  const npcEntities = useMemo(() => {
    const allEntities = stateMemory?.entities ?? [];
    const ids = stateMemory?.presentIds ?? [];
    const candidates = allEntities.filter((e) => isNpcCandidate(e, ids, mainCharacterId));
    return sortNpcEntities(candidates, ids);
  }, [stateMemory, mainCharacterId]);

  async function togglePinned(entity) {
    try {
      await updateStateEntity(sessionId, entity.entity_id, { pinned: !entity.pinned });
      reload();
    } catch (err) {
      log.error('state.entity.pin_failed', err, { toast: err?.message || '置顶失败' });
    }
  }

  async function handleDelete(entity) {
    setDeleteTarget(null);
    try {
      await deleteStateEntity(sessionId, entity.entity_id);
      reload();
    } catch (err) {
      log.error('state.entity.delete_failed', err, { toast: err?.message || '删除失败' });
    }
  }

  function toolbarFor(entity) {
    return (
      <>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => togglePinned(entity)}
          title={entity.pinned ? '取消置顶' : '置顶'}
        >
          <Pin size={11} /><span>{entity.pinned ? '取消置顶' : '置顶'}</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setMakeCardEntity(entity)}
          title="存为角色卡"
        >
          <Book size={11} /><span>存为角色卡</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setDeleteTarget(entity)}
          title="删除"
        >
          <Trash2 size={11} /><span>删除</span>
        </Button>
      </>
    );
  }

  const sections = npcEntities.map((entity) => ({
    key: entity.entity_id,
    label: entity.name || '未命名',
    actions: toolbarFor(entity),
    content: (
      <div className="we-panel-tab-body">
        <EntityStateBlock
          sessionId={sessionId}
          entity={entity}
          schema={schema}
          entities={entities}
          relations={relations}
          diffKeys={diffKeys}
          reload={reload}
        />
      </div>
    ),
  }));

  const modals = (
    <>
      <AnimatePresence>
        {makeCardEntity && (
          <MakeCardModal
            sessionId={sessionId}
            worldId={worldId}
            entity={makeCardEntity}
            onClose={() => setMakeCardEntity(null)}
            onCreated={() => { setMakeCardEntity(null); reload(); }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {deleteTarget && (
          <ConfirmModal
            title="删除该角色？"
            message={`删除后「${deleteTarget.name}」将标记为已退场，相关关系会一并关闭。`}
            confirmText="删除"
            cancelText="取消"
            danger
            onConfirm={() => handleDelete(deleteTarget)}
            onClose={() => setDeleteTarget(null)}
          />
        )}
      </AnimatePresence>
    </>
  );

  return { sections, modals };
}
