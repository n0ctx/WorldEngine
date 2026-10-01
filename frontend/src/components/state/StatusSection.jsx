import { useState } from 'react';
import { Badge, EmptyState, SectionTitle, Skeleton } from '../index.js';
import Icon from '../ui/Icon.jsx';
import StatusTable from './StatusTable.jsx';
import StatusValueChange from './StatusValueChange.jsx';
import InlineEditor from './StatusInlineEditor.jsx';
import { applyTemplateVars } from '../../core/utils/template-vars.js';
import { STAGGER } from '../../core/utils/motion.js';
import {
  EMPTY_STATUS_DISPLAY,
  formatFieldValue,
  parseArray,
  parseRawValue,
} from './state-value-format.js';

const parseValue = formatFieldValue;

function parseTableValue(effectiveValueJson) {
  if (effectiveValueJson == null) return {};
  try {
    const v = JSON.parse(effectiveValueJson);
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  } catch { return {}; }
}

function canEditRow(row, onSave) {
  return row.update_mode !== 'system_rule' && !!onSave;
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
  const columns = parseArray(row.table_columns);
  const values = parseTableValue(row.effective_value_json);

  return (
    <div
      className={`we-status-field we-status-field--table${fieldExtra}`}
      style={{ animationDelay: `${index * STAGGER}s` }}
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

function StatusValueDisplay({ row, type, editKey, editable, onSetEditingKey, templateCtx, changed }) {
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
          <Badge key={idx}>{applyTemplateVars(item, templateCtx)}</Badge>
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
      <StatusValueChange
        value={display}
        text={display != null ? (isNumber ? numberDisplay : applyTemplateVars(display, templateCtx)) : EMPTY_STATUS_DISPLAY}
        changed={changed}
        isNumber={isNumber}
      />
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
  changed,
}) {
  const type = row.field_type ?? row.type;
  const editable = canEditRow(row, onSave);
  const short = gridLayout && isShortField(row);
  const fieldExtra = `${gridLayout ? (short ? ' we-status-field--short' : ' we-status-field--long') : ''}${changed ? ' we-status-field--changed' : ''}`;

  if (type === 'table') {
    return <StatusTableField row={row} index={index} fieldExtra={fieldExtra} editable={editable} onSave={onSave} />;
  }

  const isEditing = editingKey === editKey;

  return (
    <div
      className={`we-status-field${fieldExtra}${isEditing ? ' we-status-field--editing' : ''}`}
      style={{ animationDelay: `${index * STAGGER}s` }}
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
          changed={changed}
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
  changedKeys = null,
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
      {isLoading && <Skeleton lines={[60, 80, 45]} />}
      {isEmpty && (emptyContent ?? <EmptyState size="sm" title="暂无数据" />)}
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
                changed={changedKeys?.has(row.field_key) ?? false}
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
          className={collapsible ? 'we-state-section-title--collapsible' : undefined}
          onClick={collapsible ? () => setOpen((o) => !o) : undefined}
        >
          <SectionTitle
            level="eyebrow"
            rule="beside"
            actions={onReset && (
              <button
                className="we-state-section-reset"
                onClick={(e) => { e.stopPropagation(); if (!resetting) onReset(); }}
              >
                {resetting ? '…' : '重置'}
              </button>
            )}
          >
            {collapsible && <Chevron open={open} />}
            {title}
          </SectionTitle>
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
