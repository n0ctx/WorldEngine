import { useState, useEffect, useRef } from 'react';
import { createWorldEntry, updateWorldEntry, getEntryConditions, replaceEntryConditions } from '../../core/api/prompt-entries';
import { listWorldStateFields } from '../../core/api/world-state-fields';
import { listCharacterStateFields } from '../../core/api/character-state-fields';
import { listPersonaStateFields } from '../../core/api/persona-state-fields';
import MarkdownEditor from '../ui/MarkdownEditor';
import Select from '../ui/Select';
import DatetimePartInput from './DatetimePartInput';
import { log } from '../../core/utils/logger.js';

const NUMERIC_TYPES = new Set(['number', 'integer', 'float', 'datetime']);
const NUMERIC_OPS = [
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '=', label: '=' },
  { value: '>=', label: '>=' },
  { value: '<=', label: '<=' },
  { value: '!=', label: '!=' },
];
const TEXT_OPS = [
  { value: '包含', label: '包含' },
  { value: '等于', label: '等于' },
  { value: '不包含', label: '不包含' },
];
const SCOPE_OPTIONS = [
  { value: '世界', label: '世界' },
  { value: '角色', label: '角色' },
  { value: '玩家', label: '玩家' },
];

function emptyCondition() {
  return { scope: '', field_label: '', col_key: '', target_field: '', operator: '>', value: '' };
}

function parseTargetField(tf) {
  const parts = tf ? tf.split('.') : [];
  if (parts.length === 3) return { scope: parts[0], field_label: parts[1], col_key: parts[2] };
  if (parts.length === 2) return { scope: parts[0], field_label: parts[1], col_key: '' };
  return { scope: '', field_label: '', col_key: '' };
}

function getFieldOptions(rawFieldsByScope, scope) {
  return (rawFieldsByScope[scope] || []).map((f) => ({ value: f.label, label: f.label }));
}

function getColOptions(rawFieldsByScope, scope, fieldLabel) {
  const f = (rawFieldsByScope[scope] || []).find((x) => x.label === fieldLabel);
  if (f?.type !== 'table') return null;
  const cols = Array.isArray(f.table_columns) ? f.table_columns : [];
  return cols.map((c) => ({ value: c.key, label: c.label || c.key }));
}

function clampToken(value, triggerType) {
  const n = parseInt(value, 10);
  const min = triggerType === 'always' ? 0 : 1;
  if (!Number.isFinite(n)) return min;
  return Math.max(min, n);
}

function clampActiveTurns(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return 1;
  return n;
}

function parseKeywordScope(raw) {
  if (Array.isArray(raw)) {
    return raw.filter((v) => v === 'user' || v === 'assistant');
  }
  if (typeof raw !== 'string') return ['user'];
  const items = raw.split(',').map((s) => s.trim().toLowerCase()).filter((v) => v === 'user' || v === 'assistant');
  return [...new Set(items)];
}

// 字段视图/向导新建条目时，预填某字段为第一个条件
// prefill: { scope: '世界'|'角色'|'玩家', field_label }
function buildPrefillCondition(prefill, typeMap) {
  if (!prefill?.scope || !prefill?.field_label) return null;
  const target_field = `${prefill.scope}.${prefill.field_label}`;
  const type = typeMap.get(target_field);
  const operator = type && !NUMERIC_TYPES.has(type) ? '包含' : '>';
  return {
    scope: prefill.scope,
    field_label: prefill.field_label,
    col_key: '',
    target_field,
    operator,
    value: '',
  };
}

function getOpsForField(targetField, fieldTypeMap) {
  const type = fieldTypeMap.get(targetField);
  if (!type) return [...NUMERIC_OPS, ...TEXT_OPS];
  return NUMERIC_TYPES.has(type) ? NUMERIC_OPS : TEXT_OPS;
}

export default function EntryEditor({ worldId, entry, defaultTriggerType, prefillCondition, onClose, onSave, inline = false }) {
  const isNew = !entry?.id;
  const [form, setForm] = useState({
    title: entry?.title ?? '',
    content: entry?.content ?? '',
    description: entry?.description ?? '',
    keywords: entry?.keywords ?? [],
    trigger_type: entry?.trigger_type ?? defaultTriggerType ?? 'always',
    condition_logic: entry?.condition_logic ?? 'AND',
    keyword_logic: entry?.keyword_logic === 'AND' ? 'AND' : 'OR',
    keyword_scope: entry ? parseKeywordScope(entry.keyword_scope) : ['user', 'assistant'],
    active_turns: clampActiveTurns(entry?.active_turns ?? 1),
    token: entry?.token ?? 1,
  });
  const [saving, setSaving] = useState(false);
  const [keywordInput, setKeywordInput] = useState('');
  const keywordRef = useRef(null);
  const mouseDownOnOverlay = useRef(false);
  // 仅在挂载时读取一次，避免父级重渲染改变对象身份时触发 effect 重跑、清空用户已编辑的条件
  const prefillRef = useRef(prefillCondition);

  function addKeyword(raw) {
    const v = String(raw ?? '').trim();
    if (!v) return;
    setForm((f) => (f.keywords.includes(v) ? f : { ...f, keywords: [...f.keywords, v] }));
    setKeywordInput('');
  }
  function removeKeyword(v) {
    setForm((f) => ({ ...f, keywords: f.keywords.filter((k) => k !== v) }));
  }

  // state 类型专用
  const [conditions, setConditions] = useState([emptyCondition()]);
  const [rawFieldsByScope, setRawFieldsByScope] = useState({});
  const [fieldTypeMap, setFieldTypeMap] = useState(new Map());

  // 当 trigger_type 切换为 state 时，加载字段选项 + 已有条件
  useEffect(() => {
    if (form.trigger_type !== 'state') return;
    async function load() {
      try {
        const [worldFields, charFields, personaFields] = await Promise.all([
          listWorldStateFields(worldId),
          listCharacterStateFields(worldId),
          listPersonaStateFields(worldId),
        ]);
        setRawFieldsByScope({ 世界: worldFields, 玩家: personaFields, 角色: charFields });
        const typeMap = new Map();
        const rebuildTypeMap = (scope, fields) => {
          for (const f of fields) {
            const baseKey = `${scope}.${f.label}`;
            if (f.type === 'table') {
              const cols = Array.isArray(f.table_columns) ? f.table_columns : [];
              for (const col of cols) {
                if (col?.key) typeMap.set(`${baseKey}.${col.key}`, 'number');
              }
            } else {
              typeMap.set(baseKey, f.type);
            }
          }
        };
        rebuildTypeMap('世界', worldFields);
        rebuildTypeMap('玩家', personaFields);
        rebuildTypeMap('角色', charFields);
        setFieldTypeMap(typeMap);

        if (!isNew && form.trigger_type === 'state') {
          const conds = await getEntryConditions(entry.id);
          setConditions(conds.length > 0
            ? conds.map((c) => ({ ...c, ...parseTargetField(c.target_field) }))
            : [emptyCondition()]);
        } else {
          setConditions([buildPrefillCondition(prefillRef.current, typeMap) ?? emptyCondition()]);
        }
      } catch (err) {
        log.error('entry.fields.load_failed', err, { toast: err.message || '加载状态字段失败' });
      }
    }
    load();
  }, [entry?.id, form.trigger_type, isNew, worldId]);

  function updateCondition(index, patch) {
    setConditions((prev) => prev.map((c, i) => {
      if (i !== index) return c;
      const next = { ...c, ...patch };
      if ('scope' in patch) {
        next.field_label = '';
        next.col_key = '';
      }
      if ('field_label' in patch) {
        next.col_key = '';
      }
      if (next.scope && next.field_label) {
        next.target_field = next.col_key
          ? `${next.scope}.${next.field_label}.${next.col_key}`
          : `${next.scope}.${next.field_label}`;
      } else {
        next.target_field = '';
      }
      if ('scope' in patch || 'field_label' in patch || 'col_key' in patch) {
        const ops = getOpsForField(next.target_field, fieldTypeMap);
        next.operator = ops[0].value;
      }
      return next;
    }));
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    if (form.trigger_type === 'keyword' && form.keyword_scope.length === 0) {
      log.error('entry.role.invalid', null, { toast: '必须勾选 user 或 assistant 至少一项' });
      return;
    }
    setSaving(true);
    const draft = keywordInput.trim();
    const finalKeywords = draft && !form.keywords.includes(draft)
      ? [...form.keywords, draft]
      : form.keywords;
    const data = {
      title: form.title.trim(),
      content: form.content,
      description: form.description,
      keywords: form.trigger_type === 'keyword' ? finalKeywords : null,
      trigger_type: form.trigger_type,
      condition_logic: form.condition_logic,
      keyword_logic: form.keyword_logic,
      keyword_scope: form.keyword_scope.join(','),
      active_turns: clampActiveTurns(form.active_turns),
      token: clampToken(form.token, form.trigger_type),
    };
    try {
      let saved;
      if (isNew) {
        saved = await createWorldEntry(worldId, data);
      } else {
        saved = await updateWorldEntry(entry.id, data);
      }
      if (form.trigger_type === 'state') {
        const entryId = isNew ? saved.id : entry.id;
        const validConditions = conditions.filter((c) => c.target_field && c.value && !/^(year|month|day|hour|minute):$/.test(c.value));
        await replaceEntryConditions(entryId, validConditions);
      }
      onSave();
    } catch (err) {
      log.error('entry.save_failed', err, { toast: `保存失败：${err.message}` });
      setSaving(false);
    }
  }

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

        {/* 关键词（仅 keyword 类型） */}
        {form.trigger_type === 'keyword' && (
          <>
            {/* 触发范围 */}
            <label className="we-entry-editor-label">触发范围（命中后注入；至少勾选一项）</label>
            <div className="we-entry-editor-scope-row we-entry-editor-field-mb">
              {['user', 'assistant'].map((scope) => {
                const checked = form.keyword_scope.includes(scope);
                return (
                  <label key={scope} className="we-entry-editor-scope-item">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setForm((f) => {
                          const set = new Set(f.keyword_scope);
                          if (set.has(scope)) set.delete(scope); else set.add(scope);
                          return { ...f, keyword_scope: ['user', 'assistant'].filter((s) => set.has(s)) };
                        });
                      }}
                    />
                    {scope === 'user' ? 'user 消息' : 'assistant 消息'}
                  </label>
                );
              })}
            </div>

            {/* 关键词 + AND/OR 切换 */}
            <div className="we-entry-condition-logic-row">
              <label className="we-entry-editor-label">
                触发关键词（{form.keyword_logic === 'AND' ? '全部命中时注入' : '任一命中时注入'}，回车添加）
              </label>
              <div className="we-entry-condition-logic-toggle">
                <button
                  type="button"
                  className={`we-entry-condition-logic-btn${form.keyword_logic === 'AND' ? ' active' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, keyword_logic: 'AND' }))}
                >AND</button>
                <button
                  type="button"
                  className={`we-entry-condition-logic-btn${form.keyword_logic === 'OR' ? ' active' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, keyword_logic: 'OR' }))}
                >OR</button>
              </div>
            </div>
            <div
              className="we-tag-input we-entry-editor-field-mb"
              onClick={() => keywordRef.current?.focus()}
              role="group"
              aria-label="触发关键词标签输入区"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.currentTarget.querySelector('input')?.focus();
                }
              }}
            >
              {form.keywords.map((v) => (
                <span key={v} className="we-tag">
                  {v}
                  <button type="button" onClick={(e) => { e.stopPropagation(); removeKeyword(v); }}>×</button>
                </span>
              ))}
              <input
                ref={keywordRef}
                className="we-tag-input-field"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); addKeyword(keywordInput); }
                  else if (e.key === 'Backspace' && keywordInput === '' && form.keywords.length) {
                    removeKeyword(form.keywords[form.keywords.length - 1]);
                  }
                }}
                onBlur={() => { if (keywordInput.trim()) addKeyword(keywordInput); }}
                placeholder={form.keywords.length === 0 ? '输入关键词后按回车' : ''}
              />
            </div>
          </>
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

        {/* 状态条件（仅 state 类型） */}
        {form.trigger_type === 'state' && (
          <>
            <div className="we-entry-condition-logic-row">
              <label className="we-entry-editor-label">
                状态条件（{form.condition_logic === 'OR' ? '任一满足时注入' : '全部满足时注入'}）
              </label>
              <div className="we-entry-condition-logic-toggle">
                <button
                  type="button"
                  className={`we-entry-condition-logic-btn${form.condition_logic === 'AND' ? ' active' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, condition_logic: 'AND' }))}
                >AND</button>
                <button
                  type="button"
                  className={`we-entry-condition-logic-btn${form.condition_logic === 'OR' ? ' active' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, condition_logic: 'OR' }))}
                >OR</button>
              </div>
            </div>
            {conditions.map((cond, i) => {
              const ops = getOpsForField(cond.target_field, fieldTypeMap);
              const isDatetimeField = fieldTypeMap.get(cond.target_field) === 'datetime';
              const colOpts = getColOptions(rawFieldsByScope, cond.scope, cond.field_label);
              return (
                <div key={i} className="we-entry-condition">
                  <div className="we-entry-condition-field">
                    <Select
                      value={cond.scope}
                      onChange={(v) => updateCondition(i, { scope: v })}
                      options={SCOPE_OPTIONS}
                    />
                    <Select
                      value={cond.field_label}
                      onChange={(v) => updateCondition(i, { field_label: v })}
                      options={getFieldOptions(rawFieldsByScope, cond.scope)}
                      disabled={!cond.scope}
                    />
                    {colOpts && (
                      <Select
                        value={cond.col_key}
                        onChange={(v) => updateCondition(i, { col_key: v })}
                        options={colOpts}
                      />
                    )}
                  </div>
                  <div className="we-entry-condition-op">
                    <Select
                      value={cond.operator}
                      onChange={(v) => updateCondition(i, { operator: v })}
                      options={ops}
                    />
                  </div>
                  {isDatetimeField ? (
                    <DatetimePartInput
                      value={cond.value}
                      onChange={(v) => updateCondition(i, { value: v })}
                      className="we-entry-condition-value"
                    />
                  ) : (
                    <input
                      type="text"
                      value={cond.value}
                      onChange={(e) => updateCondition(i, { value: e.target.value })}
                      placeholder="值"
                      className="we-entry-condition-input we-entry-condition-value"
                    />
                  )}
                  <button
                    onClick={() => setConditions((prev) => prev.filter((_, idx) => idx !== i))}
                    className="we-entry-condition-icon-btn we-entry-condition-icon-btn--danger"
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <button
              onClick={() => setConditions((prev) => [...prev, emptyCondition()])}
              className="we-entry-condition-add-btn"
            >
              + 添加条件
            </button>
          </>
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
      onMouseDown={(e) => { mouseDownOnOverlay.current = e.target === e.currentTarget; }}
      onClick={() => { if (mouseDownOnOverlay.current) onClose(); }}
    >
      {panel}
    </div>
  );
}
