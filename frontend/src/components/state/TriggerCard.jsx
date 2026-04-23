import { useState } from 'react';
import { deleteTrigger, updateTrigger } from '../../api/triggers';
import ConfirmModal from '../ui/ConfirmModal.jsx';

function conditionSummary(conditions) {
  if (!conditions?.length) return '（无条件）';
  return conditions.map((c) => `${c.target_field} ${c.operator} ${c.value}`).join(' 且 ');
}

function actionSummary(action) {
  if (!action) return '（无动作）';
  const p = typeof action.params === 'string' ? JSON.parse(action.params || '{}') : (action.params || {});
  switch (action.action_type) {
    case 'activate_entry': return '激活条目';
    case 'inject_prompt': return `注入提示词（${p.mode === 'persistent' ? '持续' : `${p.inject_rounds ?? '?'}轮`}）`;
    case 'notify': return `通知：${p.text || ''}`;
    default: return action.action_type;
  }
}

function actionsSummary(actions) {
  if (!actions?.length) return '（无动作）';
  return actions.map(actionSummary).join('；');
}

export default function TriggerCard({ trigger, onEdit, onDelete, onToggle }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleToggle() {
    await updateTrigger(trigger.id, {
      ...trigger,
      enabled: trigger.enabled ? 0 : 1,
    });
    onToggle();
  }

  async function handleDelete() {
    try {
      await deleteTrigger(trigger.id);
      setConfirmingDelete(false);
      onDelete();
    } catch (e) {
      // TODO: showToast 为页级函数，此处暂用 alert；待全局 toast 服务建立后替换
      alert('删除失败：' + (e?.message || '未知错误'));
    }
  }

  return (
    <>
    <div style={{
      background: 'var(--we-paper-base)',
      border: '1px solid var(--we-paper-shadow)',
      borderRadius: 'var(--we-radius-sm)',
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
    }}>
      {/* 启用 toggle */}
      <button
        onClick={handleToggle}
        title={trigger.enabled ? '点击禁用' : '点击启用'}
        style={{
          width: '32px',
          height: '18px',
          borderRadius: '9px',
          background: trigger.enabled ? 'var(--we-vermilion)' : 'var(--we-paper-shadow)',
          border: 'none',
          cursor: 'pointer',
          flexShrink: 0,
          marginTop: '2px',
          position: 'relative',
          transition: 'background 0.2s',
          padding: 0,
        }}
      >
        <span style={{
          position: 'absolute',
          top: '2px',
          left: trigger.enabled ? '16px' : '2px',
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          background: 'var(--we-paper-base)',
          transition: 'left 0.2s',
          display: 'block',
        }} />
      </button>

      {/* 内容 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--we-font-serif)', fontSize: '14px', color: 'var(--we-ink-primary)', fontWeight: 500, marginBottom: '4px' }}>
          {trigger.name}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--we-ink-secondary)', marginBottom: '2px' }}>
          当 {conditionSummary(trigger.conditions)}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--we-ink-secondary)', marginBottom: '4px' }}>
          则 {actionsSummary(trigger.actions)}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--we-ink-faded)' }}>
          {trigger.one_shot === 1 ? '单次触发' : '可重复触发'} ·{' '}
          {trigger.last_triggered_round != null
            ? `上次触发：第 ${trigger.last_triggered_round} 轮`
            : '从未触发'}
        </div>
      </div>

      {/* 操作 */}
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <button onClick={onEdit} style={{ fontSize: '12px', color: 'var(--we-ink-secondary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--we-font-serif)' }}>
          编辑
        </button>
        <button onClick={() => setConfirmingDelete(true)} style={{ fontSize: '12px', color: 'var(--we-vermilion)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--we-font-serif)' }}>
          删除
        </button>
      </div>
    </div>

    {confirmingDelete && (
      <ConfirmModal
        title="删除触发器"
        message={`确认删除触发器「${trigger.name}」？此操作不可撤销。`}
        confirmText="删除"
        danger
        onConfirm={handleDelete}
        onClose={() => setConfirmingDelete(false)}
      />
    )}
    </>
  );
}
