import { X } from 'lucide-react';
import DatetimePartInput from './DatetimePartInput';
import Button from '../ui/Button';
import IconButton from '../ui/IconButton';
import Input from '../ui/Input';
import Select from '../ui/Select';
import SegmentedControl from '../ui/SegmentedControl';
import { getColOptions, getFieldOptions, getOpsForField, SCOPE_OPTIONS } from './entryEditorRules.js';

const LOGIC_OPTIONS = [
  { value: 'AND', label: 'AND' },
  { value: 'OR', label: 'OR' },
];

export default function EntryEditorStateFields({
  conditions,
  setConditionLogic,
  conditionLogic,
  fieldTypeMap,
  rawFieldsByScope,
  updateCondition,
  removeCondition,
  addCondition,
}) {
  return (
    <>
      <div className="we-entry-condition-logic-row">
        <label className="we-entry-editor-label">
          状态条件（{conditionLogic === 'OR' ? '任一满足时注入' : '全部满足时注入'}）
        </label>
        <SegmentedControl
          size="sm"
          label="状态条件匹配方式"
          options={LOGIC_OPTIONS}
          value={conditionLogic}
          onChange={setConditionLogic}
        />
      </div>
      {conditions.map((condition, index) => {
        const operators = getOpsForField(condition.target_field, fieldTypeMap);
        const isDatetime = fieldTypeMap.get(condition.target_field) === 'datetime';
        const columnOptions = getColOptions(rawFieldsByScope, condition.scope, condition.field_label);
        return (
          <div key={index} className="we-entry-condition">
            <div className="we-entry-condition-field">
              <Select
                size="sm"
                value={condition.scope}
                onChange={(value) => updateCondition(index, { scope: value })}
                options={SCOPE_OPTIONS}
              />
              <Select
                size="sm"
                value={condition.field_label}
                onChange={(value) => updateCondition(index, { field_label: value })}
                options={getFieldOptions(rawFieldsByScope, condition.scope)}
                disabled={!condition.scope}
              />
              {columnOptions && (
                <Select
                  size="sm"
                  value={condition.col_key}
                  onChange={(value) => updateCondition(index, { col_key: value })}
                  options={columnOptions}
                />
              )}
            </div>
            <div className="we-entry-condition-op">
              <Select
                size="sm"
                value={condition.operator}
                onChange={(value) => updateCondition(index, { operator: value })}
                options={operators}
              />
            </div>
            {isDatetime ? (
              <DatetimePartInput
                value={condition.value}
                onChange={(value) => updateCondition(index, { value })}
                className="we-entry-condition-value"
              />
            ) : (
              <Input
                size="sm"
                type="text"
                value={condition.value}
                onChange={(event) => updateCondition(index, { value: event.target.value })}
                placeholder="值"
                className="we-entry-condition-value"
                aria-label={`状态条件 ${index + 1} 的值`}
              />
            )}
            <IconButton
              size="sm"
              variant="danger"
              onClick={() => removeCondition(index)}
              label={`删除状态条件 ${index + 1}`}
            >
              <X size={16} />
            </IconButton>
          </div>
        );
      })}
      <Button type="button" size="sm" variant="secondary" onClick={addCondition}>
        + 添加条件
      </Button>
    </>
  );
}
