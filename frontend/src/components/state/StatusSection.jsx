import { useState } from 'react';
import { Badge, Button, EmptyState, SectionTitle, Skeleton } from '../index.js';
import { IconChevronDown } from '../ui/icons.jsx';
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
} from '../../core/utils/state-value-format.js';

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
    <IconChevronDown
      size={16}
      className="we-status-chevron"
      style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', }}
    />
  );
}

// 文本值不超过这个字数时算短值，排进规格表；再长就折成档案条
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

function isBlankRow(row, type) {
  if (type === 'table') return Object.keys(parseTableValue(row.effective_value_json)).length === 0;
  const raw = parseRawValue(row.effective_value_json, type);
  return raw === '' || (Array.isArray(raw) && raw.length === 0);
}

// 角色面板的四堆：数值读数、短值规格、长值档案、未填写；本轮变化过的字段不收进未填写
function sheetPile(row, changed) {
  const type = row.field_type ?? row.type;
  if (!changed && isBlankRow(row, type)) return 'blanks';
  if (type === 'number') return 'readouts';
  return isShortField(row) ? 'specs' : 'dossiers';
}

function getStatusEditKey(row) {
  return row.character_id ? `${row.character_id}:${row.field_key}` : row.field_key;
}

function StatusTableField({ row, index, fieldExtra, editable, onSave }) {
  const columns = parseArray(row.table_columns);
  const values = parseTableValue(row.effective_value_json);

  return (
    <div
      data-field-key={row.field_key}
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

  // 有上限的数值写出占比，主题皮肤可以据此画进度格（骰界的格子条）；默认外观不用它
  const fill = isNumber && max > 0 && Number.isFinite(Number(display))
    ? Math.min(1, Math.max(0, Number(display) / max))
    : null;

  return (
    <span
      className={valueClassName}
      style={fill == null ? undefined : { '--status-fill': fill }}
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

function dossierPreview(row, type, templateCtx) {
  if (type === 'list') {
    return parseRawValue(row.effective_value_json, 'list').map((item) => applyTemplateVars(item, templateCtx)).join('、');
  }
  const display = parseValue(row.effective_value_json, type, row.prefix);
  return display == null ? EMPTY_STATUS_DISPLAY : applyTemplateVars(display, templateCtx);
}

// 档案条的标题行：收起时字段名后跟一行预览，列表再标出条数
function DossierToggle({ row, type, open, templateCtx, onToggle }) {
  const count = type === 'list' ? parseRawValue(row.effective_value_json, 'list').length : 0;
  return (
    <button type="button" className="we-status-dossier-toggle" aria-expanded={open} onClick={onToggle}>
      <span className="we-status-key">{row.label}</span>
      {!open && <span className="we-status-dossier-preview">{dossierPreview(row, type, templateCtx)}</span>}
      {count > 0 && <Badge>{count}</Badge>}
      <Chevron open={open} />
    </button>
  );
}

function StatusField({
  row,
  index,
  variant,
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
  const [userOpen, setUserOpen] = useState(null);
  const type = row.field_type ?? row.type;
  const editable = canEditRow(row, onSave);
  const metered = variant === 'readout' && (row.max_value ?? row.max) > 0;
  const fieldExtra = `${variant ? ` we-status-field--${variant}` : ''}${metered ? ' we-status-field--metered' : ''}${changed ? ' we-status-field--changed' : ''}`;

  if (type === 'table') {
    return <StatusTableField row={row} index={index} fieldExtra={fieldExtra} editable={editable} onSave={onSave} />;
  }

  const isEditing = editingKey === editKey;
  // 档案条默认收起，本轮变化过的自动展开；编辑时总是展开
  const dossier = variant === 'dossier';
  const open = !dossier || isEditing || (userOpen ?? changed);

  return (
    <div
      data-field-key={row.field_key}
      className={`we-status-field${fieldExtra}${isEditing ? ' we-status-field--editing' : ''}`}
      style={{ animationDelay: `${index * STAGGER}s` }}
    >
      {dossier
        ? <DossierToggle row={row} type={type} open={open} templateCtx={templateCtx} onToggle={() => setUserOpen(!open)} />
        : <span className="we-status-key">{row.label}</span>}
      {open && (isEditing ? (
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
      ))}
    </div>
  );
}

/**
 * 角色面板排法：数值做读数格（有上限的带进度条），短值收成规格表，长文本、列表、表格折成档案条，
 * 没填的字段压成最底下一行，点开后按规格表逐项显示、可以填写。
 */
function StatusSheet({ rows, changedKeys, renderField }) {
  const [showBlanks, setShowBlanks] = useState(false);
  const piles = { readouts: [], specs: [], dossiers: [], blanks: [] };
  rows.forEach((row, index) => {
    piles[sheetPile(row, changedKeys?.has(row.field_key) ?? false)].push({ row, index });
  });
  const group = (key, variant) => piles[key].length > 0 && (
    <div className={`we-status-sheet-${key}`}>
      {piles[key].map(({ row, index }) => renderField(row, index, variant))}
    </div>
  );
  const blanks = piles.blanks;

  return (
    <div className="we-fields-list we-fields-list--sheet">
      {group('readouts', 'readout')}
      {group('specs', 'spec')}
      {group('dossiers', 'dossier')}
      {blanks.length > 0 && (
        <button
          type="button"
          className="we-status-blanks-toggle"
          aria-expanded={showBlanks}
          onClick={() => setShowBlanks((v) => !v)}
        >
          {showBlanks
            ? `收起未填写的 ${blanks.length} 项`
            : `未填写 ${blanks.length} 项：${blanks.map(({ row }) => row.label).join('、')}`}
        </button>
      )}
      {showBlanks && blanks.length > 0 && (
        <div className="we-status-sheet-specs">
          {blanks.map(({ row, index }) => renderField(row, index, 'spec'))}
        </div>
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
  sheetLayout = false,
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

  function renderField(row, index, variant) {
    const editKey = getStatusEditKey(row);
    return (
      <StatusField
        key={editKey}
        row={row}
        index={index}
        variant={variant}
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
  }

  const body = (
    <>
      {isLoading && <Skeleton lines={[60, 80, 45]} />}
      {isEmpty && (emptyContent ?? <EmptyState size="sm" title="暂无数据" />)}
      {!isLoading && !isEmpty && (sheetLayout
        ? <StatusSheet rows={rows} changedKeys={changedKeys} renderField={renderField} />
        : <div className="we-fields-list">{rows.map((row, index) => renderField(row, index))}</div>)}
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
              <Button
                variant="text"
                size="sm"
                className="we-state-section-reset"
                onClick={(e) => { e.stopPropagation(); if (!resetting) onReset(); }}
              >
                {resetting ? '…' : '重置'}
              </Button>
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
