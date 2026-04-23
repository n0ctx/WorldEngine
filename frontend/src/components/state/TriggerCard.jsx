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
    <div className="we-trigger-card">
      {/* 启用 toggle */}
      <button
        onClick={handleToggle}
        title={trigger.enabled ? '点击禁用' : '点击启用'}
        className={`we-trigger-card-toggle${trigger.enabled ? ' we-trigger-card-toggle--enabled' : ''}`}
      >
        <span className="we-trigger-card-toggle-knob" />
      </button>

      {/* 内容 */}
      <div className="we-trigger-card-body">
        <div className="we-trigger-card-name">
          {trigger.name}
        </div>
        <div className="we-trigger-card-summary">
          当 {conditionSummary(trigger.conditions)}
        </div>
        <div className="we-trigger-card-summary we-trigger-card-summary--action">
          则 {actionsSummary(trigger.actions)}
        </div>
        <div className="we-trigger-card-meta">
          {trigger.one_shot === 1 ? '单次触发' : '可重复触发'} ·{' '}
          {trigger.last_triggered_round != null
            ? `上次触发：第 ${trigger.last_triggered_round} 轮`
            : '从未触发'}
        </div>
      </div>

      {/* 操作 */}
      <div className="we-trigger-card-actions">
        <button onClick={onEdit} className="we-trigger-card-action">
          编辑
        </button>
        <button onClick={() => setConfirmingDelete(true)} className="we-trigger-card-action we-trigger-card-action--danger">
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
