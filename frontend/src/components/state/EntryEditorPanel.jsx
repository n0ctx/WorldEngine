import { useRef } from 'react';
import MarkdownEditor from '../ui/MarkdownEditor';
import EntryEditorKeywordFields from './EntryEditorKeywordFields.jsx';
import EntryEditorStateFields from './EntryEditorStateFields.jsx';
import { clampActiveTurns, clampToken, emptyCondition, TRIGGER_SEGMENTS } from './entryEditorRules.js';

export default function EntryEditorPanel({ model, inline }) {
  const {
    isNew, form, setForm, saving, existingGroupNames, onClose,
    keywordInput, setKeywordInput, keywordRef, addKeyword, removeKeyword,
    suggestion, handleAdoptSuggestion, handleDismissSuggestion,
    conditions, fieldTypeMap, rawFieldsByScope, updateCondition, setConditions, handleSave,
  } = model;
  const mouseDownOnOverlay = useRef(false);
  const panel = (
      <div
        className={`we-entry-editor-panel${inline ? ' we-entry-editor-panel--inline' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="we-entry-editor-title">
          {isNew ? '新建条目' : '编辑条目'}
        </h3>

        {/* 标题 */}
        <label className="we-entry-editor-label">标题</label>
        <input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          className="we-entry-editor-field we-entry-editor-field-mb"
        />

        {/* 分组：条目自己的一个属性，不是必填；输入框带既有分组建议 */}
        <label className="we-entry-editor-label">分组（可选，用于左栏导航）</label>
        <div className="we-entry-group-row we-entry-editor-field-mb">
          <input
            list="we-entry-group-suggestions"
            value={form.group_name}
            onChange={(e) => setForm((f) => ({ ...f, group_name: e.target.value }))}
            placeholder="例如：城市地理"
            className="we-entry-editor-field"
          />
          <datalist id="we-entry-group-suggestions">
            {(existingGroupNames ?? []).map((name) => <option key={name} value={name} />)}
          </datalist>
        </div>

        {/* 何时生效：机制降级为条目的一个属性，切换后下方对应参数区跟着变 */}
        <label className="we-entry-editor-label">何时生效</label>
        <div className="we-trigger-segmented we-entry-editor-field-mb" role="radiogroup" aria-label="触发机制">
          {TRIGGER_SEGMENTS.map((seg) => (
            <button
              key={seg.key}
              type="button"
              role="radio"
              aria-checked={form.trigger_type === seg.key}
              className={`we-trigger-segmented-btn${form.trigger_type === seg.key ? ' is-active' : ''}`}
              onClick={() => setForm((f) => ({ ...f, trigger_type: seg.key }))}
            >
              <span className={`we-trigger-dot we-trigger-dot--${seg.key}`} aria-hidden="true" />
              {seg.label}
            </button>
          ))}
        </div>

        {/* 顺序权重 / 生效轮数（同一行） */}
        <div className="we-entry-editor-inline-row">
          <div className="we-entry-editor-inline-col">
            <label className="we-entry-editor-label">
              顺序权重（越大越靠后，默认 1）
              {form.trigger_type === 'always' && (
                <span className="we-entry-editor-hint"> · 设为 0 进入 CACHED LAYER</span>
              )}
            </label>
            <input
              type="number"
              min={form.trigger_type === 'always' ? 0 : 1}
              step={1}
              value={form.token}
              onChange={(e) => {
                setForm((f) => ({ ...f, token: clampToken(e.target.value, f.trigger_type) }));
              }}
              className="we-entry-editor-field"
              style={{ width: '80px' }}
            />
          </div>
          {form.trigger_type === 'keyword' && (
            <div className="we-entry-editor-inline-col">
              <label className="we-entry-editor-label">
                生效轮数（默认 1）
                <span className="we-entry-editor-hint"> · 设为 0 永久生效</span>
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={form.active_turns}
                onChange={(e) => {
                  setForm((f) => ({ ...f, active_turns: clampActiveTurns(e.target.value) }));
                }}
                className="we-entry-editor-field"
                style={{ width: '80px' }}
              />
            </div>
          )}
        </div>
        {form.trigger_type === 'always' && form.token === 0 && (
          <div className="we-entry-editor-cached-note we-entry-editor-field-mb">
            此条目将进入 CACHED LAYER，每轮稳定注入，作为 prompt cache 的一部分。
          </div>
        )}
        {form.trigger_type === 'keyword' && form.active_turns === 0 && (
          <div className="we-entry-editor-cached-note we-entry-editor-field-mb">
            此条目一旦命中将永久生效，不再随轮次衰减。
          </div>
        )}
        {!(
          (form.trigger_type === 'always' && form.token === 0) ||
          (form.trigger_type === 'keyword' && form.active_turns === 0)
        ) && (
          <div className="we-entry-editor-field-mb" />
        )}

        {/* 内容 */}
        <label className="we-entry-editor-label">内容</label>
        <div className="we-entry-editor-content-wrap">
          <MarkdownEditor
            value={form.content}
            onChange={(md) => setForm((f) => ({ ...f, content: md }))}
            placeholder="条目内容…"
            minHeight={120}
          />
        </div>

        {/* 智能建议：非侵入，不点「采用」不影响已选机制 */}
        {suggestion && (
          <div className="we-trigger-suggestion we-entry-editor-field-mb" data-testid="trigger-suggestion">
            <span className="we-trigger-suggestion-text">{suggestion.reason}</span>
            <div className="we-trigger-suggestion-actions">
              <button type="button" className="we-btn we-btn-sm we-btn-secondary" onClick={handleAdoptSuggestion}>
                采用
              </button>
              <button
                type="button"
                className="we-entry-condition-icon-btn"
                aria-label="忽略此建议"
                onClick={handleDismissSuggestion}
              >
                ×
              </button>
            </div>
          </div>
        )}

        {form.trigger_type === 'keyword' && (
          <EntryEditorKeywordFields
            keywords={form.keywords}
            keywordInput={keywordInput}
            setKeywordInput={setKeywordInput}
            keywordLogic={form.keyword_logic}
            setKeywordLogic={(keyword_logic) => setForm((current) => ({ ...current, keyword_logic }))}
            keywordScope={form.keyword_scope}
            setKeywordScope={(keyword_scope) => setForm((current) => ({ ...current, keyword_scope }))}
            keywordRef={keywordRef}
            addKeyword={addKeyword}
            removeKeyword={removeKeyword}
          />
        )}

        {/* 触发描述（仅 llm 类型） */}
        {form.trigger_type === 'llm' && (
          <>
            <label className="we-entry-editor-label">触发条件描述（供 AI 判断）</label>
            <div className="we-entry-editor-content-wrap">
              <MarkdownEditor
                value={form.description}
                onChange={(md) => setForm((f) => ({ ...f, description: md }))}
                placeholder="描述此条目应在何种情境下被注入…"
                minHeight={72}
              />
            </div>
          </>
        )}

        {form.trigger_type === 'state' && (
          <EntryEditorStateFields
            conditions={conditions}
            conditionLogic={form.condition_logic}
            setConditionLogic={(condition_logic) => setForm((current) => ({ ...current, condition_logic }))}
            fieldTypeMap={fieldTypeMap}
            rawFieldsByScope={rawFieldsByScope}
            updateCondition={updateCondition}
            removeCondition={(index) => setConditions((previous) => previous.filter((_, current) => current !== index))}
            addCondition={() => setConditions((previous) => [...previous, emptyCondition()])}
          />
        )}

        {/* 按钮 */}
        <div className="we-entry-editor-footer">
          <button onClick={onClose} className="we-entry-editor-cancel">取消</button>
          <button
            onClick={handleSave}
            disabled={saving || !form.title.trim()}
            className="we-entry-editor-save"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
  );


  if (inline) return panel;
  return (
    <div
      className="we-entry-editor-overlay"
      onMouseDown={(event) => { mouseDownOnOverlay.current = event.target === event.currentTarget; }}
      onClick={() => { if (mouseDownOnOverlay.current) onClose(); }}
    >
      {panel}
    </div>
  );
}
