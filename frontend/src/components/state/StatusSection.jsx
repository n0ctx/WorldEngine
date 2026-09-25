import { useState, useRef, useEffect } from 'react';
import Icon from '../ui/Icon.jsx';
import Select from '../ui/Select.jsx';
import DatetimeSplitInput from './DatetimeSplitInput.jsx';
import StatusTable from './StatusTable.jsx';
import { applyTemplateVars } from '../../core/utils/template-vars.js';
import { isImeComposing } from '../../core/utils/ime.js';
import SeamlessEditableSurface from '../../../../shared/SeamlessEditableSurface.jsx';
import { ISO_DATETIME_RE, formatFieldValue } from './state-value-format.js';

const STATE_LIST_MAX_ITEMS = 10;
const EMPTY_STATUS_DISPLAY = '—';

const parseValue = formatFieldValue;

function parseTableColumns(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function parseTableValue(effectiveValueJson) {
  if (effectiveValueJson == null) return {};
  try {
    const v = JSON.parse(effectiveValueJson);
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  } catch { return {}; }
}

function parseRawValue(effectiveValueJson, type) {
  if (effectiveValueJson == null) return type === 'list' ? [] : '';
  try {
    const v = JSON.parse(effectiveValueJson);
    if (type === 'boolean') return v === true || v === 'true' || v === '1' || v === 1;
    if (type === 'list') return Array.isArray(v) ? v : [];
    return v ?? '';
  } catch {
    return effectiveValueJson ?? '';
  }
}

function parseEnumOptions(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function canEditRow(row, onSave) {
  return row.update_mode !== 'system_rule' && !!onSave;
}

function stringifyTrackValue(value) {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value ?? '');
}

function SkeletonRows() {
  return (
    <div className="we-status-skeleton">
      {[60, 80, 45].map((w, i) => (
        <div key={i}>
          <div className="we-skel we-status-skeleton-key" />
          <div className="we-skel we-status-skeleton-value" style={{ '--skel-width': `${w}%` }} />
        </div>
      ))}
    </div>
  );
}

function Chevron({ open }) {
  return (
    <Icon
      size={16}
      viewBox="0 0 10 10"
      strokeWidth="2.5"
      className="we-status-chevron"
      style={{
        transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
      }}
    >
      <polyline points="2,3.5 5,6.5 8,3.5" />
    </Icon>
  );
}

function serializeEditorValue(type, value) {
  if (type === 'boolean') return JSON.stringify(!!value);
  if (type === 'number') {
    const num = parseFloat(value);
    return Number.isFinite(num) ? JSON.stringify(num) : null;
  }
  if (type === 'datetime') {
    return value && ISO_DATETIME_RE.test(value) ? JSON.stringify(value) : null;
  }
  return value === '' ? null : JSON.stringify(String(value));
}

function InlineEditorChrome({ children, saving, saveError }) {
  return (
    <div
      className={`we-status-inline-wrap${saving ? ' we-status-inline-wrap--saving' : ''}${saveError ? ' we-status-inline-wrap--error' : ''}`}
      aria-busy={saving || undefined}
    >
      {children}
      {saving && <span className="we-status-inline-pending" role="status">保存中…</span>}
      {saveError && <span className="we-status-inline-error we-field-error">{saveError}</span>}
    </div>
  );
}

function StatusEditorReadValue({ row, templateCtx }) {
  const type = row.field_type ?? row.type;
  const display = parseValue(row.effective_value_json, type, row.prefix);
  const valueClassName = `we-status-value${display == null ? ' we-status-null' : ''}${type === 'text' ? ' we-status-value--multiline' : ''}`;

  if (type === 'list') {
    const items = parseRawValue(row.effective_value_json, 'list');
    if (items.length === 0) return <span className="we-status-value we-status-null">{EMPTY_STATUS_DISPLAY}</span>;
    return (
      <div className="we-status-tags">
        {items.map((item, idx) => (
          <span key={idx} className="we-status-tag">{applyTemplateVars(item, templateCtx)}</span>
        ))}
      </div>
    );
  }

  return (
    <span className={valueClassName}>
      {display != null ? applyTemplateVars(String(display), templateCtx) : EMPTY_STATUS_DISPLAY}
    </span>
  );
}

function InlineEditor({ row, onCommit, onCancel, templateCtx, saving = false, saveError = null }) {
  const type = row.field_type ?? row.type;
  const rawInit = parseRawValue(row.effective_value_json, type);
  const [draft, setDraft] = useState(rawInit);
  const readDisplay = <StatusEditorReadValue row={row} templateCtx={templateCtx} />;
  const commit = (value) => onCommit(serializeEditorValue(type, value));
  const editorProps = { draft, setDraft, commit, onCancel, readDisplay };
  let editor;

  if (type === 'boolean') {
    editor = <BooleanInlineEditor {...editorProps} />;
  } else if (type === 'enum') {
    editor = <EnumInlineEditor row={row} {...editorProps} />;
  } else if (type === 'datetime') {
    editor = <DatetimeInlineEditor {...editorProps} />;
  } else if (type === 'list') {
    editor = <ListInlineEditor initial={rawInit} onCommit={onCommit} onCancel={onCancel} readDisplay={readDisplay} />;
  } else if (type === 'text') {
    editor = <TextInlineEditor {...editorProps} />;
  } else {
    editor = <BasicInlineEditor type={type} {...editorProps} />;
  }

  return <InlineEditorChrome saving={saving} saveError={saveError}>{editor}</InlineEditorChrome>;
}

function BooleanInlineEditor({ draft, setDraft, commit, readDisplay }) {
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <SeamlessEditableSurface
      editing
      trackValue={stringifyTrackValue(draft)}
      className="we-status-inline-surface"
      readClassName="we-status-inline-surface__read"
      renderRead={() => readDisplay}
      renderEditor={({ measureRef }) => (
        <div ref={measureRef} className="we-status-inline-surface__editor we-status-inline-surface__editor--checkbox">
          <input
            ref={inputRef}
            type="checkbox"
            checked={!!draft}
            onChange={(event) => { setDraft(event.target.checked); commit(event.target.checked); }}
            onBlur={() => commit(draft)}
            className="w-4 h-4"
            style={{ accentColor: 'var(--we-color-gold)' }}
          />
          <span className="we-status-inline-surface__size-proxy" aria-hidden="true" />
        </div>
      )}
    />
  );
}

function EnumInlineEditor({ row, draft, setDraft, commit, onCancel, readDisplay }) {
  const boundaryRef = useRef(null);
  const options = parseEnumOptions(row.enum_options);

  useEffect(() => {
    function handlePointerDown(event) {
      if (!boundaryRef.current?.contains(event.target)) onCancel();
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [onCancel]);

  return (
    <div ref={boundaryRef}>
      <SeamlessEditableSurface
        editing
        trackValue={stringifyTrackValue(draft)}
        className="we-status-inline-surface"
        readClassName="we-status-inline-surface__read"
        renderRead={() => readDisplay}
        renderEditor={({ measureRef }) => (
          <div ref={measureRef} className="we-status-inline-surface__editor">
            <Select
              value={draft ?? ''}
              onChange={(value) => { setDraft(value); commit(value); }}
              options={[{ value: '', label: '—' }, ...options.map((option) => ({ value: option, label: option }))]}
              className="we-status-inline-select"
            />
          </div>
        )}
      />
    </div>
  );
}

function DatetimeInlineEditor({ draft, setDraft, commit, onCancel, readDisplay }) {
  const value = typeof draft === 'string' && ISO_DATETIME_RE.test(draft) ? draft : '';

  function handleKey(event) {
    if (isImeComposing(event)) return;
    if (event.key === 'Enter') { event.preventDefault(); commit(draft); }
    if (event.key === 'Escape') onCancel();
  }

  return (
    <SeamlessEditableSurface
      editing
      trackValue={stringifyTrackValue(draft)}
      className="we-status-inline-surface"
      readClassName="we-status-inline-surface__read"
      renderRead={() => readDisplay}
      renderEditor={({ measureRef }) => (
        <div ref={measureRef} className="we-status-inline-surface__editor">
          <DatetimeSplitInput
            value={value}
            autoFocus
            widthPreset="compact"
            onChange={(next) => setDraft(next)}
            onBlur={() => commit(draft)}
            onKeyDown={handleKey}
            className="we-status-inline-input"
          />
        </div>
      )}
    />
  );
}

function TextInlineEditor({ draft, setDraft, commit, onCancel, readDisplay }) {
  function handleKey(event) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      commit(draft);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <SeamlessEditableSurface
      editing
      trackValue={stringifyTrackValue(draft)}
      className="we-status-inline-surface"
      readClassName="we-status-inline-surface__read"
      renderRead={() => readDisplay}
      renderEditor={({ editorRef }) => (
        <textarea
          ref={editorRef}
          value={String(draft ?? '')}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={handleKey}
          className="we-seamless-edit__textarea we-input we-status-inline-input we-status-inline-textarea"
          rows={1}
        />
      )}
    />
  );
}

function BasicInlineEditor({ type, draft, setDraft, commit, onCancel, readDisplay }) {
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleKey(event) {
    if (isImeComposing(event)) return;
    if (event.key === 'Enter') { event.preventDefault(); commit(draft); }
    if (event.key === 'Escape') onCancel();
  }

  return (
    <SeamlessEditableSurface
      editing
      trackValue={stringifyTrackValue(draft)}
      className="we-status-inline-surface"
      readClassName="we-status-inline-surface__read"
      renderRead={() => readDisplay}
      renderEditor={() => (
        <input
          ref={inputRef}
          type={type === 'number' ? 'number' : 'text'}
          value={String(draft ?? '')}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={handleKey}
          className="we-input we-status-inline-input"
          placeholder=""
        />
      )}
    />
  );
}

function ListInlineEditor({ initial, onCommit, onCancel, readDisplay }) {
  const [items, setItems] = useState(() => Array.isArray(initial) ? initial : []);
  const [input, setInput] = useState('');
  const inputRef = useRef(null);
  const boundaryRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handlePointerDown(event) {
      if (!boundaryRef.current?.contains(event.target)) {
        onCancel();
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [onCancel]);

  function commit(next) {
    onCommit(next.length > 0 ? JSON.stringify(next) : null);
  }

  function addItem(raw) {
    const value = raw.trim();
    if (!value || items.includes(value) || items.length >= STATE_LIST_MAX_ITEMS) return;
    const next = [...items, value];
    setItems(next);
    setInput('');
    commit(next);
  }

  function removeItem(value) {
    const next = items.filter((item) => item !== value);
    setItems(next);
    setInput('');
    commit(next);
  }

  const atMax = items.length >= STATE_LIST_MAX_ITEMS;

  return (
    <div ref={boundaryRef}>
      <SeamlessEditableSurface
        editing
        trackValue={`${JSON.stringify(items)}|${input}`}
        className="we-status-inline-surface"
        readClassName="we-status-inline-surface__read"
        renderRead={() => readDisplay}
        renderEditor={({ measureRef }) => (
          <div
            ref={measureRef}
            className="we-tag-input we-status-inline-list"
            onClick={() => inputRef.current?.focus()}
            role="group"
            aria-label={`${items.length > 0 ? '编辑' : '新增'}列表项`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
                return;
              }
              if (e.key === 'Enter' || e.key === ' ') {
                e.currentTarget.querySelector('input')?.focus();
              }
            }}
          >
            {items.map((item) => (
              <span key={item} className="we-tag">
                {item}
                <button
                  type="button"
                  aria-label={`删除 ${item}`}
                  onClick={(e) => { e.stopPropagation(); removeItem(item); }}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              ref={inputRef}
              className="we-tag-input-field we-status-inline-list__input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={atMax}
              onKeyDown={(e) => {
                if (isImeComposing(e)) return;
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addItem(input);
                  return;
                }
                if (e.key === 'Backspace' && input === '' && items.length > 0) {
                  e.preventDefault();
                  removeItem(items[items.length - 1]);
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  onCancel();
                }
              }}
              placeholder={atMax ? `已达上限 ${STATE_LIST_MAX_ITEMS} 条` : (items.length === 0 ? '输入条目后按回车' : '')}
            />
          </div>
        )}
      />
    </div>
  );
}

/** 判断字段是否短值（适合放进 2 列网格） */
// 文本值不超过这个字数时按短字段排进两列网格，再长就独占一行
const SHORT_TEXT_MAX = 12;

function isShortField(row) {
  const type = row.field_type ?? row.type;
  if (type === 'table' || type === 'list' || type === 'datetime') return false;
  if (type === 'text') {
    const value = parseRawValue(row.effective_value_json, type);
    return String(value).length <= SHORT_TEXT_MAX;
  }
  return true;
}

function getStatusEditKey(row) {
  return row.character_id ? `${row.character_id}:${row.field_key}` : row.field_key;
}

function StatusTableField({ row, index, fieldExtra, editable, onSave }) {
  const columns = parseTableColumns(row.table_columns);
  const values = parseTableValue(row.effective_value_json);

  return (
    <div
      className={`we-status-field we-status-field--table${fieldExtra}`}
      style={{ animationDelay: `${index * 45}ms` }}
    >
      <span className="we-status-key">{row.label}</span>
      <StatusTable
        columns={columns}
        values={values}
        editable={editable}
        onCellCommit={(columnKey, number) => {
          const next = { ...values };
          if (number == null) delete next[columnKey]; else next[columnKey] = number;
          const valueJson = Object.keys(next).length ? JSON.stringify(next) : null;
          onSave?.(row.field_key, valueJson, row.character_id);
        }}
      />
    </div>
  );
}

function StatusValueDisplay({ row, type, editKey, editable, onSetEditingKey, templateCtx }) {
  const editHandler = editable ? () => onSetEditingKey(editKey) : undefined;

  if (type === 'list') {
    const items = parseRawValue(row.effective_value_json, 'list');
    if (items.length === 0) {
      return (
        <span
          className={`we-status-value we-status-null${editable ? ' we-status-editable' : ''}`}
          onClick={editHandler}
        >
          {EMPTY_STATUS_DISPLAY}
        </span>
      );
    }
    return (
      <div
        className={`we-status-tags${editable ? ' we-status-editable' : ''}`}
        onClick={editHandler}
        title={editable ? '点击编辑' : undefined}
      >
        {items.map((item, idx) => (
          <span key={idx} className="we-status-tag">{applyTemplateVars(item, templateCtx)}</span>
        ))}
      </div>
    );
  }

  const display = parseValue(row.effective_value_json, type, row.prefix);
  const isNumber = type === 'number';
  const max = row.max_value ?? row.max ?? null;
  const valueClassName = `we-status-value${display == null ? ' we-status-null' : ''}${type === 'text' ? ' we-status-value--multiline' : ''}${isNumber ? ' we-status-value--number' : ''}${editable ? ' we-status-editable' : ''}`;
  const numberDisplay = max != null
    ? `${display} / ${max}${row.unit ? ' ' + row.unit : ''}`
    : `${display}${row.unit ? ' ' + row.unit : ''}`;

  return (
    <span
      className={valueClassName}
      onClick={editHandler}
      title={display != null && editable ? '点击编辑' : undefined}
    >
      {display != null ? (isNumber ? numberDisplay : applyTemplateVars(display, templateCtx)) : EMPTY_STATUS_DISPLAY}
    </span>
  );
}

function StatusField({
  row,
  index,
  gridLayout,
  editKey,
  editingKey,
  saving,
  saveError,
  templateCtx,
  onSave,
  onCommit,
  onCancel,
  onSetEditingKey,
}) {
  const type = row.field_type ?? row.type;
  const editable = canEditRow(row, onSave);
  const short = gridLayout && isShortField(row);
  const fieldExtra = gridLayout ? (short ? ' we-status-field--short' : ' we-status-field--long') : '';

  if (type === 'table') {
    return <StatusTableField row={row} index={index} fieldExtra={fieldExtra} editable={editable} onSave={onSave} />;
  }

  const isEditing = editingKey === editKey;

  return (
    <div
      className={`we-status-field${fieldExtra}${isEditing ? ' we-status-field--editing' : ''}`}
      style={{ animationDelay: `${index * 45}ms` }}
    >
      <span className="we-status-key">{row.label}</span>
      {isEditing ? (
        <InlineEditor
          row={row}
          templateCtx={templateCtx}
          saving={saving}
          saveError={saveError}
          onCommit={(valueJson) => onCommit(row, valueJson)}
          onCancel={onCancel}
        />
      ) : (
        <StatusValueDisplay
          row={row}
          type={type}
          editKey={editKey}
          editable={editable}
          onSetEditingKey={onSetEditingKey}
          templateCtx={templateCtx}
        />
      )}
    </div>
  );
}

export default function StatusSection({
  title,
  rows,
  onReset,
  resetting,
  onSave,
  className,
  collapsible = false,
  defaultOpen = true,
  templateCtx,
  headerless = false,
  gridLayout = false,
  emptyContent = null,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [editingKey, setEditingKey] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const isLoading = rows === null;
  const hasRows = Array.isArray(rows) && rows.length > 0;
  const isEmpty = !isLoading && !hasRows;

  function closeEditor() {
    setEditingKey(null);
    setSaving(false);
    setSaveError(null);
  }

  async function handleCommit(row, valueJson) {
    if (saving) return; // 防重复提交
    if (!onSave) { closeEditor(); return; }
    setSaving(true);
    setSaveError(null);
    try {
      // onSave 可能同步或返回 Promise;失败时抛出以保留编辑态
      await onSave(row.field_key, valueJson, row.character_id);
      closeEditor();
    } catch (e) {
      setSaving(false);
      setSaveError(e?.message || '保存失败');
    }
  }

  const body = (
    <>
      {isLoading && <SkeletonRows />}
      {isEmpty && (emptyContent ?? <p className="we-section-empty">暂无数据</p>)}
      {!isLoading && !isEmpty && (
        <div className={`we-fields-list${gridLayout ? ' we-fields-list--grid' : ''}`}>
          {rows?.map((row, index) => {
            const editKey = getStatusEditKey(row);
            return (
              <StatusField
                key={editKey}
                row={row}
                index={index}
                gridLayout={gridLayout}
                editKey={editKey}
                editingKey={editingKey}
                saving={saving}
                saveError={saveError}
                templateCtx={templateCtx}
                onSave={onSave}
                onCommit={handleCommit}
                onCancel={closeEditor}
                onSetEditingKey={setEditingKey}
              />
            );
          })}
        </div>
      )}
    </>
  );

  if (headerless) {
    return (
      <div className={`we-state-section we-state-section--headerless ${className || ''}`}>
        {body}
      </div>
    );
  }

  const showTitle = title || collapsible || onReset;

  return (
    <div className={`we-state-section ${className || ''}`}>
      {showTitle && (
        <div
          className={`we-state-section-title${collapsible ? ' we-state-section-title--collapsible' : ''}`}
          onClick={collapsible ? () => setOpen((o) => !o) : undefined}
        >
          {collapsible && <Chevron open={open} />}
          <span className="we-section-label">{title}</span>
          <span className="we-section-rule" />
          {onReset && (
            <button
              className="we-state-section-reset"
              onClick={(e) => { e.stopPropagation(); if (!resetting) onReset(); }}
            >
              {resetting ? '…' : '重置'}
            </button>
          )}
        </div>
      )}

      {collapsible ? (
        <div className={`we-status-collapse${open ? ' we-status-collapse--open' : ''}`}>
          <div className="we-status-collapse-inner">
            {body}
          </div>
        </div>
      ) : body}
    </div>
  );
}
