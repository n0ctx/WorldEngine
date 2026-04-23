import { useState, useEffect } from 'react';
import { createTrigger, updateTrigger } from '../../api/triggers';
import { listWorldStateFields } from '../../api/world-state-fields';
import { listCharacterStateFields } from '../../api/character-state-fields';
import { listPersonaStateFields } from '../../api/persona-state-fields';
import Select from '../ui/Select';
import MarkdownEditor from '../ui/MarkdownEditor';

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

const ACTION_TYPES = [
  { value: 'activate_entry', label: '激活 Prompt 条目' },
  { value: 'inject_prompt', label: '注入提示词' },
  { value: 'notify', label: '前端通知' },
];

const INJECT_MODES = [
  { value: 'consumed', label: '消耗型（N轮后停止）' },
  { value: 'persistent', label: '持久型（持续注入）' },
];

function emptyCondition() {
  return { target_field: '', operator: '>', value: '' };
}

function emptyAction() {
  return { action_type: 'notify', params: {} };
}

function parseParams(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  return raw;
}

/**
 * 根据字段名在 fieldMeta 中查找类型，决定操作符列表
 * @param {string} targetField  "实体名.字段标签"
 * @param {Map<string, string>} fieldTypeMap  "实体名.字段标签" → type 字符串
 */
function getOpsForField(targetField, fieldTypeMap) {
  const type = fieldTypeMap.get(targetField);
  if (!type) return [...NUMERIC_OPS, ...TEXT_OPS]; // 未知字段：全部显示
  return NUMERIC_TYPES.has(type) ? NUMERIC_OPS : TEXT_OPS;
}

export default function TriggerEditor({ worldId, trigger, entries, onClose, onSave }) {
  const isNew = !trigger?.id;

  const [name, setName] = useState(trigger?.name ?? '');
  const [oneShot, setOneShot] = useState(trigger?.one_shot === 1);
  const [conditions, setConditions] = useState(
    trigger?.conditions?.length > 0 ? trigger.conditions.map((c) => ({ ...c })) : [emptyCondition()]
  );
  const [actions, setActions] = useState(
    trigger?.actions?.length > 0
      ? trigger.actions.map((a) => ({ action_type: a.action_type, params: parseParams(a.params) }))
      : [emptyAction()]
  );
  const [saving, setSaving] = useState(false);

  // 字段选项：[{ value: "世界.xxx", label: "世界.xxx" }]
  const [fieldOptions, setFieldOptions] = useState([]);
  // 字段类型映射：Map<"世界.xxx", "number">
  const [fieldTypeMap, setFieldTypeMap] = useState(new Map());

  useEffect(() => {
    async function loadFields() {
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
      } catch (err) {
        console.error('加载状态字段失败', err);
      }
    }
    loadFields();
  }, [worldId]);

  function updateCondition(index, patch) {
    setConditions((prev) => prev.map((c, i) => {
      if (i !== index) return c;
      const next = { ...c, ...patch };
      // 当字段改变时，自动重置操作符为该类型的第一个选项
      if (patch.target_field !== undefined) {
        const ops = getOpsForField(next.target_field, fieldTypeMap);
        next.operator = ops[0].value;
      }
      return next;
    }));
  }

  function updateAction(index, patch) {
    setActions((prev) => prev.map((a, i) => i === index ? { ...a, ...patch } : a));
  }

  function updateActionParams(index, paramsPatch) {
    setActions((prev) => prev.map((a, i) =>
      i === index ? { ...a, params: { ...a.params, ...paramsPatch } } : a
    ));
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const payloadActions = actions.filter((a) => a.action_type).map((a) => {
      const p = { ...a.params };
      if (a.action_type === 'inject_prompt' && p.mode !== 'persistent' && p.inject_rounds == null) {
        p.inject_rounds = 3;
      }
      return { action_type: a.action_type, params: p };
    });
    const payload = {
      name: name.trim(),
      one_shot: oneShot ? 1 : 0,
      conditions: conditions.filter((c) => c.target_field && c.value),
      actions: payloadActions,
    };
    try {
      if (isNew) {
        await createTrigger(worldId, payload);
      } else {
        await updateTrigger(trigger.id, payload);
      }
      onSave();
    } catch (err) {
      alert(`保存失败：${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      className="we-trigger-editor-overlay"
    >
      <div
        className="entry-editor-panel we-trigger-editor-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="we-trigger-editor-title">
          {isNew ? '新建触发器' : '编辑触发器'}
        </h3>

        {/* 名称 */}
        <div className="we-trigger-editor-section">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="触发器名称"
            className="we-trigger-editor-field"
          />
        </div>

        <div className="we-trigger-editor-section we-trigger-editor-section--tight">
          <label className="we-trigger-editor-check">
            <input
              type="checkbox"
              checked={oneShot}
              onChange={(e) => setOneShot(e.target.checked)}
            />
            仅触发一次（命中后自动禁用）
          </label>
        </div>

        {/* 条件列表 */}
        <div className="we-trigger-editor-section">
          <div className="we-trigger-editor-label">条件（全部满足时触发）</div>
          {conditions.map((cond, i) => {
            const ops = getOpsForField(cond.target_field, fieldTypeMap);
            return (
              <div key={i} className="we-trigger-editor-condition">
                {/* 目标字段下拉 */}
                <div className="we-trigger-editor-condition-field">
                  <Select
                    value={cond.target_field}
                    onChange={(v) => updateCondition(i, { target_field: v })}
                    options={fieldOptions}
                    disabled={fieldOptions.length === 0}
                  />
                </div>
                {/* 操作符 */}
                <div className="we-trigger-editor-condition-op">
                  <Select
                    value={cond.operator}
                    onChange={(v) => updateCondition(i, { operator: v })}
                    options={ops}
                  />
                </div>
                {/* 值 */}
                <input
                  value={cond.value}
                  onChange={(e) => updateCondition(i, { value: e.target.value })}
                  placeholder="值"
                  className="we-trigger-editor-field we-trigger-editor-condition-value"
                />
                <button
                  onClick={() => setConditions((prev) => prev.filter((_, idx) => idx !== i))}
                  className="we-trigger-editor-icon-btn we-trigger-editor-icon-btn--danger"
                >
                  ×
                </button>
              </div>
            );
          })}
          <button
            onClick={() => setConditions((prev) => [...prev, emptyCondition()])}
            className="we-trigger-editor-link-btn"
          >
            + 添加条件
          </button>
        </div>

        {/* 动作列表 */}
        <div className="we-trigger-editor-section">
          <div className="we-trigger-editor-label">动作</div>
          {actions.map((action, i) => (
            <div key={i} className="we-trigger-editor-action-card">
              {/* 动作类型 + 删除按钮 */}
              <div className="we-trigger-editor-action-head">
                <div className="we-trigger-editor-action-type">
                  <Select
                    value={action.action_type}
                    onChange={(v) => updateAction(i, { action_type: v, params: {} })}
                    options={ACTION_TYPES}
                  />
                </div>
                {actions.length > 1 && (
                  <button
                    onClick={() => setActions((prev) => prev.filter((_, idx) => idx !== i))}
                    className="we-trigger-editor-icon-btn we-trigger-editor-icon-btn--danger"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* activate_entry */}
              {action.action_type === 'activate_entry' && (
                <Select
                  value={action.params.entry_id ?? ''}
                  onChange={(v) => updateActionParams(i, { entry_id: v })}
                  options={[
                    { value: '', label: '选择条目…' },
                    ...(entries || []).map((e) => ({ value: e.id, label: e.title })),
                  ]}
                />
              )}

              {/* inject_prompt */}
              {action.action_type === 'inject_prompt' && (
                <>
                  <div className="we-trigger-editor-markdown">
                    <MarkdownEditor
                      value={action.params.text ?? ''}
                      onChange={(md) => updateActionParams(i, { text: md })}
                      placeholder="注入的提示文本"
                      minHeight={80}
                    />
                  </div>
                  <div className="we-trigger-editor-inject-row">
                    <div className="we-trigger-editor-inject-mode">
                      <Select
                        value={action.params.mode ?? 'consumed'}
                        onChange={(v) => updateActionParams(i, { mode: v })}
                        options={INJECT_MODES}
                      />
                    </div>
                    {(action.params.mode ?? 'consumed') === 'consumed' && (
                      <div className="we-trigger-editor-rounds">
                        <input
                          type="number"
                          min={1}
                          value={action.params.inject_rounds ?? 3}
                          onChange={(e) => updateActionParams(i, { inject_rounds: parseInt(e.target.value) || 1 })}
                          className="we-trigger-editor-field we-trigger-editor-rounds-input"
                        />
                        <span className="we-trigger-editor-rounds-label">轮</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* notify */}
              {action.action_type === 'notify' && (
                <input
                  value={action.params.text ?? ''}
                  onChange={(e) => updateActionParams(i, { text: e.target.value })}
                  placeholder="通知文本"
                  className="we-trigger-editor-field"
                />
              )}
            </div>
          ))}
          <button
            onClick={() => setActions((prev) => [...prev, emptyAction()])}
            className="we-trigger-editor-link-btn"
          >
            + 添加动作
          </button>
        </div>

        {/* 按钮 */}
        <div className="we-trigger-editor-footer">
          <button onClick={onClose} className="we-trigger-editor-cancel">
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="we-trigger-editor-save"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
