import { useRef, useState } from 'react';
import Select from '../ui/Select';
import MarkdownEditor from '../ui/MarkdownEditor';
import DatetimeSplitInput from './DatetimeSplitInput';
import { handleTagInputKeyDown } from '../../core/utils/tag-input.js';
import { ISO_DATETIME_RE, updateStateFieldForm } from './stateFieldEditor.logic.js';

const TYPE_OPTIONS = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数值' },
  { value: 'boolean', label: '布尔' },
  { value: 'enum', label: '枚举' },
  { value: 'list', label: '列表' },
  { value: 'datetime', label: '时间' },
  { value: 'table', label: '表格' },
];

const UPDATE_MODE_OPTIONS = [
  { value: 'manual', label: '手动' },
  { value: 'llm_auto', label: 'LLM 自动' },
];

const inputCls = 'we-input';
const labelCls = 'we-dialog-label';

const requiredMark = <span className="we-state-field-required">*</span>;

export function StateFieldIdentityFields({ field, form, setForm }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className={labelCls}>label {requiredMark}</label>
        <input className={inputCls} value={form.label}
          onChange={(event) => updateStateFieldForm(setForm, 'label', event.target.value)}
          placeholder="显示名称" />
      </div>
      <div>
        <label className={labelCls}>field_key {requiredMark}</label>
        <input className={inputCls} value={form.field_key}
          onChange={(event) => updateStateFieldForm(setForm, 'field_key', event.target.value.replace(/\s/g, '_'))}
          placeholder="唯一标识符" disabled={!!field} />
      </div>
    </div>
  );
}

export function StateFieldTypeFields({ form, setForm, lockedColumnKeys, isDiaryTime, isRealDiary }) {
  return (
    <>
      <div>
        <label className={labelCls}>类型 {requiredMark}</label>
        <Select
          value={form.type}
          onChange={(value) => updateStateFieldForm(setForm, 'type', value)}
          options={TYPE_OPTIONS}
          disabled={isDiaryTime}
        />
      </div>
      {isDiaryTime && (
        <p className="we-state-field-hint">
          {isRealDiary
            ? <>当前为<strong>真实日期</strong>模式，此字段由系统每轮自动写入当前时间。</>
            : <>虚拟日期模式：设置故事的初始时间，由 AI 每轮自动推进。</>}
        </p>
      )}
      {form.type === 'enum' && <EnumOptionsEditor form={form} setForm={setForm} />}
      {form.type === 'list' && <ListDefaultsEditor form={form} setForm={setForm} />}
      {form.type === 'table' && (
        <TableColumnsEditor form={form} setForm={setForm} lockedColumnKeys={lockedColumnKeys} />
      )}
      {form.type === 'number' && <NumberSettings form={form} setForm={setForm} />}
      {form.type === 'datetime' && <DateTimePrefix form={form} setForm={setForm} />}
      {form.type !== 'list' && form.type !== 'table' && (
        <DefaultValueField form={form} setForm={setForm} isRealDiary={isRealDiary} />
      )}
    </>
  );
}

export function StateFieldMetadataFields({ form, setForm, scope }) {
  return (
    <>
      <div>
        <label className={labelCls}>字段说明（给 LLM 的提示）</label>
        <MarkdownEditor
          value={form.description}
          onChange={(value) => updateStateFieldForm(setForm, 'description', value)}
          placeholder="「字段含义说明」——告诉 LLM 这个字段代表什么，会注入到提示词上下文中"
          minHeight={72}
        />
      </div>
      <div>
        <label className={labelCls}>更新方式</label>
        <Select
          value={form.update_mode}
          onChange={(value) => updateStateFieldForm(setForm, 'update_mode', value)}
          options={UPDATE_MODE_OPTIONS}
        />
      </div>
      {scope === 'character' && (
        <div>
          <label className={labelCls}>登场角色启用</label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.nearby_enabled !== 0}
              onChange={(event) => updateStateFieldForm(setForm, 'nearby_enabled', event.target.checked ? 1 : 0)}
              aria-label="登场角色启用"
              className="accent-[var(--we-color-accent-deep)]"
            />
            <span className="text-xs text-[var(--we-color-text-tertiary)]">
              关闭后，该字段不会出现在登场角色面板与自动状态更新中
            </span>
          </label>
        </div>
      )}
      {form.update_mode === 'llm_auto' && (
        <div>
          <label className={labelCls}>更新指令（告诉 LLM 如何更新该字段）</label>
          <MarkdownEditor
            value={form.update_instruction}
            onChange={(value) => updateStateFieldForm(setForm, 'update_instruction', value)}
            placeholder="「更新指令」——告诉 LLM 在何种情况下、如何判断并更新这个字段的值"
            minHeight={72}
          />
        </div>
      )}
    </>
  );
}

function EnumOptionsEditor({ form, setForm }) {
  const [enumInput, setEnumInput] = useState('');
  const enumRef = useRef(null);

  function addEnum(raw) {
    const value = raw.trim();
    if (!value || form.enum_options.includes(value)) return;
    updateStateFieldForm(setForm, 'enum_options', [...form.enum_options, value]);
    setEnumInput('');
  }

  function removeEnum(value) {
    const next = form.enum_options.filter((option) => option !== value);
    setForm((current) => ({
      ...current,
      enum_options: next,
      default_value: next.includes(current.default_value) ? current.default_value : '',
    }));
  }

  return (
    <div>
      <label className={labelCls}>枚举选项（回车添加）</label>
      <div
        className="we-tag-input"
        onClick={() => enumRef.current?.focus()}
        role="group"
        aria-label="枚举选项标签输入区"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.currentTarget.querySelector('input')?.focus();
          }
        }}
      >
        {form.enum_options.map((value) => (
          <span key={value} className="we-tag">
            {value}
            <button type="button" onClick={(event) => { event.stopPropagation(); removeEnum(value); }}>×</button>
          </span>
        ))}
        <input ref={enumRef} className="we-tag-input-field"
          value={enumInput} onChange={(event) => setEnumInput(event.target.value)}
          onKeyDown={(event) => handleTagInputKeyDown(event, enumInput, form.enum_options, addEnum, removeEnum)}
          onBlur={() => { if (enumInput.trim()) addEnum(enumInput); }}
          placeholder={form.enum_options.length === 0 ? '输入选项后按回车' : ''}
        />
      </div>
    </div>
  );
}

function ListDefaultsEditor({ form, setForm }) {
  const [input, setInput] = useState('');
  const inputRef = useRef(null);

  function addDefault(raw) {
    const value = raw.trim();
    if (!value || form.list_defaults.includes(value)) return;
    updateStateFieldForm(setForm, 'list_defaults', [...form.list_defaults, value]);
    setInput('');
  }

  function removeDefault(value) {
    updateStateFieldForm(setForm, 'list_defaults', form.list_defaults.filter((item) => item !== value));
  }

  return (
    <div>
      <label className={labelCls}>默认条目（回车添加）</label>
      <div
        className="we-tag-input"
        onClick={() => inputRef.current?.focus()}
        role="group"
        aria-label="列表默认条目标签输入区"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.currentTarget.querySelector('input')?.focus();
          }
        }}
      >
        {form.list_defaults.map((value) => (
          <span key={value} className="we-tag">
            {value}
            <button type="button" onClick={(event) => { event.stopPropagation(); removeDefault(value); }}>×</button>
          </span>
        ))}
        <input ref={inputRef} className="we-tag-input-field"
          value={input} onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => handleTagInputKeyDown(event, input, form.list_defaults, addDefault, removeDefault)}
          onBlur={() => { if (input.trim()) addDefault(input); }}
          placeholder={form.list_defaults.length === 0 ? '输入条目后按回车' : ''}
        />
      </div>
    </div>
  );
}

function TableColumnsEditor({ form, setForm, lockedColumnKeys }) {
  function addColumn() {
    updateStateFieldForm(setForm, 'table_columns', [
      ...form.table_columns,
      { key: '', label: '', min: '', max: '' },
    ]);
  }

  function updateColumn(index, patch) {
    const columns = form.table_columns.map((column, currentIndex) => (
      currentIndex === index ? { ...column, ...patch } : column
    ));
    updateStateFieldForm(setForm, 'table_columns', columns);
  }

  function removeColumn(index) {
    const removed = form.table_columns[index];
    updateStateFieldForm(setForm, 'table_columns', form.table_columns.filter((_, currentIndex) => currentIndex !== index));
    if (removed?.key && removed.key in form.table_defaults) {
      const { [removed.key]: _, ...defaults } = form.table_defaults;
      updateStateFieldForm(setForm, 'table_defaults', defaults);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className={labelCls}>表格列（仅支持数值，最少 1 列）</label>
      <div className="we-state-table-cols">
        {form.table_columns.map((column, index) => {
          const keyLocked = lockedColumnKeys.has(column.key);
          return (
            <div key={index} className="we-state-table-col-card">
              <div className="we-state-table-col-header">
                <span className="we-state-table-col-title">列 {index + 1}</span>
                {keyLocked && (
                  <span className="we-state-table-col-badge" title="已落库列的 key 不可修改；如需更名请先删除该列再新增">已落库</span>
                )}
                <button type="button" onClick={() => removeColumn(index)}
                  className="we-state-table-col-del" aria-label="删除列">删除</button>
              </div>
              <div className="we-state-table-col-body">
                <div className="we-state-table-col-row2">
                  <div className="we-state-table-col-field">
                    <span className="we-state-table-col-field-label">字段 key</span>
                    <input className={inputCls} value={column.key}
                      onChange={(event) => updateColumn(index, { key: event.target.value.replace(/\s/g, '_') })}
                      placeholder="如 strength" aria-label="列 key" disabled={keyLocked} />
                  </div>
                  <div className="we-state-table-col-field">
                    <span className="we-state-table-col-field-label">表头名称</span>
                    <input className={inputCls} value={column.label}
                      onChange={(event) => updateColumn(index, { label: event.target.value })}
                      placeholder="如 力量" aria-label="列表头" />
                  </div>
                </div>
                <div className="we-state-table-col-row3">
                  <div className="we-state-table-col-field">
                    <span className="we-state-table-col-field-label">最小值</span>
                    <input type="number" className={inputCls} value={column.min ?? ''}
                      onChange={(event) => updateColumn(index, { min: event.target.value })}
                      placeholder="—" aria-label="列下限" />
                  </div>
                  <div className="we-state-table-col-field">
                    <span className="we-state-table-col-field-label">最大值</span>
                    <input type="number" className={inputCls} value={column.max ?? ''}
                      onChange={(event) => updateColumn(index, { max: event.target.value })}
                      placeholder="—" aria-label="列上限" />
                  </div>
                  <div className="we-state-table-col-field">
                    <span className="we-state-table-col-field-label">默认值</span>
                    <input type="number" className={inputCls}
                      value={form.table_defaults[column.key] ?? ''}
                      onChange={(event) => updateStateFieldForm(setForm, 'table_defaults', {
                        ...form.table_defaults,
                        [column.key]: event.target.value,
                      })}
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
  );
}

function NumberSettings({ form, setForm }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div>
        <label className={labelCls}>最小值</label>
        <input type="number" className={inputCls} value={form.min_value}
          onChange={(event) => updateStateFieldForm(setForm, 'min_value', event.target.value)} placeholder="不限" />
      </div>
      <div>
        <label className={labelCls}>最大值</label>
        <input type="number" className={inputCls} value={form.max_value}
          onChange={(event) => updateStateFieldForm(setForm, 'max_value', event.target.value)} placeholder="不限" />
      </div>
      <div>
        <label className={labelCls}>单位</label>
        <input className={inputCls} value={form.unit}
          onChange={(event) => updateStateFieldForm(setForm, 'unit', event.target.value)} maxLength={16}
          placeholder="如 元 / 万元 / %" />
      </div>
    </div>
  );
}

function DateTimePrefix({ form, setForm }) {
  return (
    <div>
      <label className={labelCls}>展示前缀（可选，前端渲染 X年X月X日X时X分 时拼接到最前）</label>
      <input className={inputCls} value={form.prefix}
        onChange={(event) => updateStateFieldForm(setForm, 'prefix', event.target.value)}
        placeholder="如：第三纪元 / 公元" />
    </div>
  );
}

function DefaultValueField({ form, setForm, isRealDiary }) {
  return (
    <div>
      <label className={labelCls}>默认值</label>
      {form.type === 'datetime' ? (
        <DatetimeSplitInput
          value={ISO_DATETIME_RE.test(form.default_value) ? form.default_value : ''}
          onChange={(value) => updateStateFieldForm(setForm, 'default_value', value)}
          disabled={isRealDiary}
        />
      ) : form.type === 'enum' ? (
        <Select
          value={form.default_value}
          onChange={(value) => updateStateFieldForm(setForm, 'default_value', value)}
          options={[
            { value: '', label: '-' },
            ...form.enum_options.map((option) => ({ value: option, label: option })),
          ]}
        />
      ) : (
        <input className={inputCls} value={form.default_value}
          onChange={(event) => updateStateFieldForm(setForm, 'default_value', event.target.value)}
          placeholder="留空表示无默认值" />
      )}
    </div>
  );
}
