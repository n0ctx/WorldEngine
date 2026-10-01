import { X } from 'lucide-react';
import { Button, Card, IconButton, Input, MarkdownEditor, SectionTitle, SegmentedControl } from '../index.js';
import Dialog from '../ui/Dialog';
import EntryEditorKeywordFields from './EntryEditorKeywordFields.jsx';
import EntryEditorStateFields from './EntryEditorStateFields.jsx';
import { clampActiveTurns, clampToken, emptyCondition, TRIGGER_SEGMENTS } from './entryEditorRules.js';

const TRIGGER_OPTIONS = TRIGGER_SEGMENTS.map((seg) => ({
  value: seg.key,
  label: (
    <>
      <span className={`we-trigger-dot we-trigger-dot--${seg.key}`} aria-hidden="true" />
      {seg.label}
    </>
  ),
}));

export default function EntryEditorPanel({ model, inline }) {
  const {
    isNew, form, setForm, saving, onClose,
    addKeyword, removeKeyword,
    suggestion, handleAdoptSuggestion, handleDismissSuggestion,
    conditions, fieldTypeMap, rawFieldsByScope, updateCondition, setConditions, handleSave,
  } = model;
  const title = isNew ? '新建条目' : '编辑条目';
  const body = (
    <>
      {/* 标题 */}
      <label className="we-entry-editor-label">标题</label>
      <Input
        size="sm"
        value={form.title}
        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        className="we-entry-editor-field-mb"
      />

      <label className="we-entry-editor-label">何时生效</label>
      <SegmentedControl
        size="sm"
        label="触发机制"
        className="we-entry-editor-field-mb"
        options={TRIGGER_OPTIONS}
        value={form.trigger_type}
        onChange={(trigger_type) => setForm((f) => ({ ...f, trigger_type }))}
      />

      {/* 顺序权重 / 生效轮数（同一行） */}
      <div className="we-entry-editor-inline-row">
        <div className="we-entry-editor-inline-col">
          <label className="we-entry-editor-label">
            顺序权重（越大越靠后，默认 1）
            {form.trigger_type === 'always' && (
              <span className="we-entry-editor-hint"> · 设为 0 进入 CACHED LAYER</span>
            )}
          </label>
          <Input
            size="sm"
            type="number"
            min={form.trigger_type === 'always' ? 0 : 1}
            step={1}
            value={form.token}
            onChange={(e) => {
              setForm((f) => ({ ...f, token: clampToken(e.target.value, f.trigger_type) }));
            }}
            style={{ width: '80px' }}
          />
        </div>
        {form.trigger_type === 'keyword' && (
          <div className="we-entry-editor-inline-col">
            <label className="we-entry-editor-label">
              生效轮数（默认 1）
              <span className="we-entry-editor-hint"> · 设为 0 永久生效</span>
            </label>
            <Input
              size="sm"
              type="number"
              min={0}
              step={1}
              value={form.active_turns}
              onChange={(e) => {
                setForm((f) => ({ ...f, active_turns: clampActiveTurns(e.target.value) }));
              }}
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
            <Button type="button" size="sm" variant="secondary" onClick={handleAdoptSuggestion}>
              采用
            </Button>
            <IconButton size="sm" label="忽略此建议" onClick={handleDismissSuggestion}>
              <X size={16} />
            </IconButton>
          </div>
        </div>
      )}

      {form.trigger_type === 'keyword' && (
        <EntryEditorKeywordFields
          keywords={form.keywords}
          keywordLogic={form.keyword_logic}
          setKeywordLogic={(keyword_logic) => setForm((current) => ({ ...current, keyword_logic }))}
          keywordScope={form.keyword_scope}
          setKeywordScope={(keyword_scope) => setForm((current) => ({ ...current, keyword_scope }))}
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
    </>
  );
  const actions = (
    <>
      <Button variant="ghost" onClick={onClose}>取消</Button>
      <Button
        variant="primary"
        onClick={handleSave}
        disabled={saving || !form.title.trim()}
      >
        {saving ? '保存中…' : '保存'}
      </Button>
    </>
  );

  if (inline) {
    return (
      <Card variant="sunken" className="we-entry-editor-panel" onClick={(e) => e.stopPropagation()}>
        <SectionTitle level="group">{title}</SectionTitle>
        {body}
        <div className="we-entry-editor-footer">{actions}</div>
      </Card>
    );
  }
  return (
    <Dialog size="xl" title={title} busy={saving} onClose={onClose} footer={actions}>
      {body}
    </Dialog>
  );
}
