import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Input from '../ui/Input';
import Select from '../ui/Select';
import DatetimeSplitInput from './DatetimeSplitInput';

const STATE_LIST_MAX_ITEMS = 10;
const AUTOSAVE_DELAY_MS = 450;
const ISO_DATETIME_RE = /^\d+-\d{2}-\d{2}T\d{2}:\d{2}$/;

function parseJsonValue(valueJson) {
  if (valueJson == null) return null;
  try {
    return JSON.parse(valueJson);
  } catch {
    return valueJson;
  }
}

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
export default function StateValueField({ field, onSave }) {
  const initialValueJson = getInitialValueJson(field);
  return (
    <StateValueFieldInner
      key={`${field.field_key}:${initialValueJson ?? ''}`}
      field={field}
      initialValueJson={initialValueJson}
      onSave={onSave}
    />
  );
}

function StateValueFieldInner({ field, initialValueJson, onSave }) {
  const parsedInitialValue = useMemo(() => parseJsonValue(initialValueJson), [initialValueJson]);
  const [local, setLocal] = useState(parsedInitialValue);
  const [listInput, setListInput] = useState('');
  const lastSavedValueJson = useRef(initialValueJson == null ? stringifyValue(null) : initialValueJson);
  const listRef = useRef(null);

  const saveValue = useCallback((value) => {
    const valueJson = stringifyValue(value);
    if (valueJson === lastSavedValueJson.current) return;
    lastSavedValueJson.current = valueJson;
    onSave(field.field_key, valueJson);
  }, [field.field_key, onSave]);

  useEffect(() => {
    if (!['number', 'text'].includes(field.type)) return undefined;
    const timer = window.setTimeout(() => {
      if (field.type === 'number') {
        saveValue(local === '' || local == null ? null : Number(local));
        return;
      }
      saveValue(String(local ?? ''));
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [field.type, local, saveValue]);

  if (field.type === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={!!local}
        onChange={(e) => {
          setLocal(e.target.checked);
          saveValue(e.target.checked);
        }}
        className="w-4 h-4"
        style={{ accentColor: 'var(--we-color-gold)' }}
      />
    );
  }

  if (field.type === 'number') {
    const unit = field.unit ?? '';
    return (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={local ?? ''}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => saveValue(local === '' || local == null ? null : Number(local))}
        />
        {unit && <span className="text-xs text-[var(--we-color-text-secondary)] opacity-70 flex-shrink-0">{unit}</span>}
      </div>
    );
  }

  if (field.type === 'enum') {
    let options = [];
    try {
      options = JSON.parse(field.enum_options || '[]');
    } catch {
      options = [];
    }
    return (
      <Select
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

  if (field.type === 'datetime') {
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

  if (field.type === 'list') {
    const items = Array.isArray(local) ? local : [];

    function addListItem(raw) {
      const v = raw.trim();
      if (!v || items.includes(v)) return;
      if (items.length >= STATE_LIST_MAX_ITEMS) return;
      const updated = [...items, v];
      setLocal(updated);
      setListInput('');
      saveValue(updated);
    }

    function removeListItem(v) {
      const updated = items.filter((e) => e !== v);
      setLocal(updated);
      setListInput('');
      saveValue(updated);
    }

    const atMax = items.length >= STATE_LIST_MAX_ITEMS;

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
            <button type="button" aria-label={`删除 ${v}`} onClick={(e) => { e.stopPropagation(); removeListItem(v); }}>×</button>
          </span>
        ))}
        <input
          ref={listRef}
          className="we-tag-input-field"
          value={listInput}
          onChange={(e) => setListInput(e.target.value)}
          disabled={atMax}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addListItem(listInput);
            }
            if (e.key === 'Backspace' && listInput === '' && items.length) removeListItem(items[items.length - 1]);
          }}
          onBlur={() => { if (listInput.trim()) addListItem(listInput); }}
          placeholder={atMax ? `已达上限 ${STATE_LIST_MAX_ITEMS} 条，请先删除` : (items.length === 0 ? '输入条目后按回车' : '')}
        />
      </div>
    );
  }

  if (field.type === 'table') {
    let columns = [];
    try {
      columns = JSON.parse(field.table_columns || '[]');
    } catch {
      columns = [];
    }
    const obj = local && typeof local === 'object' && !Array.isArray(local) ? local : {};
    if (columns.length === 0) {
      return <span className="text-xs text-[var(--we-color-text-secondary)] opacity-70">未配置列</span>;
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
              <input
                type="number"
                className="we-input we-status-inline-input we-status-table-input"
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

  return (
    <Input
      type="text"
      value={local ?? ''}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => saveValue(String(local ?? ''))}
    />
  );
}
