import StatusSection from './StatusSection.jsx';
import { updateStateEntityField } from '../../core/api/state-memory.js';
import { log } from '../../core/utils/logger.js';

/** 用户自定义状态字段（角色层，nearby_enabled=1）：按字段 type 复用 StatusSection 的内联编辑器 */
export default function StateMemoryEntityFields({ sessionId, entity, reload }) {
  if (entity.type !== 'character' || !entity.fields?.length) return null;

  const rows = entity.fields.map((field) => ({
    field_key: field.field_key,
    label: field.label,
    type: field.type,
    update_mode: field.update_mode,
    effective_value_json: field.value == null ? null : JSON.stringify(field.value),
  }));

  async function handleSave(fieldKey, valueJson) {
    try {
      await updateStateEntityField(sessionId, entity.entity_id, fieldKey, valueJson == null ? null : JSON.parse(valueJson));
      reload();
    } catch (err) {
      log.error('state-memory.field.update_failed', err, { toast: err?.message || '更新字段失败' });
      throw err;
    }
  }

  return <StatusSection title="用户字段" rows={rows} onSave={handleSave} />;
}
