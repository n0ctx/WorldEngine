import { Badge, Button, Card, Checkbox, Input, MarkdownEditor, Select, TagInput } from '../index.js';
import DatetimeSplitInput from './DatetimeSplitInput';
import { useStateMemorySchema } from '../../core/hooks/useStateMemory.js';
import { STATE_LIST_MAX_ITEMS } from './stateListLimit.js';
import {
  ISO_DATETIME_RE,
  findReplacedProfileFieldLabel,
  isReservedWorldFieldLabel,
  updateStateFieldForm,
} from './stateFieldEditor.logic.js';

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

const labelCls = 'we-dialog-label';

const requiredMark = <span className="we-state-field-required">*</span>;

export function StateFieldIdentityFields({ field, form, setForm, scope, reservedWorldFieldLabels }) {
  const isReserved = isReservedWorldFieldLabel(scope, form.label, reservedWorldFieldLabels);
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className={labelCls}>label {requiredMark}</label>
        <Input value={form.label}
          onChange={(event) => updateStateFieldForm(setForm, 'label', event.target.value)}
          placeholder="显示名称" />
      </div>
      <div>
        <label className={labelCls}>field_key {requiredMark}</label>
        <Input value={form.field_key}
          onChange={(event) => updateStateFieldForm(setForm, 'field_key', event.target.value.replace(/\s/g, '_'))}
          placeholder="唯一标识符" disabled={!!field} />
      </div>
      {isReserved && (
        <p className="col-span-2 we-state-field-error">该名称已由系统管理</p>
      )}
    </div>
  );
}

export function StateFieldTypeFields({ form, setForm, lockedColumnKeys }) {
  return (
    <>
      <div>
        <label className={labelCls}>类型 {requiredMark}</label>
        <Select
          value={form.type}
          onChange={(value) => updateStateFieldForm(setForm, 'type', value)}
          options={TYPE_OPTIONS}
        />
      </div>
      {form.type === 'enum' && <EnumOptionsEditor form={form} setForm={setForm} />}
      {form.type === 'list' && <ListDefaultsEditor form={form} setForm={setForm} />}
      {form.type === 'table' && (
        <TableColumnsEditor form={form} setForm={setForm} lockedColumnKeys={lockedColumnKeys} />
      )}
      {form.type === 'number' && <NumberSettings form={form} setForm={setForm} />}
      {form.type === 'datetime' && <DateTimePrefix form={form} setForm={setForm} />}
      {form.type !== 'list' && form.type !== 'table' && (
        <DefaultValueField form={form} setForm={setForm} />
      )}
    </>
  );
}

export function StateFieldMetadataFields({ form, setForm, scope }) {
  const { schema } = useStateMemorySchema();
  const replacedProfileFieldLabel = findReplacedProfileFieldLabel(schema, scope, form);
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
          <label className={labelCls}>对 NPC 生效</label>
          <Checkbox
            checked={form.nearby_enabled !== 0}
            onChange={(checked) => updateStateFieldForm(setForm, 'nearby_enabled', checked ? 1 : 0)}
            aria-label="对 NPC 生效"
          >
            <span className="we-type-caption text-[var(--we-color-text-tertiary)]">
              对话与写作中由 AI 记录的角色都会带上这个字段；只有设为 AI 自动更新时才由 AI 填写。NPC 的身份、外貌、穿着、性格、年龄已由档案自动记录，不必为此建字段。
            </span>
          </Checkbox>
          {replacedProfileFieldLabel && (
            <p className="we-state-field-hint">该字段将取代 NPC 档案中的『{replacedProfileFieldLabel}』</p>
          )}
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
      <TagInput
        label="枚举选项"
        placeholder="输入选项后按回车"
        values={form.enum_options}
        onAdd={(value) => updateStateFieldForm(setForm, 'enum_options', [...form.enum_options, value])}
        onRemove={removeEnum}
      />
    </div>
  );
}

function ListDefaultsEditor({ form, setForm }) {
  return (
    <div>
      <label className={labelCls}>默认条目（回车添加）</label>
      <TagInput
        label="列表默认条目"
        placeholder="输入条目后按回车"
        max={STATE_LIST_MAX_ITEMS}
        values={form.list_defaults}
        onAdd={(value) => updateStateFieldForm(setForm, 'list_defaults', [...form.list_defaults, value])}
        onRemove={(value) => updateStateFieldForm(setForm, 'list_defaults', form.list_defaults.filter((item) => item !== value))}
      />
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
            <Card key={index} variant="outlined" className="we-state-table-col-card">
              <div className="we-state-table-col-header">
                <span className="we-state-table-col-title">列 {index + 1}</span>
                {keyLocked && (
                  <Badge title="已落库列的 key 不可修改；如需更名请先删除该列再新增">已落库</Badge>
                )}
                <Button type="button" size="sm" variant="ghost" onClick={() => removeColumn(index)}
                  aria-label="删除列">删除</Button>
              </div>
              <div className="we-state-table-col-body">
                <div className="we-state-table-col-row2">
                  <div className="we-state-table-col-field">
                    <span className="we-state-table-col-field-label">字段 key</span>
                    <Input value={column.key}
                      onChange={(event) => updateColumn(index, { key: event.target.value.replace(/\s/g, '_') })}
                      placeholder="如 strength" aria-label="列 key" disabled={keyLocked} />
                  </div>
                  <div className="we-state-table-col-field">
                    <span className="we-state-table-col-field-label">表头名称</span>
                    <Input value={column.label}
                      onChange={(event) => updateColumn(index, { label: event.target.value })}
                      placeholder="如 力量" aria-label="列表头" />
                  </div>
                </div>
                <div className="we-state-table-col-row3">
                  <div className="we-state-table-col-field">
                    <span className="we-state-table-col-field-label">最小值</span>
                    <Input type="number" value={column.min ?? ''}
                      onChange={(event) => updateColumn(index, { min: event.target.value })}
                      placeholder="—" aria-label="列下限" />
                  </div>
                  <div className="we-state-table-col-field">
                    <span className="we-state-table-col-field-label">最大值</span>
                    <Input type="number" value={column.max ?? ''}
                      onChange={(event) => updateColumn(index, { max: event.target.value })}
                      placeholder="—" aria-label="列上限" />
                  </div>
                  <div className="we-state-table-col-field">
                    <span className="we-state-table-col-field-label">默认值</span>
                    <Input type="number"
                      value={form.table_defaults[column.key] ?? ''}
                      onChange={(event) => updateStateFieldForm(setForm, 'table_defaults', {
                        ...form.table_defaults,
                        [column.key]: event.target.value,
                      })}
                      placeholder="0" aria-label="列默认值" />
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <Button type="button" size="sm" variant="secondary" onClick={addColumn}
        className="self-start">+ 添加列</Button>
    </div>
  );
}

function NumberSettings({ form, setForm }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div>
        <label className={labelCls}>最小值</label>
        <Input type="number" value={form.min_value}
          onChange={(event) => updateStateFieldForm(setForm, 'min_value', event.target.value)} placeholder="不限" />
      </div>
      <div>
        <label className={labelCls}>最大值</label>
        <Input type="number" value={form.max_value}
          onChange={(event) => updateStateFieldForm(setForm, 'max_value', event.target.value)} placeholder="不限" />
      </div>
      <div>
        <label className={labelCls}>单位</label>
        <Input value={form.unit}
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
      <Input value={form.prefix}
        onChange={(event) => updateStateFieldForm(setForm, 'prefix', event.target.value)}
        placeholder="如：第三纪元 / 公元" />
    </div>
  );
}

function DefaultValueField({ form, setForm }) {
  return (
    <div>
      <label className={labelCls}>默认值</label>
      {form.type === 'datetime' ? (
        <DatetimeSplitInput
          value={ISO_DATETIME_RE.test(form.default_value) ? form.default_value : ''}
          onChange={(value) => updateStateFieldForm(setForm, 'default_value', value)}
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
        <Input value={form.default_value}
          onChange={(event) => updateStateFieldForm(setForm, 'default_value', event.target.value)}
          placeholder="留空表示无默认值" />
      )}
    </div>
  );
}
