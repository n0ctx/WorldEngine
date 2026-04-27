import { useState, useEffect, useCallback } from 'react';
import {
  listRegexRules,
  createRegexRule,
  updateRegexRule,
  deleteRegexRule,
  reorderRegexRules,
} from '../../api/regex-rules.js';
import { getWorlds } from '../../api/worlds.js';
import { invalidateCache, loadRules } from '../../utils/regex-runner.js';
import RegexRuleEditor from './RegexRuleEditor.jsx';
import Button from '../ui/Button.jsx';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import SortableList from '../ui/SortableList.jsx';
import { SETTINGS_MODE } from './SettingsConstants';
import { pushErrorToast } from '../../utils/toast';

const SCOPE_LABELS = {
  user_input: '用户输入',
  ai_output: 'AI 输出',
  display_only: '仅显示',
  prompt_only: '仅提示词',
};

const SCOPE_HINTS = {
  user_input: '前端发送前，影响存库与 LLM',
  ai_output: '后端流式完结后，影响存库与显示',
  display_only: '前端渲染时，不改存库',
  prompt_only: '后端历史消息组装时，仅影响 LLM 副本',
};

const SCOPE_ORDER = ['user_input', 'ai_output', 'display_only', 'prompt_only'];

export default function RegexRulesManager({ settingsMode = SETTINGS_MODE.CHAT }) {
  const [rules, setRules] = useState([]);
  const [worlds, setWorlds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [confirmingDeleteRule, setConfirmingDeleteRule] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [r, w] = await Promise.all([listRegexRules({ mode: settingsMode }), getWorlds()]);
      setRules(r);
      setWorlds(w);
      invalidateCache();
      await loadRules(settingsMode);
    } catch (e) {
      pushErrorToast(e.message || '加载规则失败');
    }
  }, [settingsMode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- settings mode changes should show reload state immediately.
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  function openCreate() { setEditingRule(null); setEditorOpen(true); }
  function openEdit(rule) { setEditingRule(rule); setEditorOpen(true); }

  async function handleSave(form) {
    if (editingRule) {
      await updateRegexRule(editingRule.id, form);
    } else {
      await createRegexRule(form);
    }
    setEditorOpen(false);
    await refresh();
  }

  async function handleDelete() {
    try {
      await deleteRegexRule(confirmingDeleteRule.id);
      setConfirmingDeleteRule(null);
      await refresh();
    } catch (e) {
      pushErrorToast('删除失败：' + (e?.message || '未知错误'));
    }
  }

  async function handleToggleEnabled(rule) {
    await updateRegexRule(rule.id, { enabled: rule.enabled ? 0 : 1 });
    await refresh();
  }

  function handleReorderForScope(scope, newScopeItems) {
    setRules(prev =>
      SCOPE_ORDER.flatMap(s => s === scope ? newScopeItems : prev.filter(r => r.scope === s))
    );
  }

  async function handleReorderEndForScope(scope, finalItems) {
    const items = finalItems.map((r, i) => ({ id: r.id, sort_order: i }));
    await reorderRegexRules(items);
    invalidateCache();
    await loadRules(settingsMode);
  }

  function getWorldName(worldId) {
    if (!worldId) return '全局';
    return worlds.find((w) => w.id === worldId)?.name ?? '未知世界';
  }

  if (loading) {
    return <p className="we-regex-manager-loading">加载中…</p>;
  }

  const rulesByScope = SCOPE_ORDER.reduce((acc, scope) => {
    acc[scope] = rules.filter((r) => r.scope === scope);
    return acc;
  }, {});

  return (
    <div className="we-regex-manager">
      <div className="we-regex-manager-head">
        <span className="we-regex-manager-note">
          按 scope 分组，同组内按顺序链式执行
        </span>
        <Button variant="ghost" size="sm" onClick={openCreate}>+ 新建规则</Button>
      </div>

      {SCOPE_ORDER.map((scope) => (
        <div key={scope}>
          <div className="we-regex-scope-head">
            <span className="we-regex-scope-title">
              {SCOPE_LABELS[scope]}
            </span>
            <span className="we-regex-scope-hint">
              — {SCOPE_HINTS[scope]}
            </span>
          </div>

          {rulesByScope[scope].length === 0 ? (
            <p className="we-regex-scope-empty">暂无规则</p>
          ) : (
            <SortableList
              items={rulesByScope[scope]}
              onReorder={(newItems) => handleReorderForScope(scope, newItems)}
              onReorderEnd={(finalItems) => handleReorderEndForScope(scope, finalItems)}
              renderItem={(rule) => (
                <RuleRow
                  rule={rule}
                  worldName={getWorldName(rule.world_id)}
                  onEdit={() => openEdit(rule)}
                  onToggle={() => handleToggleEnabled(rule)}
                  onDelete={() => setConfirmingDeleteRule(rule)}
                />
              )}
              className="we-regex-rule-list"
            />
          )}
        </div>
      ))}

      {editorOpen && (
        <RegexRuleEditor
          rule={editingRule}
          worlds={worlds}
          onSave={handleSave}
          onClose={() => setEditorOpen(false)}
        />
      )}

      {confirmingDeleteRule && (
        <ConfirmModal
          title="删除正则规则"
          message={`确认删除规则「${confirmingDeleteRule.name}」？此操作不可撤销。`}
          confirmText="删除"
          danger
          onConfirm={handleDelete}
          onClose={() => setConfirmingDeleteRule(null)}
        />
      )}
    </div>
  );
}

function RuleRow({ rule, worldName, onEdit, onToggle, onDelete }) {
  return (
    <div className="we-regex-rule-row">
      <span className="we-regex-rule-drag">⠿</span>

      <div className="we-regex-rule-main">
        <span className={`we-regex-rule-name${rule.enabled ? '' : ' we-regex-rule-name--disabled'}`}>
          {rule.name}
        </span>
        {worldName !== '全局' && (
          <span className="we-regex-rule-world">
            {worldName}
          </span>
        )}
        <span className="we-regex-rule-pattern">
          /{rule.pattern}/{rule.flags}
        </span>
      </div>

      <div className="we-regex-rule-actions">
        <button
          onClick={onToggle}
          title={rule.enabled ? '点击禁用' : '点击启用'}
          className={`we-regex-rule-toggle${rule.enabled ? ' we-regex-rule-toggle--enabled' : ''}`}
        >
          {rule.enabled ? '启用' : '禁用'}
        </button>
        <button
          onClick={onEdit}
          title="编辑"
          className="we-regex-rule-icon-btn"
        >✎</button>
        <button
          onClick={onDelete}
          title="删除"
          className="we-regex-rule-icon-btn we-regex-rule-icon-btn--danger"
        >✕</button>
      </div>
    </div>
  );
}
