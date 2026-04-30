import { useState, useRef } from 'react';
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
  const [listInput, setListInput] = useState('');
  const listRef = useRef(null);

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
        style={{ accentColor: 'var(--we-color-gold)' }}
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
    const items = Array.isArray(local) ? local : [];

    function addListItem(raw) {
      const v = raw.trim();
      if (!v || items.includes(v)) return;
      setLocal([...items, v]);
      setListInput('');
      saveValue([...items, v]);
    }

    function removeListItem(v) {
      const updated = items.filter((e) => e !== v);
      setLocal(updated);
      setListInput('');
      saveValue(updated);
    }

    return (
      <div
        className="we-tag-input"
        onClick={() => listRef.current?.focus()}
        role="group"
        aria-label="列表项标签输入区"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.currentTarget.querySelector('input')?.focus();
          }
        }}
      >
        {items.map((v) => (
          <span key={v} className="we-tag">
            {v}
            <button type="button" onClick={(e) => { e.stopPropagation(); removeListItem(v); }}>×</button>
          </span>
        ))}
        <input ref={listRef} className="we-tag-input-field"
          value={listInput} onChange={(e) => setListInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); addListItem(listInput); }
            else if (e.key === 'Backspace' && listInput === '' && items.length) {
              removeListItem(items[items.length - 1]);
            }
          }}
          onBlur={() => { if (listInput.trim()) addListItem(listInput); }}
          placeholder={items.length === 0 ? '输入条目后按回车' : ''}
        />
      </div>
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
