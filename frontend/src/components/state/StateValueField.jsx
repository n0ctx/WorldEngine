import { useState } from 'react';
import Input from '../ui/Input';
import Select from '../ui/Select';

/**
 * 状态字段值编辑控件
 *
 * 根据 field.type（boolean/number/enum/list/text）渲染对应输入控件。
 * 用于 WorldEditPage 和 CharacterEditPage 的状态字段列表行。
 *
 * @param {{ field_key, type, default_value_json, enum_options }} field
 * @param {(fieldKey: string, valueJson: string) => void} onSave
 */
export default function StateValueField({ field, onSave }) {
  const parseValue = (vj) => {
    try { return vj != null ? JSON.parse(vj) : null; }
    catch { return vj ?? null; }
  };
  const [local, setLocal] = useState(() => parseValue(field.default_value_json));

  function saveValue(val) {
    onSave(field.field_key, JSON.stringify(val));
  }

  if (field.type === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={!!local}
        onChange={(e) => { setLocal(e.target.checked); saveValue(e.target.checked); }}
        className="w-4 h-4"
        style={{ accentColor: 'var(--we-gold-leaf)' }}
      />
    );
  }
  if (field.type === 'number') {
    return (
      <Input
        type="number"
        value={local ?? ''}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => saveValue(local === '' || local == null ? null : Number(local))}
      />
    );
  }
  if (field.type === 'enum') {
    const options = (() => { try { return JSON.parse(field.enum_options || '[]'); } catch { return []; } })();
    return (
      <Select
        value={local ?? ''}
        onChange={(v) => { setLocal(v); saveValue(v); }}
        options={[{ value: '', label: '—' }, ...options.map(o => ({ value: o, label: o }))]}
      />
    );
  }
  if (field.type === 'list') {
    const displayValue = Array.isArray(local) ? local.join(', ') : (local ?? '');
    return (
      <Input
        type="text"
        value={displayValue}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const arr = String(local).split(',').map(s => s.trim()).filter(Boolean);
          saveValue(arr);
        }}
        placeholder="逗号分隔多个条目"
      />
    );
  }
  return (
    <Input
      type="text"
      value={local ?? ''}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => saveValue(String(local ?? ''))}
    />
  );
}
