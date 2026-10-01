import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Checkbox from '../ui/Checkbox';
import Input from '../ui/Input';
import Select from '../ui/Select';
import TagInput from '../ui/TagInput';
import DatetimeSplitInput from './DatetimeSplitInput';
import { parseLooseJson } from '../../core/utils/state-value-format';
import { STATE_LIST_MAX_ITEMS } from './stateListLimit.js';

const AUTOSAVE_DELAY_MS = 450;
const ISO_DATETIME_RE = /^\d+-\d{2}-\d{2}T\d{2}:\d{2}$/;

function getInitialValueJson(field) {
  return field.value_json ?? field.default_value_json ?? field.effective_value_json ?? null;
}

function stringifyValue(value) {
  return JSON.stringify(value);
}

/**
 * 状态字段值编辑控件
 *
 * 根据 field.type（boolean/number/enum/list/datetime/table/text）渲染对应输入控件。
 * 用于 WorldEditPage、PersonaEditPage 和 CharacterEditPage 的状态字段列表行。
 * @param {{ field_key, type, value_json, default_value_json, enum_options }} field
 * @param {(fieldKey: string, valueJson: string) => void} onSave
 */
export default function StateValueField({ field, onSave, size = 'md' }) {
  const initialValueJson = getInitialValueJson(field);
  return (
    <StateValueFieldInner
      key={`${field.field_key}:${initialValueJson ?? ''}`}
      field={field}
      initialValueJson={initialValueJson}
      onSave={onSave}
      size={size}
    />
  );
}

function StateValueFieldInner({ field, initialValueJson, onSave, size }) {
  const parsedInitialValue = useMemo(() => parseLooseJson(initialValueJson), [initialValueJson]);
  const [local, setLocal] = useState(parsedInitialValue);
  const saveValue = useStateFieldSaver(field.field_key, initialValueJson, onSave);
  useAutoSaveStateValue(field.type, local, saveValue);
  const Editor = STATE_FIELD_EDITORS[field.type] ?? TextStateFieldEditor;

  return <Editor field={field} local={local} setLocal={setLocal} saveValue={saveValue} size={size} />;
}

function useStateFieldSaver(fieldKey, initialValueJson, onSave) {
  const lastSavedValueJson = useRef(initialValueJson == null ? stringifyValue(null) : initialValueJson);
  return useCallback((value) => {
    const valueJson = stringifyValue(value);
    if (valueJson === lastSavedValueJson.current) return;
    lastSavedValueJson.current = valueJson;
    onSave(fieldKey, valueJson);
  }, [fieldKey, onSave]);
}

function useAutoSaveStateValue(type, local, saveValue) {
  useEffect(() => {
    if (!['number', 'text'].includes(type)) return undefined;
    const timer = window.setTimeout(() => saveValue(getAutoSaveValue(type, local)), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [type, local, saveValue]);
}

function getAutoSaveValue(type, local) {
  if (type === 'number') return local === '' || local == null ? null : Number(local);
  return String(local ?? '');
}

function BooleanStateFieldEditor({ field, local, setLocal, saveValue }) {
  return (
    <Checkbox
      label={field.label || field.field_key}
      checked={!!local}
      onChange={(checked) => {
        setLocal(checked);
        saveValue(checked);
      }}
    />
  );
}

function NumberStateFieldEditor({ field, local, setLocal, saveValue, size }) {
  const unit = field.unit ?? '';
  return (
    <div className="flex items-center gap-2">
      <Input
        size={size}
        type="number"
        value={local ?? ''}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => saveValue(local === '' || local == null ? null : Number(local))}
      />
      {unit && <span className="we-type-caption text-[var(--we-color-text-tertiary)] flex-shrink-0">{unit}</span>}
    </div>
  );
}

function EnumStateFieldEditor({ field, local, setLocal, saveValue, size }) {
  let options = [];
  try {
    options = JSON.parse(field.enum_options || '[]');
  } catch {
    options = [];
  }
  return (
    <Select
      size={size}
      value={local ?? ''}
      onChange={(v) => {
        const next = v || null;
        setLocal(next);
        saveValue(next);
      }}
      options={[{ value: '', label: '—' }, ...options.map((o) => ({ value: o, label: o }))]}
    />
  );
}

function DatetimeStateFieldEditor({ local, setLocal, saveValue }) {
  return (
    <DatetimeSplitInput
      value={typeof local === 'string' && ISO_DATETIME_RE.test(local) ? local : ''}
      onChange={(v) => {
        setLocal(v);
        if (ISO_DATETIME_RE.test(v)) saveValue(v);
      }}
      onBlur={() => {
        if (!local) saveValue(null);
      }}
    />
  );
}

function ListStateFieldEditor({ local, setLocal, saveValue }) {
  const items = Array.isArray(local) ? local : [];
  const apply = (updated) => {
    setLocal(updated);
    saveValue(updated);
  };

  return (
    <TagInput
      label="列表项"
      placeholder="输入条目后按回车"
      max={STATE_LIST_MAX_ITEMS}
      values={items}
      onAdd={(value) => apply([...items, value])}
      onRemove={(value) => apply(items.filter((item) => item !== value))}
    />
  );
}

function TableStateFieldEditor({ field, local, setLocal, saveValue, size }) {
  let columns = [];
  try {
    columns = JSON.parse(field.table_columns || '[]');
  } catch {
    columns = [];
  }
  const obj = local && typeof local === 'object' && !Array.isArray(local) ? local : {};
  if (columns.length === 0) {
    return <span className="we-type-caption text-[var(--we-color-text-tertiary)]">未配置列</span>;
  }
  return (
    <div className="we-status-table" style={{ '--we-status-table-cols': columns.length }} role="table" aria-label="表格状态默认值">
      <div className="we-status-table-row we-status-table-head" role="row">
        {columns.map((col) => (
          <span key={col.key} className="we-status-table-cell we-status-table-head-cell" role="columnheader">
            {col.label || col.key}
          </span>
        ))}
      </div>
      <div className="we-status-table-row we-status-table-body" role="row">
        {columns.map((col) => (
          <span key={col.key} className="we-status-table-cell we-status-table-body-cell" role="cell">
            <Input
              size={size}
              type="number"
              className="we-status-inline-input we-status-table-input"
              value={obj[col.key] ?? ''}
              min={col.min ?? undefined}
              max={col.max ?? undefined}
              onChange={(e) => setLocal({ ...obj, [col.key]: e.target.value })}
              onBlur={(e) => {
                const raw = e.target.value;
                const next = { ...obj };
                if (raw === '' || raw == null) delete next[col.key];
                else next[col.key] = Number(raw);
                setLocal(next);
                saveValue(next);
              }}
              aria-label={col.label || col.key}
            />
          </span>
        ))}
      </div>
    </div>
  );
}

function TextStateFieldEditor({ local, setLocal, saveValue, size }) {
  return (
    <Input
      size={size}
      type="text"
      value={local ?? ''}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => saveValue(String(local ?? ''))}
    />
  );
}

const STATE_FIELD_EDITORS = {
  boolean: BooleanStateFieldEditor,
  number: NumberStateFieldEditor,
  enum: EnumStateFieldEditor,
  datetime: DatetimeStateFieldEditor,
  list: ListStateFieldEditor,
  table: TableStateFieldEditor,
};
