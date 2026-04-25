import { useState, useEffect } from 'react';
import { createWorldEntry, updateWorldEntry, getEntryConditions, replaceEntryConditions } from '../../api/prompt-entries';
import { listWorldStateFields } from '../../api/world-state-fields';
import { listCharacterStateFields } from '../../api/character-state-fields';
import { listPersonaStateFields } from '../../api/persona-state-fields';
import MarkdownEditor from '../ui/MarkdownEditor';
import Select from '../ui/Select';
import { pushErrorToast } from '../../utils/toast';

const NUMERIC_TYPES = new Set(['number', 'integer', 'float']);
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

function emptyCondition() {
  return { target_field: '', operator: '>', value: '' };
}

function getOpsForField(targetField, fieldTypeMap) {
  const type = fieldTypeMap.get(targetField);
  if (!type) return [...NUMERIC_OPS, ...TEXT_OPS];
  return NUMERIC_TYPES.has(type) ? NUMERIC_OPS : TEXT_OPS;
}

export default function EntryEditor({ worldId, entry, defaultTriggerType, onClose, onSave }) {
  const isNew = !entry?.id;
  const [form, setForm] = useState({
    title: entry?.title ?? '',
    content: entry?.content ?? '',
    description: entry?.description ?? '',
    keywords: entry?.keywords ? entry.keywords.join(', ') : '',
    trigger_type: entry?.trigger_type ?? defaultTriggerType ?? 'always',
    token: entry?.token ?? 1,
  });
  const [saving, setSaving] = useState(false);

  // state 类型专用
  const [conditions, setConditions] = useState([emptyCondition()]);
  const [fieldOptions, setFieldOptions] = useState([]);
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
        const opts = [];
        const typeMap = new Map();
        for (const f of worldFields) {
          const key = `世界.${f.label}`;
          opts.push({ value: key, label: key });
          typeMap.set(key, f.type);
        }
        for (const f of personaFields) {
          const key = `玩家.${f.label}`;
          opts.push({ value: key, label: key });
          typeMap.set(key, f.type);
        }
        for (const f of charFields) {
          const key = `角色.${f.label}`;
          opts.push({ value: key, label: key });
          typeMap.set(key, f.type);
        }
        setFieldOptions(opts);
        setFieldTypeMap(typeMap);

        if (!isNew && form.trigger_type === 'state') {
          const conds = await getEntryConditions(entry.id);
          setConditions(conds.length > 0 ? conds.map((c) => ({ ...c })) : [emptyCondition()]);
        } else {
          setConditions([emptyCondition()]);
        }
      } catch (err) {
        pushErrorToast(err.message || '加载状态字段失败');
      }
    }
    load();
  }, [entry?.id, form.trigger_type, isNew, worldId]);

  function updateCondition(index, patch) {
    setConditions((prev) => prev.map((c, i) => {
      if (i !== index) return c;
      const next = { ...c, ...patch };
      if (patch.target_field !== undefined) {
        const ops = getOpsForField(next.target_field, fieldTypeMap);
        next.operator = ops[0].value;
      }
      return next;
    }));
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    const data = {
      title: form.title.trim(),
      content: form.content,
      description: form.description,
      keywords: form.trigger_type === 'keyword'
        ? form.keywords.split(',').map((k) => k.trim()).filter(Boolean)
        : null,
      trigger_type: form.trigger_type,
      token: Math.max(1, parseInt(form.token, 10) || 1),
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
        const validConditions = conditions.filter((c) => c.target_field && c.value);
        await replaceEntryConditions(entryId, validConditions);
      }
      onSave();
    } catch (err) {
      pushErrorToast(`保存失败：${err.message}`);
      setSaving(false);
    }
  }

  return (
    <div className="we-entry-editor-overlay" onClick={onClose}>
      <div className="we-entry-editor-panel" onClick={(e) => e.stopPropagation()}>
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

        {/* 顺序权重 */}
        <label className="we-entry-editor-label">顺序权重（越大越靠后，默认 1）</label>
        <input
          type="number"
          min={1}
          step={1}
          value={form.token}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            setForm((f) => ({ ...f, token: isNaN(v) || v < 1 ? 1 : v }));
          }}
          className="we-entry-editor-field we-entry-editor-field-mb"
          style={{ width: '80px' }}
        />

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
            <label className="we-entry-editor-label">触发关键词（逗号分隔）</label>
            <input
              value={form.keywords}
              onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
              placeholder="如：暗影帮, 影堂, 黑市"
              className="we-entry-editor-field we-entry-editor-field-mb"
            />
          </>
        )}

        {/* 触发描述（仅 llm 类型） */}
        {form.trigger_type === 'llm' && (
          <>
            <label className="we-entry-editor-label">触发条件描述（供 AI 判断）</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              className="we-entry-editor-field we-entry-editor-field-mb we-entry-editor-field--resizable"
            />
          </>
        )}

        {/* 状态条件（仅 state 类型） */}
        {form.trigger_type === 'state' && (
          <>
            <label className="we-entry-editor-label">状态条件（全部满足时注入）</label>
            {conditions.map((cond, i) => {
              const ops = getOpsForField(cond.target_field, fieldTypeMap);
              return (
                <div key={i} className="we-entry-condition">
                  <div className="we-entry-condition-field">
                    <Select
                      value={cond.target_field}
                      onChange={(v) => updateCondition(i, { target_field: v })}
                      options={fieldOptions}
                      disabled={fieldOptions.length === 0}
                    />
                  </div>
                  <div className="we-entry-condition-op">
                    <Select
                      value={cond.operator}
                      onChange={(v) => updateCondition(i, { operator: v })}
                      options={ops}
                    />
                  </div>
                  <input
                    value={cond.value}
                    onChange={(e) => updateCondition(i, { value: e.target.value })}
                    placeholder="值"
                    className="we-entry-condition-input we-entry-condition-value"
                  />
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
    </div>
  );
}
