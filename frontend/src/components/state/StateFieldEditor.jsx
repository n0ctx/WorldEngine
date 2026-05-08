import { useState, useRef } from 'react';
import Select from '../ui/Select';
import MarkdownEditor from '../ui/MarkdownEditor';
import DatetimeSplitInput from './DatetimeSplitInput';

const TYPE_OPTIONS = [
  { value: 'text',     label: '文本' },
  { value: 'number',   label: '数值' },
  { value: 'boolean',  label: '布尔' },
  { value: 'enum',     label: '枚举' },
  { value: 'list',     label: '列表' },
  { value: 'datetime', label: '时间' },
  { value: 'table',    label: '表格' },
];

const COLUMN_KEY_RE = /^[a-zA-Z0-9_]+$/;

const UPDATE_MODE_OPTIONS = [
  { value: 'manual',   label: '手动' },
  { value: 'llm_auto', label: 'LLM 自动' },
];

const inputCls = 'we-input';
const labelCls = 'we-dialog-label';
const requiredMark = <span className="we-state-field-required">*</span>;

const DIARY_TIME_FIELD_KEY = 'diary_time';
const ISO_DATETIME_RE = /^\d+-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * StateFieldEditor — 创建/编辑状态字段的模态弹窗
 * Props:
 *   field         — 现有字段对象（编辑模式）或 null（创建模式）
 *   scope         — 'world' | 'character'（保留参数，不影响当前逻辑）
 *   diaryDateMode — 'virtual' | 'real' | undefined（仅 diary_time 字段时传入）
 *   onSave(data)  — 父组件负责调用 API，返回 Promise
 *   onClose()
 */
export default function StateFieldEditor({ field, diaryDateMode, onSave, onClose }) {
  // 已落库的列 key 不允许重命名：列 key 是 *_state_values 的 JSON key，也是 entry_conditions.target_field 的列定位。
  // 改名会让历史值/条件失联，且不做后端迁移。
  const [lockedColumnKeys] = useState(
    () => new Set(
      (field?.type === 'table' && Array.isArray(field?.table_columns))
        ? field.table_columns.map((c) => c?.key).filter(Boolean)
        : []
    ),
  );
  const [form, setForm] = useState(() => {
    // 解析 list 类型的 default_value（存储为 JSON 数组字符串）
    let listDefaults = [];
    if (field?.type === 'list' && field?.default_value) {
      try { listDefaults = JSON.parse(field.default_value) || []; } catch { listDefaults = []; }
    }
    // 解析 table 类型的 columns + 默认值
    let tableColumns = Array.isArray(field?.table_columns) ? field.table_columns : [];
    let tableDefaults = {};
    if (field?.type === 'table' && field?.default_value) {
      try { tableDefaults = JSON.parse(field.default_value) || {}; } catch { tableDefaults = {}; }
    }
    return {
      field_key:          field?.field_key ?? '',
      label:              field?.label ?? '',
      type:               field?.type ?? 'text',
      description:        field?.description ?? '',
      update_mode:        field?.update_mode === 'manual' ? 'manual' : 'llm_auto',
      enum_options:       Array.isArray(field?.enum_options) ? field.enum_options : [],
      list_defaults:      listDefaults,
      table_columns:      tableColumns,
      table_defaults:     tableDefaults,
      min_value:          field?.min_value ?? '',
      max_value:          field?.max_value ?? '',
      allow_empty:        field?.allow_empty ?? 1,
      update_instruction: field?.update_instruction ?? '',
      prefix:             field?.prefix ?? '',
      default_value:      (field?.type === 'list' || field?.type === 'table') ? '' : (field?.default_value ?? ''),
    };
  });

  const [enumInput, setEnumInput] = useState('');
  const [listDefInput, setListDefInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const enumRef = useRef(null);
  const listDefRef = useRef(null);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  // ── 枚举选项 tags ──
  function addEnum(raw) {
    const v = raw.trim();
    if (!v || form.enum_options.includes(v)) return;
    set('enum_options', [...form.enum_options, v]);
    setEnumInput('');
  }
  function removeEnum(v) { set('enum_options', form.enum_options.filter((e) => e !== v)); }

  // ── 列表默认条目 tags ──
  function addListDef(raw) {
    const v = raw.trim();
    if (!v || form.list_defaults.includes(v)) return;
    set('list_defaults', [...form.list_defaults, v]);
    setListDefInput('');
  }
  function removeListDef(v) { set('list_defaults', form.list_defaults.filter((e) => e !== v)); }

  // ── 表格列编辑 ──
  function addColumn() {
    const next = [...form.table_columns, { key: '', label: '', min: '', max: '' }];
    set('table_columns', next);
  }
  function updateColumn(idx, patch) {
    const next = form.table_columns.map((c, i) => i === idx ? { ...c, ...patch } : c);
    set('table_columns', next);
  }
  function removeColumn(idx) {
    const removed = form.table_columns[idx];
    const next = form.table_columns.filter((_, i) => i !== idx);
    set('table_columns', next);
    if (removed?.key && removed.key in form.table_defaults) {
      const { [removed.key]: _, ...rest } = form.table_defaults;
      set('table_defaults', rest);
    }
  }

  async function handleSave() {
    if (!form.field_key.trim()) { setError('field_key 为必填项'); return; }
    if (!form.label.trim())     { setError('label 为必填项'); return; }
    if (!form.type)             { setError('type 为必填项'); return; }
    if (form.type === 'datetime' && form.default_value && !ISO_DATETIME_RE.test(form.default_value)) {
      setError('默认值格式必须为 YYYY-MM-DDTHH:mm（年份为正整数，月/日/时/分各 2 位）');
      return;
    }
    if (form.type === 'table') {
      const cols = form.table_columns;
      if (cols.length === 0) { setError('表格类型必须至少定义 1 列'); return; }
      const seen = new Set();
      for (const c of cols) {
        if (!c.key || !COLUMN_KEY_RE.test(c.key)) { setError(`列 key "${c.key}" 不合法（仅允许字母数字下划线）`); return; }
        if (seen.has(c.key)) { setError(`列 key "${c.key}" 重复`); return; }
        seen.add(c.key);
        if (!c.label || !c.label.trim()) { setError(`列 "${c.key}" 缺少表头 label`); return; }
        if (c.min !== '' && c.min != null && !isFinite(Number(c.min))) { setError(`列 "${c.key}" 的 min 必须为数值`); return; }
        if (c.max !== '' && c.max != null && !isFinite(Number(c.max))) { setError(`列 "${c.key}" 的 max 必须为数值`); return; }
      }
    }

    setSaving(true);
    setError('');
    try {
      const defaultValue = (() => {
        if (form.type === 'list') {
          return form.list_defaults.length > 0 ? JSON.stringify(form.list_defaults) : null;
        }
        if (form.type === 'table') {
          const obj = {};
          for (const c of form.table_columns) {
            const raw = form.table_defaults[c.key];
            if (raw === '' || raw == null) continue;
            const num = Number(raw);
            if (isFinite(num)) obj[c.key] = num;
          }
          return Object.keys(obj).length ? JSON.stringify(obj) : null;
        }
        return form.default_value !== '' ? form.default_value : null;
      })();

      const tableColumnsPayload = form.type === 'table'
        ? form.table_columns.map((c) => {
            const out = { key: c.key.trim(), label: c.label.trim() };
            if (c.min !== '' && c.min != null) out.min = Number(c.min);
            if (c.max !== '' && c.max != null) out.max = Number(c.max);
            return out;
          })
        : null;

      const payload = {
        field_key:          form.field_key.trim(),
        label:              form.label.trim(),
        type:               form.type,
        description:        form.description,
        update_mode:        form.update_mode,
        enum_options:       form.type === 'enum' && form.enum_options.length
                              ? form.enum_options : null,
        min_value:          form.type === 'number' && form.min_value !== '' ? Number(form.min_value) : null,
        max_value:          form.type === 'number' && form.max_value !== '' ? Number(form.max_value) : null,
        allow_empty:        1,
        update_instruction: form.update_instruction,
        prefix:             form.type === 'datetime' ? (form.prefix ?? '') : '',
        table_columns:      tableColumnsPayload,
        default_value:      defaultValue,
      };
      await onSave(payload);
      onClose();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  const isDiaryTime = field?.field_key === DIARY_TIME_FIELD_KEY;
  const isRealDiary = isDiaryTime && diaryDateMode === 'real';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
      <div className="we-dialog-panel w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="we-dialog-header">
          <h2>{field ? '编辑字段' : '新建字段'}</h2>
        </div>

        <div className="we-dialog-body flex flex-col gap-4">
          {/* 基础信息 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>label {requiredMark}</label>
              <input className={inputCls} value={form.label}
                onChange={(e) => set('label', e.target.value)} placeholder="显示名称" />
            </div>
            <div>
              <label className={labelCls}>field_key {requiredMark}</label>
              <input className={inputCls} value={form.field_key}
                onChange={(e) => set('field_key', e.target.value.replace(/\s/g, '_'))}
                placeholder="唯一标识符" disabled={!!field} />
            </div>
          </div>

          {/* 类型 */}
          <div>
            <label className={labelCls}>类型 {requiredMark}</label>
            <Select value={form.type} onChange={(v) => set('type', v)} options={TYPE_OPTIONS} disabled={isDiaryTime} />
          </div>
          {isDiaryTime && (
            <p className="we-state-field-hint">
              {isRealDiary
                ? <>当前为<strong>真实日期</strong>模式，此字段由系统每轮自动写入当前时间。</>
                : <>虚拟日期模式：设置故事的初始时间，由 AI 每轮自动推进。</>}
            </p>
          )}

          {/* 枚举选项（type=enum 时显示） */}
          {form.type === 'enum' && (
            <div>
              <label className={labelCls}>枚举选项（回车添加）</label>
              <div
                className="we-tag-input"
                onClick={() => enumRef.current?.focus()}
                role="group"
                aria-label="枚举选项标签输入区"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.currentTarget.querySelector('input')?.focus();
                  }
                }}
              >
                {form.enum_options.map((v) => (
                  <span key={v} className="we-tag">
                    {v}
                    <button type="button" onClick={(e) => { e.stopPropagation(); removeEnum(v); }}>×</button>
                  </span>
                ))}
                <input ref={enumRef} className="we-tag-input-field"
                  value={enumInput} onChange={(e) => setEnumInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addEnum(enumInput); }
                    else if (e.key === 'Backspace' && enumInput === '' && form.enum_options.length) {
                      removeEnum(form.enum_options[form.enum_options.length - 1]);
                    }
                  }}
                  onBlur={() => { if (enumInput.trim()) addEnum(enumInput); }}
                  placeholder={form.enum_options.length === 0 ? '输入选项后按回车' : ''}
                />
              </div>
            </div>
          )}

          {/* 列表默认条目（type=list 时显示） */}
          {form.type === 'list' && (
            <div>
              <label className={labelCls}>默认条目（回车添加）</label>
              <div
                className="we-tag-input"
                onClick={() => listDefRef.current?.focus()}
                role="group"
                aria-label="列表默认条目标签输入区"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.currentTarget.querySelector('input')?.focus();
                  }
                }}
              >
                {form.list_defaults.map((v) => (
                  <span key={v} className="we-tag">
                    {v}
                    <button type="button" onClick={(e) => { e.stopPropagation(); removeListDef(v); }}>×</button>
                  </span>
                ))}
                <input ref={listDefRef} className="we-tag-input-field"
                  value={listDefInput} onChange={(e) => setListDefInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addListDef(listDefInput); }
                    else if (e.key === 'Backspace' && listDefInput === '' && form.list_defaults.length) {
                      removeListDef(form.list_defaults[form.list_defaults.length - 1]);
                    }
                  }}
                  onBlur={() => { if (listDefInput.trim()) addListDef(listDefInput); }}
                  placeholder={form.list_defaults.length === 0 ? '输入条目后按回车' : ''}
                />
              </div>
            </div>
          )}

          {/* 表格列定义（type=table 时显示） */}
          {form.type === 'table' && (
            <div className="flex flex-col gap-3">
              <label className={labelCls}>表格列（仅支持数值，最少 1 列）</label>
              <div className="we-state-table-cols">
                {form.table_columns.map((col, idx) => {
                  const keyLocked = lockedColumnKeys.has(col.key);
                  return (
                    <div key={idx} className="we-state-table-col-card">
                      <div className="we-state-table-col-header">
                        <span className="we-state-table-col-title">列 {idx + 1}</span>
                        {keyLocked && (
                          <span className="we-state-table-col-badge" title="已落库列的 key 不可修改；如需更名请先删除该列再新增">已落库</span>
                        )}
                        <button type="button" onClick={() => removeColumn(idx)}
                          className="we-state-table-col-del" aria-label="删除列">删除</button>
                      </div>
                      <div className="we-state-table-col-body">
                        <div className="we-state-table-col-row2">
                          <div className="we-state-table-col-field">
                            <span className="we-state-table-col-field-label">字段 key</span>
                            <input className={inputCls} value={col.key}
                              onChange={(e) => updateColumn(idx, { key: e.target.value.replace(/\s/g, '_') })}
                              placeholder="如 strength"
                              aria-label="列 key"
                              disabled={keyLocked} />
                          </div>
                          <div className="we-state-table-col-field">
                            <span className="we-state-table-col-field-label">表头名称</span>
                            <input className={inputCls} value={col.label}
                              onChange={(e) => updateColumn(idx, { label: e.target.value })}
                              placeholder="如 力量"
                              aria-label="列表头" />
                          </div>
                        </div>
                        <div className="we-state-table-col-row3">
                          <div className="we-state-table-col-field">
                            <span className="we-state-table-col-field-label">最小值</span>
                            <input type="number" className={inputCls} value={col.min ?? ''}
                              onChange={(e) => updateColumn(idx, { min: e.target.value })}
                              placeholder="—" aria-label="列下限" />
                          </div>
                          <div className="we-state-table-col-field">
                            <span className="we-state-table-col-field-label">最大值</span>
                            <input type="number" className={inputCls} value={col.max ?? ''}
                              onChange={(e) => updateColumn(idx, { max: e.target.value })}
                              placeholder="—" aria-label="列上限" />
                          </div>
                          <div className="we-state-table-col-field">
                            <span className="we-state-table-col-field-label">默认值</span>
                            <input type="number" className={inputCls}
                              value={form.table_defaults[col.key] ?? ''}
                              onChange={(e) => set('table_defaults', { ...form.table_defaults, [col.key]: e.target.value })}
                              placeholder="0" aria-label="列默认值" />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={addColumn}
                className="we-btn we-btn-sm we-btn-secondary self-start">+ 添加列</button>
            </div>
          )}

          {/* 数值范围（type=number 时显示） */}
          {form.type === 'number' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>最小值</label>
                <input type="number" className={inputCls} value={form.min_value}
                  onChange={(e) => set('min_value', e.target.value)} placeholder="不限" />
              </div>
              <div>
                <label className={labelCls}>最大值</label>
                <input type="number" className={inputCls} value={form.max_value}
                  onChange={(e) => set('max_value', e.target.value)} placeholder="不限" />
              </div>
            </div>
          )}

          {/* 展示前缀（仅 datetime 类型显示，如"第三纪元 "） */}
          {form.type === 'datetime' && (
            <div>
              <label className={labelCls}>展示前缀（可选，前端渲染 X年X月X日X时X分 时拼接到最前）</label>
              <input className={inputCls} value={form.prefix}
                onChange={(e) => set('prefix', e.target.value)}
                placeholder="如：第三纪元 / 公元" />
            </div>
          )}

          {/* 默认值（list/table 类型在上方独立编辑） */}
          {form.type !== 'list' && form.type !== 'table' && (
            <div>
              <label className={labelCls}>默认值</label>
              {form.type === 'datetime' ? (
                <DatetimeSplitInput
                  value={ISO_DATETIME_RE.test(form.default_value) ? form.default_value : ''}
                  onChange={(v) => set('default_value', v)}
                  disabled={isRealDiary}
                />
              ) : (
                <input className={inputCls} value={form.default_value}
                  onChange={(e) => set('default_value', e.target.value)}
                  placeholder="留空表示无默认值" />
              )}
            </div>
          )}

          {/* 说明 */}
          <div>
            <label className={labelCls}>字段说明（给 LLM 的提示）</label>
            <MarkdownEditor
              value={form.description}
              onChange={(md) => set('description', md)}
              placeholder="「字段含义说明」——告诉 LLM 这个字段代表什么，会注入到提示词上下文中"
              minHeight={72}
            />
          </div>

          {/* 更新方式 */}
          <div>
            <label className={labelCls}>更新方式</label>
            <Select value={form.update_mode} onChange={(v) => set('update_mode', v)} options={UPDATE_MODE_OPTIONS} />
          </div>

          {/* 更新指令（LLM 自动时显示） */}
          {form.update_mode === 'llm_auto' && (
            <div>
              <label className={labelCls}>更新指令（告诉 LLM 如何更新该字段）</label>
              <MarkdownEditor
                value={form.update_instruction}
                onChange={(md) => set('update_instruction', md)}
                placeholder="「更新指令」——告诉 LLM 在何种情况下、如何判断并更新这个字段的值"
                minHeight={72}
              />
            </div>
          )}

          {error && (
            <p className="we-state-field-error">
              {error}
            </p>
          )}
        </div>

        <div className="we-dialog-footer">
          <button onClick={onClose} className="we-btn we-btn-sm we-btn-secondary">取消</button>
          <button onClick={handleSave} disabled={saving} className="we-btn we-btn-sm we-btn-primary">
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
