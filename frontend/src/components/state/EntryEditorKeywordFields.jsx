import Checkbox from '../ui/Checkbox';
import SegmentedControl from '../ui/SegmentedControl';
import TagInput from '../ui/TagInput';

const LOGIC_OPTIONS = [
  { value: 'AND', label: 'AND' },
  { value: 'OR', label: 'OR' },
];

export default function EntryEditorKeywordFields({
  keywords,
  keywordLogic,
  setKeywordLogic,
  keywordScope,
  setKeywordScope,
  addKeyword,
  removeKeyword,
}) {
  return (
    <>
      <label className="we-entry-editor-label">触发范围（命中后注入；至少勾选一项）</label>
      <div className="we-entry-editor-scope-row we-entry-editor-field-mb">
        {['user', 'assistant'].map((scope) => (
          <Checkbox
            key={scope}
            checked={keywordScope.includes(scope)}
            onChange={(checked) => setKeywordScope(checked
              ? ['user', 'assistant'].filter((value) => value === scope || keywordScope.includes(value))
              : keywordScope.filter((value) => value !== scope))}
          >
            {scope === 'user' ? 'user 消息' : 'assistant 消息'}
          </Checkbox>
        ))}
      </div>

      <div className="we-entry-condition-logic-row">
        <label className="we-entry-editor-label">
          触发关键词（{keywordLogic === 'AND' ? '全部命中时注入' : '任一命中时注入'}，回车添加）
        </label>
        <SegmentedControl
          size="sm"
          label="关键词匹配方式"
          options={LOGIC_OPTIONS}
          value={keywordLogic}
          onChange={setKeywordLogic}
        />
      </div>
      <TagInput
        className="we-entry-editor-field-mb"
        label="触发关键词"
        placeholder="输入关键词后按回车"
        values={keywords}
        onAdd={addKeyword}
        onRemove={removeKeyword}
      />
    </>
  );
}
