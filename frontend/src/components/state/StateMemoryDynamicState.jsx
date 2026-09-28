import { useState } from 'react';
import StatusSection from './StatusSection.jsx';
import { updateStateEntity } from '../../core/api/state-memory.js';
import { log } from '../../core/utils/logger.js';

/** 动态状态（现状）：键值对，可增改删；文本清空即等同删除（后端按 null 处理） */
export default function StateMemoryDynamicState({ sessionId, entity, diffKeys, reload }) {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const rows = Object.entries(entity.dynamic ?? {}).map(([key, value]) => ({
    field_key: key,
    label: key,
    type: 'text',
    update_mode: 'manual',
    effective_value_json: JSON.stringify(value),
  }));

  const changedKeys = new Set(
    [...(diffKeys ?? [])]
      .filter((k) => k.startsWith(`${entity.entity_id}:state.`))
      .map((k) => k.slice(`${entity.entity_id}:state.`.length)),
  );

  async function handleSave(fieldKey, valueJson) {
    try {
      const value = valueJson == null ? null : JSON.parse(valueJson);
      await updateStateEntity(sessionId, entity.entity_id, { dynamic: { [fieldKey]: value } });
      reload();
    } catch (err) {
      log.error('state-memory.dynamic.update_failed', err, { toast: err?.message || '更新现状失败' });
      throw err;
    }
  }

  async function handleAdd() {
    const key = newKey.trim();
    const value = newValue.trim();
    if (!key || !value) return;
    try {
      await updateStateEntity(sessionId, entity.entity_id, { dynamic: { [key]: value } });
      setNewKey('');
      setNewValue('');
      reload();
    } catch (err) {
      log.error('state-memory.dynamic.add_failed', err, { toast: err?.message || '新增现状失败' });
    }
  }

  return (
    <div className="we-sm-dynamic">
      <StatusSection title="现状" rows={rows} onSave={handleSave} changedKeys={changedKeys} />
      <div className="we-sm-dynamic-add">
        <input className="we-input" placeholder="键" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
        <input className="we-input" placeholder="值" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
        <button type="button" className="we-btn we-btn-sm we-btn-secondary" onClick={handleAdd}>添加</button>
      </div>
    </div>
  );
}
