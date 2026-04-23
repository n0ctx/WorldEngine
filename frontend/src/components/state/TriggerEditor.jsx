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
      } catch (_) {}
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

  const fieldStyle = {
    padding: '6px 10px',
    fontFamily: 'var(--we-font-serif)',
    fontSize: '13px',
    background: 'color-mix(in srgb, var(--we-base-ink-900) 3%, transparent)',
    border: '1px solid var(--we-paper-shadow)',
    borderRadius: 'var(--we-radius-none)',
    color: 'var(--we-ink-primary)',
    boxSizing: 'border-box',
    outline: 'none',
    width: '100%',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '12px',
    color: 'var(--we-ink-secondary)',
    marginBottom: '4px',
  };

  const sectionStyle = {
    marginBottom: '16px',
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '10vh',
        background: 'color-mix(in srgb, var(--we-base-ink-900) 30%, transparent)',
      }}
    >
      <div
        className="entry-editor-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--we-paper-base)',
          border: '1px solid var(--we-paper-shadow)',
          borderRadius: 'var(--we-radius-sm)',
          width: '100%',
          maxWidth: '960px',
          padding: '24px',
          maxHeight: 'calc(100vh - 96px)',
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--we-paper-shadow) transparent',
        }}
      >
        <h3 style={{ fontFamily: 'var(--we-font-display)', fontSize: '16px', color: 'var(--we-ink-primary)', fontStyle: 'italic', marginBottom: '16px' }}>
          {isNew ? '新建触发器' : '编辑触发器'}
        </h3>

        {/* 名称 */}
        <div style={sectionStyle}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="触发器名称"
            style={fieldStyle}
          />
        </div>

        <div style={{ ...sectionStyle, marginTop: '-6px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--we-ink-secondary)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={oneShot}
              onChange={(e) => setOneShot(e.target.checked)}
            />
            仅触发一次（命中后自动禁用）
          </label>
        </div>

        {/* 条件列表 */}
        <div style={sectionStyle}>
          <div style={labelStyle}>条件（全部满足时触发）</div>
          {conditions.map((cond, i) => {
            const ops = getOpsForField(cond.target_field, fieldTypeMap);
            return (
              <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                {/* 目标字段下拉 */}
                <div style={{ flex: 2, minWidth: 0 }}>
                  <Select
                    value={cond.target_field}
                    onChange={(v) => updateCondition(i, { target_field: v })}
                    options={fieldOptions}
                    disabled={fieldOptions.length === 0}
                  />
                </div>
                {/* 操作符 */}
                <div style={{ flexShrink: 0, width: '90px' }}>
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
                  style={{ ...fieldStyle, flex: 1, minWidth: 0, width: 'auto', padding: '9px 12px', fontSize: '14.5px' }}
                />
                <button
                  onClick={() => setConditions((prev) => prev.filter((_, idx) => idx !== i))}
                  style={{ color: 'var(--we-vermilion)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '0 4px', flexShrink: 0 }}
                >
                  ×
                </button>
              </div>
            );
          })}
          <button
            onClick={() => setConditions((prev) => [...prev, emptyCondition()])}
            style={{ fontSize: '12px', color: 'var(--we-vermilion)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--we-font-serif)' }}
          >
            + 添加条件
          </button>
        </div>

        {/* 动作列表 */}
        <div style={sectionStyle}>
          <div style={labelStyle}>动作</div>
          {actions.map((action, i) => (
            <div key={i} style={{
              border: '1px solid var(--we-paper-shadow)',
              borderRadius: 'var(--we-radius-sm)',
              padding: '10px 12px',
              marginBottom: '8px',
              background: 'color-mix(in srgb, var(--we-base-ink-900) 2%, transparent)',
            }}>
              {/* 动作类型 + 删除按钮 */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ flex: 1 }}>
                  <Select
                    value={action.action_type}
                    onChange={(v) => updateAction(i, { action_type: v, params: {} })}
                    options={ACTION_TYPES}
                  />
                </div>
                {actions.length > 1 && (
                  <button
                    onClick={() => setActions((prev) => prev.filter((_, idx) => idx !== i))}
                    style={{ color: 'var(--we-vermilion)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '0 4px', flexShrink: 0 }}
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
                  <div style={{ marginBottom: '8px' }}>
                    <MarkdownEditor
                      value={action.params.text ?? ''}
                      onChange={(md) => updateActionParams(i, { text: md })}
                      placeholder="注入的提示文本"
                      minHeight={80}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <Select
                        value={action.params.mode ?? 'consumed'}
                        onChange={(v) => updateActionParams(i, { mode: v })}
                        options={INJECT_MODES}
                      />
                    </div>
                    {(action.params.mode ?? 'consumed') === 'consumed' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                        <input
                          type="number"
                          min={1}
                          value={action.params.inject_rounds ?? 3}
                          onChange={(e) => updateActionParams(i, { inject_rounds: parseInt(e.target.value) || 1 })}
                          style={{ ...fieldStyle, width: '60px' }}
                        />
                        <span style={{ fontSize: '12px', color: 'var(--we-ink-secondary)' }}>轮</span>
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
                  style={fieldStyle}
                />
              )}
            </div>
          ))}
          <button
            onClick={() => setActions((prev) => [...prev, emptyAction()])}
            style={{ fontSize: '12px', color: 'var(--we-vermilion)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--we-font-serif)' }}
          >
            + 添加动作
          </button>
        </div>

        {/* 按钮 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} style={{ fontSize: '13px', color: 'var(--we-ink-faded)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--we-font-serif)' }}>
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            style={{
              fontFamily: 'var(--we-font-serif)',
              fontSize: '13px',
              background: 'var(--we-vermilion)',
              color: 'var(--we-paper-base)',
              border: 'none',
              borderRadius: 'var(--we-radius-sm)',
              padding: '6px 16px',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
