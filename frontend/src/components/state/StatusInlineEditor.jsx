import { Badge, Checkbox, Input, Select, TagInput, Textarea } from '../index.js';
import { useState, useRef, useEffect } from 'react';
import DatetimeSplitInput from './DatetimeSplitInput.jsx';
import { applyTemplateVars } from '../../core/utils/template-vars.js';
import { isImeComposing } from '../../core/utils/ime.js';
import { useClickOutside } from '../../core/hooks/useClickOutside.js';
import SeamlessEditableSurface from '../../../../shared/SeamlessEditableSurface.jsx';
import {
  EMPTY_STATUS_DISPLAY,
  ISO_DATETIME_RE,
  formatFieldValue,
  parseArray,
  parseRawValue,
} from '../../core/utils/state-value-format.js';
import { STATE_LIST_MAX_ITEMS } from './stateListLimit.js';

function stringifyTrackValue(value) {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value ?? '');
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
  const display = formatFieldValue(row.effective_value_json, type, row.prefix);
  const valueClassName = `we-status-value${display == null ? ' we-status-null' : ''}${type === 'text' ? ' we-status-value--multiline' : ''}`;

  if (type === 'list') {
    const items = parseRawValue(row.effective_value_json, 'list');
    if (items.length === 0) return <span className="we-status-value we-status-null">{EMPTY_STATUS_DISPLAY}</span>;
    return (
      <div className="we-status-tags">
        {items.map((item, idx) => (
          <Badge key={idx}>{applyTemplateVars(item, templateCtx)}</Badge>
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

export default function InlineEditor({ row, onCommit, onCancel, templateCtx, saving = false, saveError = null }) {
  const type = row.field_type ?? row.type;
  const rawInit = parseRawValue(row.effective_value_json, type);
  const [draft, setDraft] = useState(rawInit);
  const readDisplay = <StatusEditorReadValue row={row} templateCtx={templateCtx} />;
  const commit = (value) => onCommit(serializeEditorValue(type, value));
  const editorProps = { draft, setDraft, commit, onCancel, readDisplay };
  let editor;

  if (type === 'boolean') {
    editor = <BooleanInlineEditor row={row} {...editorProps} />;
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

function BooleanInlineEditor({ row, draft, setDraft, commit, readDisplay }) {
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
          <Checkbox
            ref={inputRef}
            label={row.label || row.field_key}
            checked={!!draft}
            onChange={(checked) => { setDraft(checked); commit(checked); }}
            onBlur={() => commit(draft)}
          />
          <span className="we-status-inline-surface__size-proxy" aria-hidden="true" />
        </div>
      )}
    />
  );
}

function EnumInlineEditor({ row, draft, setDraft, commit, onCancel, readDisplay }) {
  const boundaryRef = useRef(null);
  const options = parseArray(row.enum_options);

  useClickOutside(boundaryRef, onCancel);

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
              autoOpen
              onEscape={onCancel}
            />
          </div>
        )}
      />
    </div>
  );
}

function handleInlineEditorKey(event, draft, commit, onCancel) {
  if (isImeComposing(event)) return;
  if (event.key === 'Enter') { event.preventDefault(); commit(draft); }
  if (event.key === 'Escape') onCancel();
}

function DatetimeInlineEditor({ draft, setDraft, commit, onCancel, readDisplay }) {
  const value = typeof draft === 'string' && ISO_DATETIME_RE.test(draft) ? draft : '';

  function handleKey(event) {
    handleInlineEditorKey(event, draft, commit, onCancel);
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
        <Textarea
          ref={editorRef}
          value={String(draft ?? '')}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={handleKey}
          className="we-seamless-edit__textarea we-status-inline-input we-status-inline-textarea"
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
    handleInlineEditorKey(event, draft, commit, onCancel);
  }

  return (
    <SeamlessEditableSurface
      editing
      trackValue={stringifyTrackValue(draft)}
      className="we-status-inline-surface"
      readClassName="we-status-inline-surface__read"
      renderRead={() => readDisplay}
      renderEditor={() => (
        <Input
          ref={inputRef}
          type={type === 'number' ? 'number' : 'text'}
          value={String(draft ?? '')}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={handleKey}
          className="we-status-inline-input"
          placeholder=""
        />
      )}
    />
  );
}

function ListInlineEditor({ initial, onCommit, onCancel, readDisplay }) {
  const [items, setItems] = useState(() => Array.isArray(initial) ? initial : []);
  const inputRef = useRef(null);
  const boundaryRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useClickOutside(boundaryRef, onCancel);

  function applyItems(next) {
    setItems(next);
    onCommit(next.length > 0 ? JSON.stringify(next) : null);
  }

  function handleKeyDown(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onCancel();
  }

  return (
    <div ref={boundaryRef}>
      <SeamlessEditableSurface
        editing
        trackValue={JSON.stringify(items)}
        className="we-status-inline-surface"
        readClassName="we-status-inline-surface__read"
        renderRead={() => readDisplay}
        renderEditor={({ measureRef }) => (
          <div ref={measureRef}>
            <TagInput
              className="we-status-inline-list"
              label={`${items.length > 0 ? '编辑' : '新增'}列表项`}
              placeholder="输入条目后按回车"
              max={STATE_LIST_MAX_ITEMS}
              values={items}
              commitOnBlur={false}
              inputRef={inputRef}
              onKeyDown={handleKeyDown}
              onAdd={(value) => applyItems([...items, value])}
              onRemove={(value) => applyItems(items.filter((item) => item !== value))}
            />
          </div>
        )}
      />
    </div>
  );
}
