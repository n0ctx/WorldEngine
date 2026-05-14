import { useState, useRef, useEffect } from 'react';
import Icon from '../ui/Icon.jsx';
import Select from '../ui/Select.jsx';
import DatetimeSplitInput from './DatetimeSplitInput.jsx';
import StatusTable from './StatusTable.jsx';
import { applyTemplateVars } from '../../core/utils/template-vars.js';
import SeamlessEditableSurface from '../../../../shared/SeamlessEditableSurface.jsx';

const ISO_DATETIME_RE = /^(\d+)-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const STATE_LIST_MAX_ITEMS = 10;

/** datetime ISO 字符串渲染为 "{prefix}X年X月X日X时X分"（去前导零） */
function formatDatetimeChinese(iso, prefix) {
  const m = iso.match(ISO_DATETIME_RE);
  if (!m) return iso;
  const [, y, mo, d, h, min] = m;
  const strip = (s) => String(parseInt(s, 10));
  return `${prefix ?? ''}${strip(y)}年${strip(mo)}月${strip(d)}日${strip(h)}时${strip(min)}分`;
}

function parseValue(effectiveValueJson, type, prefix) {
  if (effectiveValueJson == null) return null;
  try {
    const v = JSON.parse(effectiveValueJson);
    if (type === 'boolean') {
      return (v === true || v === 'true' || v === '1' || v === 1) ? '是' : '否';
    }
    if (type === 'list') {
      if (!Array.isArray(v) || v.length === 0) return null;
      return v.join('、');
    }
    if (type === 'datetime' && typeof v === 'string' && ISO_DATETIME_RE.test(v)) {
      return formatDatetimeChinese(v, prefix);
    }
    return String(v);
  } catch {
    // wsf.default_value 是裸字符串（非 JSON 编码），datetime 字段直接尝试格式化
    if (type === 'datetime' && typeof effectiveValueJson === 'string' && ISO_DATETIME_RE.test(effectiveValueJson)) {
      return formatDatetimeChinese(effectiveValueJson, prefix);
    }
    return String(effectiveValueJson);
  }
}

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

/**
 * 状态字段内联编辑器
 * @param {{ row, onCommit, onCancel }} props
 *   onCommit(valueJson) — 保存
 *   onCancel() — 取消
 */
function InlineEditor({ row, onCommit, onCancel, templateCtx }) {
  const type = row.field_type ?? row.type;
  const rawInit = parseRawValue(row.effective_value_json, type);
  const [draft, setDraft] = useState(rawInit);
  const inputRef = useRef(null);
  const boundaryRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (type !== 'enum' && type !== 'list') return undefined;

    function handlePointerDown(event) {
      if (!boundaryRef.current?.contains(event.target)) {
        onCancel();
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [onCancel, type]);

  function commit(value) {
    let valueJson;
    if (type === 'boolean') {
      valueJson = JSON.stringify(!!value);
    } else if (type === 'number') {
      const num = parseFloat(value);
      valueJson = isFinite(num) ? JSON.stringify(num) : null;
    } else if (type === 'list') {
      const arr = String(value).split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
      valueJson = JSON.stringify(arr);
    } else if (type === 'datetime') {
      valueJson = value && ISO_DATETIME_RE.test(value) ? JSON.stringify(value) : null;
    } else {
      valueJson = value === '' ? null : JSON.stringify(String(value));
    }
    onCommit(valueJson);
  }

  function handleKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); commit(draft); }
    if (e.key === 'Escape') { onCancel(); }
  }

  function handleTextKey(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      commit(draft);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  }

  const readDisplay = (() => {
    const display = parseValue(row.effective_value_json, type, row.prefix);
    const valueClassName = `we-status-value${display == null ? ' we-status-null' : ''}${type === 'text' ? ' we-status-value--multiline' : ''}`;
    if (type === 'list') {
      const arr = parseRawValue(row.effective_value_json, 'list');
      if (arr.length === 0) return <span className="we-status-value we-status-null">点击编辑</span>;
      return (
        <div className="we-status-tags">
          {arr.map((item, idx) => (
            <span key={idx} className="we-status-tag">{applyTemplateVars(item, templateCtx)}</span>
          ))}
        </div>
      );
    }
    return (
      <span className={valueClassName}>
        {display != null ? applyTemplateVars(String(display), templateCtx) : '点击编辑'}
      </span>
    );
  })();

  if (type === 'boolean') {
    return (
      <SeamlessEditableSurface
        editing
        trackValue={stringifyTrackValue(draft)}
        className="we-status-inline-surface"
        readClassName="we-status-inline-surface__read"
        renderRead={() => readDisplay}
        renderEditor={({ measureRef }) => (
          <div
            ref={measureRef}
            className="we-status-inline-surface__editor we-status-inline-surface__editor--checkbox"
          >
            <input
              ref={inputRef}
              type="checkbox"
              checked={!!draft}
              onChange={(e) => { setDraft(e.target.checked); commit(e.target.checked); }}
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

  if (type === 'enum') {
    const options = parseEnumOptions(row.enum_options);
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
                onChange={(value) => {
                  setDraft(value);
                  commit(value);
                }}
                options={[{ value: '', label: '—' }, ...options.map((o) => ({ value: o, label: o }))]}
                className="we-status-inline-select"
              />
            </div>
          )}
        />
      </div>
    );
  }

  if (type === 'datetime') {
    const dtVal = typeof draft === 'string' && ISO_DATETIME_RE.test(draft) ? draft : '';
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
              value={dtVal}
              autoFocus
              widthPreset="compact"
              onChange={(v) => setDraft(v)}
              onBlur={() => commit(draft)}
              onKeyDown={handleKey}
              className="we-status-inline-input"
            />
          </div>
        )}
      />
    );
  }

  if (type === 'list') {
    return (
      <ListInlineEditor
        initial={rawInit}
        onCommit={onCommit}
        onCancel={onCancel}
        readDisplay={readDisplay}
      />
    );
  }

  if (type === 'text') {
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
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit(draft)}
            onKeyDown={handleTextKey}
            className="we-seamless-edit__textarea we-input we-status-inline-input we-status-inline-textarea"
            rows={1}
          />
        )}
      />
    );
  }

  const displayDraft = type === 'list'
    ? (Array.isArray(draft) ? draft.join(', ') : String(draft ?? ''))
    : String(draft ?? '');

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
          value={displayDraft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={handleKey}
          className="we-input we-status-inline-input"
          placeholder={type === 'list' ? '逗号分隔' : ''}
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
function isShortField(row) {
  const type = row.field_type ?? row.type;
  if (type === 'table' || type === 'list' || type === 'datetime') return false;
  return true;
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
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [editingKey, setEditingKey] = useState(null);

  const isLoading = rows === null;
  const hasRows = Array.isArray(rows) && rows.length > 0;
  const isEmpty = !isLoading && !hasRows;

  function handleCommit(row, valueJson) {
    setEditingKey(null);
    onSave?.(row.field_key, valueJson, row.character_id);
  }

  const body = (
    <>
      {isLoading && <SkeletonRows />}
      {isEmpty && <p className="we-section-empty">暂无数据</p>}
      {!isLoading && !isEmpty && (
        <div className={`we-fields-list${gridLayout ? ' we-fields-list--grid' : ''}`}>
          {rows?.map((row, i) => {
            const type = row.field_type ?? row.type;
            const editable = canEditRow(row, onSave);
            const editKey = row.character_id ? `${row.character_id}:${row.field_key}` : row.field_key;

            const short = gridLayout && isShortField(row);
            const fieldExtra = gridLayout ? (short ? ' we-status-field--short' : ' we-status-field--long') : '';

            if (type === 'table') {
              const cols = parseTableColumns(row.table_columns);
              const valObj = parseTableValue(row.effective_value_json);
              return (
                <div
                  key={editKey}
                  className={`we-status-field we-status-field--table${fieldExtra}`}
                  style={{ animationDelay: `${i * 45}ms` }}
                >
                  <span className="we-status-key">{row.label}</span>
                  <StatusTable
                    columns={cols}
                    values={valObj}
                    editable={editable}
                    onCellCommit={(colKey, num) => {
                      const next = { ...valObj };
                      if (num == null) delete next[colKey]; else next[colKey] = num;
                      const valueJson = Object.keys(next).length ? JSON.stringify(next) : null;
                      onSave?.(row.field_key, valueJson, row.character_id);
                    }}
                  />
                </div>
              );
            }

            const display = parseValue(row.effective_value_json, type, row.prefix);
            const max = row.max_value ?? row.max ?? null;
            const isNumber = type === 'number';
            const numVal = isNumber && display != null ? parseFloat(display) : null;
            const pct = max != null && numVal != null ? Math.min(100, (numVal / max) * 100) : null;
            const isEditing = editingKey === editKey;

            return (
              <div
                key={editKey}
                className={`we-status-field${fieldExtra}${isEditing ? ' we-status-field--editing' : ''}`}
                style={{ animationDelay: `${i * 45}ms` }}
              >
                <span className="we-status-key">{row.label}</span>
                {isEditing ? (
                    <InlineEditor
                      row={row}
                      templateCtx={templateCtx}
                      onCommit={(vj) => handleCommit(row, vj)}
                      onCancel={() => setEditingKey(null)}
                    />
                ) : type === 'list' ? (() => {
                  const arr = parseRawValue(row.effective_value_json, 'list');
                  if (arr.length === 0) {
                    return (
                      <span
                        className={`we-status-value we-status-null${editable ? ' we-status-editable' : ''}`}
                        onClick={editable ? () => setEditingKey(editKey) : undefined}
                        title={editable ? '点击编辑' : undefined}
                      >
                        {editable ? '点击编辑' : '—'}
                      </span>
                    );
                  }
                  return (
                    <div
                      className={`we-status-tags${editable ? ' we-status-editable' : ''}`}
                      onClick={editable ? () => setEditingKey(editKey) : undefined}
                      title={editable ? '点击编辑' : undefined}
                    >
                      {arr.map((item, idx) => (
                        <span key={idx} className="we-status-tag">{applyTemplateVars(item, templateCtx)}</span>
                      ))}
                    </div>
                  );
                })() : (
                  <span
                    className={`we-status-value${display == null ? ' we-status-null' : ''}${type === 'text' ? ' we-status-value--multiline' : ''}${editable ? ' we-status-editable' : ''}`}
                    onClick={editable ? () => setEditingKey(editKey) : undefined}
                    title={editable ? '点击编辑' : undefined}
                  >
                    {display != null ? (
                      isNumber
                        ? (max != null
                            ? `${display} / ${max}${row.unit ? ' ' + row.unit : ''}`
                            : `${display}${row.unit ? ' ' + row.unit : ''}`)
                        : applyTemplateVars(display, templateCtx)
                    ) : (editable ? '点击编辑' : '—')}
                  </span>
                )}
                {pct != null && !isEditing && (
                  <div className="we-status-bar">
                    <div className="we-status-bar-fill" style={{ '--status-pct': `${pct}%` }} />
                  </div>
                )}
              </div>
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
