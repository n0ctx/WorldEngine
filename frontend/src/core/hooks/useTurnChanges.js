import { useEffect, useMemo, useState } from 'react';
import { fetchSessionStateValues } from '../api/session-state-values.js';
import { changeTag, parseLooseJson } from '../utils/state-value-format.js';
import { useEntityDiff } from './useEntityDiff.js';
import { useStateDiff } from './useStateDiff.js';
import { useStateMemory, useStateMemorySchema } from './useStateMemory.js';

const EMPTY = [];
// 会话状态值的作用域 → 状态面板的页签（世界区块不在页签里）
const SCOPE_TAB = { world: null, persona: 'player', character: 'character' };

function valueChanges(diff) {
  return Object.entries(SCOPE_TAB).flatMap(([scope, tab]) => diff[scope].map(({ row, prevRow }) => {
    const isNumber = (row.field_type ?? row.type) === 'number';
    return {
      id: `${scope}:${row.character_id ?? ''}:${row.field_key}`,
      label: row.label,
      ...changeTag(parseLooseJson(prevRow.effective_value_json), parseLooseJson(row.effective_value_json), isNumber),
      target: { tab, fieldKeys: scope === 'world' ? [row.field_key] : [row.field_key, `extra:${row.field_key}`] },
    };
  }));
}

function entityTab(entity, mainCharacterId) {
  if (entity.type === 'player') return 'player';
  if (mainCharacterId && entity.card_id === mainCharacterId) return 'character';
  return entity.entity_id;
}

// 状态记忆实体的变化：现状与角色字段逐个列出，档案字段每个实体合成一枚「档案」
function entityChanges(entities, diffKeys, schema, mainCharacterId) {
  const changes = [];
  for (const entity of entities ?? []) {
    const prefix = `${entity.entity_id}:`;
    const keys = [...diffKeys].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
    if (!keys.length) continue;
    const tab = entityTab(entity, mainCharacterId);
    const owner = tab === entity.entity_id && entity.name ? `${entity.name}·` : '';
    const profileKeys = keys.filter((key) => key.startsWith('profile.'));
    for (const key of keys) {
      const [kind, name] = [key.slice(0, key.indexOf('.')), key.slice(key.indexOf('.') + 1)];
      if (kind === 'state') {
        changes.push({ id: `${prefix}${key}`, label: `${owner}${name}`, text: '更新', tone: 'neutral', target: { tab, fieldKeys: [`state:${name}`] } });
      } else if (kind === 'field') {
        const label = entity.fields?.find((field) => field.field_key === name)?.label ?? name;
        changes.push({ id: `${prefix}${key}`, label: `${owner}${label}`, text: '更新', tone: 'neutral', target: { tab, fieldKeys: [`field:${name}`] } });
      }
    }
    if (profileKeys.length) {
      const defs = schema?.profileFields?.[entity.type] ?? [];
      const label = profileKeys.length === 1
        ? defs.find((def) => `profile.${def.key}` === profileKeys[0])?.label ?? '档案'
        : '档案';
      changes.push({ id: `${prefix}profile`, label: `${owner}${label}`, text: '更新', tone: 'neutral', target: { tab, fieldKeys: [] } });
    }
  }
  return changes;
}

/**
 * 对话区的「本轮变化」：和状态面板同一份数据（会话状态值 + 状态记忆）、同一套本地 diff
 * （useStateDiff / useEntityDiff），状态面板收起时也照样算，供回复下方的变化条使用。
 * 每一项带 target（面板页签与行 key），点击时交给 revealStateField 定位。
 * round 是状态整理完成的计数（对话页的 memoryRefreshTick、写作页的 stateTick），每变一次重新取数；
 * 原样返回给调用方，据此把变化挂到当时最后一条回复上。mainCharacterId 是对话页的主角色（写作页为 null）。
 */
export function useTurnChanges(sessionId, round, mainCharacterId = null) {
  const [stateData, setStateData] = useState(null);

  useEffect(() => {
    if (!sessionId) return undefined;
    let cancelled = false;
    fetchSessionStateValues(sessionId)
      .then((data) => { if (!cancelled) setStateData(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sessionId, round]);

  const { diff, ready } = useStateDiff(stateData, sessionId);
  const { data: memory } = useStateMemory(sessionId, round);
  const entityDiff = useEntityDiff(memory?.entities, sessionId);
  const { schema } = useStateMemorySchema();

  const changes = useMemo(() => {
    const list = [
      ...(ready ? valueChanges(diff) : EMPTY),
      ...entityChanges(memory?.entities, entityDiff, schema, mainCharacterId),
    ];
    return list.length ? list : EMPTY;
  }, [ready, diff, memory, entityDiff, schema, mainCharacterId]);

  return { round, changes };
}
