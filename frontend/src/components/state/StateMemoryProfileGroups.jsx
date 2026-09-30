import StatusSection from './StatusSection.jsx';
import { updateStateEntity } from '../../core/api/state-memory.js';
import { log } from '../../core/utils/logger.js';
import { changedProfileKeys } from './profile-defs.js';
import { rankProfileGroup } from './profile-groups.js';

function groupProfileDefs(defs) {
  const byGroup = new Map();
  for (const def of defs) {
    const group = def.group || '档案';
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(def);
  }
  return [...byGroup.keys()]
    .sort((a, b) => rankProfileGroup(a) - rankProfileGroup(b))
    .map((group) => ({ group, defs: byGroup.get(group) }));
}

/** 档案字段 → 状态行：年龄按出生日期自动计算，只读 */
function profileRow(def, entity) {
  if (def.kind === 'age') {
    return {
      field_key: def.key, label: def.label, type: 'text', update_mode: 'system_rule',
      effective_value_json: entity.age?.text ? JSON.stringify(entity.age.text) : null,
    };
  }
  const value = entity.profile?.[def.key]?.value;
  return {
    field_key: def.key,
    label: def.label,
    type: def.kind === 'list' ? 'list' : 'text',
    update_mode: 'manual',
    effective_value_json: value == null ? null : JSON.stringify(value),
  };
}

/**
 * 档案字段分组（身份 / 外貌 / 人格；地点等无分组的类型归到「档案」），与「现状」同一套行组件：
 * 点击值就地编辑，本轮变化的行高亮。title 传入时不分组，整组用这个标题（如「本轮变化」）。
 */
export default function StateMemoryProfileGroups({ sessionId, entity, defs, diffKeys, reload, templateCtx, title }) {
  const changedKeys = changedProfileKeys(entity, diffKeys);
  const groups = title ? [{ group: title, defs }] : groupProfileDefs(defs);

  async function handleSave(fieldKey, valueJson) {
    try {
      await updateStateEntity(sessionId, entity.entity_id, {
        profile: { [fieldKey]: valueJson == null ? null : JSON.parse(valueJson) },
      });
      reload();
    } catch (err) {
      log.error('state-memory.profile.update_failed', err, { toast: err?.message || '保存档案失败' });
      throw err;
    }
  }

  return groups.filter(({ defs: groupDefs }) => groupDefs.length > 0).map(({ group, defs: groupDefs }) => (
    <StatusSection
      key={group}
      title={group}
      rows={groupDefs.map((def) => profileRow(def, entity))}
      onSave={handleSave}
      changedKeys={changedKeys}
      templateCtx={templateCtx}
      gridLayout
    />
  ));
}
