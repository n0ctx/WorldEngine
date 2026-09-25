import DatetimePartInput from './DatetimePartInput';
import Select from '../ui/Select';
import { getColOptions, getFieldOptions, getOpsForField, SCOPE_OPTIONS } from './entryEditorRules.js';

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
        <div className="we-entry-condition-logic-toggle">
          <button
            type="button"
            className={`we-entry-condition-logic-btn${conditionLogic === 'AND' ? ' active' : ''}`}
            onClick={() => setConditionLogic('AND')}
          >AND</button>
          <button
            type="button"
            className={`we-entry-condition-logic-btn${conditionLogic === 'OR' ? ' active' : ''}`}
            onClick={() => setConditionLogic('OR')}
          >OR</button>
        </div>
      </div>
      {conditions.map((condition, index) => {
        const operators = getOpsForField(condition.target_field, fieldTypeMap);
        const isDatetime = fieldTypeMap.get(condition.target_field) === 'datetime';
        const columnOptions = getColOptions(rawFieldsByScope, condition.scope, condition.field_label);
        return (
          <div key={index} className="we-entry-condition">
            <div className="we-entry-condition-field">
              <Select
                value={condition.scope}
                onChange={(value) => updateCondition(index, { scope: value })}
                options={SCOPE_OPTIONS}
              />
              <Select
                value={condition.field_label}
                onChange={(value) => updateCondition(index, { field_label: value })}
                options={getFieldOptions(rawFieldsByScope, condition.scope)}
                disabled={!condition.scope}
              />
              {columnOptions && (
                <Select
                  value={condition.col_key}
                  onChange={(value) => updateCondition(index, { col_key: value })}
                  options={columnOptions}
                />
              )}
            </div>
            <div className="we-entry-condition-op">
              <Select
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
              <input
                type="text"
                value={condition.value}
                onChange={(event) => updateCondition(index, { value: event.target.value })}
                placeholder="值"
                className="we-entry-condition-input we-entry-condition-value"
                aria-label={`状态条件 ${index + 1} 的值`}
              />
            )}
            <button
              type="button"
              onClick={() => removeCondition(index)}
              className="we-entry-condition-icon-btn we-entry-condition-icon-btn--danger"
              aria-label={`删除状态条件 ${index + 1}`}
            >×</button>
          </div>
        );
      })}
      <button type="button" onClick={addCondition} className="we-entry-condition-add-btn">
        + 添加条件
      </button>
    </>
  );
}
