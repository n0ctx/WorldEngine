import { handleTagInputKeyDown } from '../../core/utils/tag-input.js';

export default function EntryEditorKeywordFields({
  keywords,
  keywordInput,
  setKeywordInput,
  keywordLogic,
  setKeywordLogic,
  keywordScope,
  setKeywordScope,
  keywordRef,
  addKeyword,
  removeKeyword,
}) {
  return (
    <>
      <label className="we-entry-editor-label">触发范围（命中后注入；至少勾选一项）</label>
      <div className="we-entry-editor-scope-row we-entry-editor-field-mb">
        {['user', 'assistant'].map((scope) => (
          <label key={scope} className="we-entry-editor-scope-item">
            <input
              type="checkbox"
              checked={keywordScope.includes(scope)}
              onChange={() => setKeywordScope(keywordScope.includes(scope)
                ? keywordScope.filter((value) => value !== scope)
                : ['user', 'assistant'].filter((value) => value === scope || keywordScope.includes(value)))}
            />
            {scope === 'user' ? 'user 消息' : 'assistant 消息'}
          </label>
        ))}
      </div>

      <div className="we-entry-condition-logic-row">
        <label className="we-entry-editor-label">
          触发关键词（{keywordLogic === 'AND' ? '全部命中时注入' : '任一命中时注入'}，回车添加）
        </label>
        <div className="we-entry-condition-logic-toggle">
          <button
            type="button"
            className={`we-entry-condition-logic-btn${keywordLogic === 'AND' ? ' active' : ''}`}
            onClick={() => setKeywordLogic('AND')}
          >AND</button>
          <button
            type="button"
            className={`we-entry-condition-logic-btn${keywordLogic === 'OR' ? ' active' : ''}`}
            onClick={() => setKeywordLogic('OR')}
          >OR</button>
        </div>
      </div>
      <div
        className="we-tag-input we-entry-editor-field-mb"
        onClick={() => keywordRef.current?.focus()}
        role="group"
        aria-label="触发关键词标签输入区"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.currentTarget.querySelector('input')?.focus();
          }
        }}
      >
        {keywords.map((value) => (
          <span key={value} className="we-tag">
            {value}
            <button
              type="button"
              aria-label={`删除关键词 ${value}`}
              onClick={(event) => { event.stopPropagation(); removeKeyword(value); }}
            >×</button>
          </span>
        ))}
        <input
          ref={keywordRef}
          className="we-tag-input-field"
          value={keywordInput}
          onChange={(event) => setKeywordInput(event.target.value)}
          onKeyDown={(event) => handleTagInputKeyDown(event, keywordInput, keywords, addKeyword, removeKeyword)}
          onBlur={() => { if (keywordInput.trim()) addKeyword(keywordInput); }}
          placeholder={keywords.length === 0 ? '输入关键词后按回车' : ''}
          aria-label="输入触发关键词"
        />
      </div>
    </>
  );
}
