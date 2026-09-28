import { useLayoutEffect, useRef, useState } from 'react';
import { didSessionChange } from './useSessionResetGuard.js';

const EMPTY = new Set();

/**
 * 状态记忆实体（档案 / 现状）的变化行，键为 `${entity_id}:profile.${key}` 或
 * `${entity_id}:state.${key}`，供 EntityStateBlock / PlayerProfileGroup /
 * StateMemoryDynamicState 做行级高亮。
 */
function diffEntities(prevEntities, nextEntities) {
  const changed = new Set();
  if (!Array.isArray(prevEntities) || !Array.isArray(nextEntities)) return changed;
  const prevById = new Map(prevEntities.map((e) => [e.entity_id, e]));
  for (const entity of nextEntities) {
    const prev = prevById.get(entity.entity_id);
    if (!prev) continue;
    for (const [key, field] of Object.entries(entity.profile ?? {})) {
      const prevValue = JSON.stringify(prev.profile?.[key]?.value);
      if (prevValue !== JSON.stringify(field.value)) changed.add(`${entity.entity_id}:profile.${key}`);
    }
    for (const [key, value] of Object.entries(entity.dynamic ?? {})) {
      if (JSON.stringify(prev.dynamic?.[key]) !== JSON.stringify(value)) changed.add(`${entity.entity_id}:state.${key}`);
    }
  }
  return changed;
}

/**
 * 「这一轮变了什么」的前端本地 diff，专用于状态记忆实体（`GET state-memory` 的
 * entities 数组）。语义和 useStateDiff 对 world/persona/character 的处理一致：
 * 缓存上一次的 entities，每次更新时逐个实体比较档案字段和动态状态，找出变化的
 * 键；会话切换时重置比较基线；首次加载（还没有"上一次"可比）不算变化，返回
 * 空 Set，而不是把"不知道"当成"确认没变"展示出来。
 */
export function useEntityDiff(entities, sessionId) {
  const prevEntitiesRef = useRef(null);
  const prevSessionRef = useRef(sessionId);
  const [changed, setChanged] = useState(EMPTY);

  // useLayoutEffect（而非 useEffect）：语义和 useStateDiff 一致，见其注释。
  useLayoutEffect(() => {
    if (didSessionChange(prevSessionRef, sessionId)) {
      prevEntitiesRef.current = null;
      setChanged(EMPTY);
      return;
    }
    if (!entities) return;
    const prev = prevEntitiesRef.current;
    setChanged(prev ? diffEntities(prev, entities) : EMPTY);
    prevEntitiesRef.current = entities;
  }, [sessionId, entities]);

  return changed;
}
