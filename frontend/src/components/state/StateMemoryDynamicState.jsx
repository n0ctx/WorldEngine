import StatusSection from './StatusSection.jsx';
import { updateStateEntity, updateStateEntityField } from '../../core/api/state-memory.js';
import { log } from '../../core/utils/logger.js';

const STATE_PREFIX = 'state:';
const FIELD_PREFIX = 'field:';
const EXTRA_PREFIX = 'extra:';

function entityChangedKeys(entity, diffKeys) {
  const keys = new Set();
  if (!entity) return keys;
  for (const key of diffKeys ?? []) {
    if (key.startsWith(`${entity.entity_id}:state.`)) keys.add(`${STATE_PREFIX}${key.slice(`${entity.entity_id}:state.`.length)}`);
    if (key.startsWith(`${entity.entity_id}:field.`)) keys.add(`${FIELD_PREFIX}${key.slice(`${entity.entity_id}:field.`.length)}`);
  }
  return keys;
}

/**
 * 现状：AI 记录的动态状态键值 + 用户字段，合在一个小节里就地编辑，本轮变化的行高亮；没有任何记录时不显示。
 * 用户字段两种来源：includeUserFields 时取实体自带的角色字段（NPC）；userRows 是会话状态值接口的行
 * （世界 / 玩家 / 主角色），由调用方传 onSaveUserRow 保存、userChangedKeys 标出本轮变化的 field_key。
 * 动态状态文本清空即等同删除（后端按 null 处理）。
 */
export default function StateMemoryDynamicState({
  sessionId, entity, diffKeys, reload,
  includeUserFields = false, userRows, userChangedKeys, onSaveUserRow,
  templateCtx, gridLayout = false,
}) {
  const stateRows = Object.entries(entity?.dynamic ?? {}).map(([key, value]) => ({
    field_key: `${STATE_PREFIX}${key}`,
    label: key,
    type: 'text',
    update_mode: 'manual',
    effective_value_json: JSON.stringify(value),
  }));
  const fieldRows = includeUserFields && entity?.type === 'character'
    ? (entity.fields ?? []).map((field) => ({
      field_key: `${FIELD_PREFIX}${field.field_key}`,
      label: field.label,
      type: field.type,
      update_mode: field.update_mode,
      effective_value_json: field.value == null ? null : JSON.stringify(field.value),
    }))
    : [];
  const extraRows = (userRows ?? []).map((row) => ({ ...row, field_key: `${EXTRA_PREFIX}${row.field_key}` }));
  const rows = [...stateRows, ...fieldRows, ...extraRows];

  const changedKeys = entityChangedKeys(entity, diffKeys);
  for (const key of userChangedKeys ?? []) changedKeys.add(`${EXTRA_PREFIX}${key}`);

  async function handleSave(rowKey, valueJson, characterId) {
    if (rowKey.startsWith(EXTRA_PREFIX)) {
      await onSaveUserRow(rowKey.slice(EXTRA_PREFIX.length), valueJson, characterId);
      return;
    }
    const value = valueJson == null ? null : JSON.parse(valueJson);
    try {
      if (rowKey.startsWith(STATE_PREFIX)) {
        await updateStateEntity(sessionId, entity.entity_id, { dynamic: { [rowKey.slice(STATE_PREFIX.length)]: value } });
      } else {
        await updateStateEntityField(sessionId, entity.entity_id, rowKey.slice(FIELD_PREFIX.length), value);
      }
      reload();
    } catch (err) {
      log.error('state-memory.dynamic.update_failed', err, { toast: err?.message || '更新现状失败' });
      throw err;
    }
  }

  if (rows.length === 0) return null;

  return (
    <div className="we-sm-dynamic">
      <StatusSection
        title="现状"
        rows={rows}
        onSave={handleSave}
        changedKeys={changedKeys}
        templateCtx={templateCtx}
        gridLayout={gridLayout}
      />
    </div>
  );
}
