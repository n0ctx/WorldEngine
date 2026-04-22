import { useState } from 'react';
import { createTrigger, updateTrigger } from '../../api/triggers';

const OPERATORS = ['>', '<', '=', '>=', '<=', '!=', '包含', '等于', '不包含'];

const ACTION_TYPES = [
  { value: 'activate_entry', label: '激活 Prompt 条目' },
  { value: 'inject_prompt', label: '注入提示词' },
  { value: 'notify', label: '前端通知' },
];

function emptyCondition() {
  return { target_field: '', operator: '>', value: '' };
}

export default function TriggerEditor({ worldId, trigger, entries, onClose, onSave }) {
  const isNew = !trigger?.id;
  const existingParams = trigger?.action
    ? (typeof trigger.action.params === 'string'
        ? JSON.parse(trigger.action.params || '{}')
        : (trigger.action.params || {}))
    : {};

  const [name, setName] = useState(trigger?.name ?? '');
  const [oneShot, setOneShot] = useState(trigger?.one_shot ?? 0);
  const [conditions, setConditions] = useState(
    trigger?.conditions?.length > 0 ? trigger.conditions : [emptyCondition()]
  );
  const [actionType, setActionType] = useState(trigger?.action?.action_type ?? 'notify');
  const [actionParams, setActionParams] = useState(existingParams);
  const [saving, setSaving] = useState(false);

  function updateCondition(index, patch) {
    setConditions((prev) => prev.map((c, i) => i === index ? { ...c, ...patch } : c));
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const payload = {
      name: name.trim(),
      one_shot: oneShot,
      conditions: conditions.filter((c) => c.target_field && c.value),
      action: { action_type: actionType, params: actionParams },
    };
    try {
      if (isNew) {
        await createTrigger(worldId, payload);
      } else {
        await updateTrigger(trigger.id, payload);
      }
      onSave();
    } finally {
      setSaving(false);
    }
  }

  const fieldStyle = {
    padding: '6px 10px',
    fontFamily: 'var(--we-font-serif)',
    fontSize: '13px',
    background: 'var(--we-paper-base)',
    border: '1px solid var(--we-paper-shadow)',
    borderRadius: 'var(--we-radius-sm)',
    color: 'var(--we-ink-primary)',
    boxSizing: 'border-box',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)',
    }}>
      <div style={{
        background: 'var(--we-paper-base)',
        border: '1px solid var(--we-paper-shadow)',
        borderRadius: 'var(--we-radius)',
        width: '100%',
        maxWidth: '560px',
        padding: '24px',
        maxHeight: '85vh',
        overflowY: 'auto',
      }}>
        <h3 style={{ fontFamily: 'var(--we-font-display)', fontSize: '16px', color: 'var(--we-ink-primary)', fontStyle: 'italic', marginBottom: '16px' }}>
          {isNew ? '新建触发器' : '编辑触发器'}
        </h3>

        {/* 名称 + one_shot */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'center' }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="触发器名称"
            style={{ ...fieldStyle, flex: 1 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: 'var(--we-ink-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={!!oneShot} onChange={(e) => setOneShot(e.target.checked ? 1 : 0)} />
            仅触发一次
          </label>
        </div>

        {/* 条件列表 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', color: 'var(--we-ink-secondary)', marginBottom: '6px' }}>条件（全部满足时触发）</div>
          {conditions.map((cond, i) => (
            <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
              <input
                value={cond.target_field}
                onChange={(e) => updateCondition(i, { target_field: e.target.value })}
                placeholder="实体名.字段标签"
                style={{ ...fieldStyle, flex: 2, minWidth: 0 }}
              />
              <select
                value={cond.operator}
                onChange={(e) => updateCondition(i, { operator: e.target.value })}
                style={{ ...fieldStyle, flex: 'none', width: '80px' }}
              >
                {OPERATORS.map((op) => <option key={op} value={op}>{op}</option>)}
              </select>
              <input
                value={cond.value}
                onChange={(e) => updateCondition(i, { value: e.target.value })}
                placeholder="值"
                style={{ ...fieldStyle, flex: 1, minWidth: 0 }}
              />
              <button
                onClick={() => setConditions((prev) => prev.filter((_, idx) => idx !== i))}
                style={{ color: 'var(--we-vermilion)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '0 4px', flexShrink: 0 }}
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={() => setConditions((prev) => [...prev, emptyCondition()])}
            style={{ fontSize: '12px', color: 'var(--we-vermilion)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--we-font-serif)' }}
          >
            + 添加条件
          </button>
        </div>

        {/* 动作 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', color: 'var(--we-ink-secondary)', marginBottom: '6px' }}>动作</div>
          <select
            value={actionType}
            onChange={(e) => { setActionType(e.target.value); setActionParams({}); }}
            style={{ ...fieldStyle, width: '100%', marginBottom: '8px' }}
          >
            {ACTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>

          {actionType === 'activate_entry' && (
            <select
              value={actionParams.entry_id ?? ''}
              onChange={(e) => setActionParams({ entry_id: e.target.value })}
              style={{ ...fieldStyle, width: '100%' }}
            >
              <option value="">选择条目…</option>
              {(entries || []).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          )}

          {actionType === 'inject_prompt' && (
            <>
              <textarea
                value={actionParams.text ?? ''}
                onChange={(e) => setActionParams((p) => ({ ...p, text: e.target.value }))}
                placeholder="注入的提示文本"
                rows={3}
                style={{ ...fieldStyle, width: '100%', resize: 'vertical', marginBottom: '6px' }}
              />
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select
                  value={actionParams.mode ?? 'consumed'}
                  onChange={(e) => setActionParams((p) => ({ ...p, mode: e.target.value }))}
                  style={fieldStyle}
                >
                  <option value="consumed">消耗型（N轮后停止）</option>
                  <option value="persistent">持久型（持续注入）</option>
                </select>
                {(actionParams.mode ?? 'consumed') === 'consumed' && (
                  <>
                    <input
                      type="number"
                      min={1}
                      value={actionParams.inject_rounds ?? 3}
                      onChange={(e) => setActionParams((p) => ({ ...p, inject_rounds: parseInt(e.target.value) || 1 }))}
                      style={{ ...fieldStyle, width: '64px' }}
                    />
                    <span style={{ fontSize: '12px', color: 'var(--we-ink-secondary)' }}>轮</span>
                  </>
                )}
              </div>
            </>
          )}

          {actionType === 'notify' && (
            <input
              value={actionParams.text ?? ''}
              onChange={(e) => setActionParams({ text: e.target.value })}
              placeholder="通知文本"
              style={{ ...fieldStyle, width: '100%' }}
            />
          )}
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
