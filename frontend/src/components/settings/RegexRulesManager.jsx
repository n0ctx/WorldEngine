import { useState, useEffect, useCallback, useRef } from 'react';
import {
  listRegexRules,
  createRegexRule,
  updateRegexRule,
  deleteRegexRule,
  reorderRegexRules,
} from '../../api/regexRules.js';
import { getWorlds } from '../../api/worlds.js';
import { invalidateCache, loadRules } from '../../utils/regex-runner.js';
import RegexRuleEditor from './RegexRuleEditor.jsx';
import Button from '../ui/Button.jsx';

const SCOPE_LABELS = {
  user_input: '用户输入',
  ai_output: 'AI 输出',
  display_only: '仅显示',
  prompt_only: '仅 Prompt',
};

const SCOPE_HINTS = {
  user_input: '前端发送前，影响存库与 LLM',
  ai_output: '后端流式完结后，影响存库与显示',
  display_only: '前端渲染时，不改存库',
  prompt_only: '后端历史消息组装时，仅影响 LLM 副本',
};

const SCOPE_ORDER = ['user_input', 'ai_output', 'display_only', 'prompt_only'];

export default function RegexRulesManager({ settingsMode = 'chat' }) {
  const [rules, setRules] = useState([]);
  const [worlds, setWorlds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  // drag state: { scope, idx } within that scope's sub-array
  const dragInfo = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const [r, w] = await Promise.all([listRegexRules({ mode: settingsMode }), getWorlds()]);
      setRules(r);
      setWorlds(w);
      invalidateCache();
      await loadRules();
    } catch (e) {
      console.error(e);
    }
  }, [settingsMode]);

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  function openCreate() { setEditingRule(null); setEditorOpen(true); }
  function openEdit(rule) { setEditingRule(rule); setEditorOpen(true); }

  async function handleSave(form) {
    if (editingRule) {
      await updateRegexRule(editingRule.id, form);
    } else {
      const data = { ...form };
      if (!data.world_id) data.mode = settingsMode;
      await createRegexRule(data);
    }
    setEditorOpen(false);
    await refresh();
  }

  async function handleDelete(id) {
    if (!confirm('确认删除此规则？')) return;
    await deleteRegexRule(id);
    await refresh();
  }

  async function handleToggleEnabled(rule) {
    await updateRegexRule(rule.id, { enabled: rule.enabled ? 0 : 1 });
    await refresh();
  }

  function handleDragStart(scope, idx) {
    dragInfo.current = { scope, idx };
  }

  function handleDragOver(e, scope, targetIdx) {
    e.preventDefault();
    if (!dragInfo.current) return;
    if (dragInfo.current.scope !== scope) return;
    const fromIdx = dragInfo.current.idx;
    if (fromIdx === targetIdx) return;

    setRules((prev) => {
      const scopeRules = prev.filter((r) => r.scope === scope);
      const others = prev.filter((r) => r.scope !== scope);
      const next = [...scopeRules];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(targetIdx, 0, moved);
      dragInfo.current = { scope, idx: targetIdx };
      // rebuild full flat array preserving original insertion order for other scopes
      return SCOPE_ORDER.flatMap((s) =>
        s === scope ? next : prev.filter((r) => r.scope === s)
      );
    });
  }

  async function handleDragEnd(scope) {
    dragInfo.current = null;
    const scopeRules = rules.filter((r) => r.scope === scope);
    const items = scopeRules.map((r, i) => ({ id: r.id, sort_order: i }));
    await reorderRegexRules(items);
    invalidateCache();
    await loadRules();
  }

  function getWorldName(worldId) {
    if (!worldId) return '全局';
    return worlds.find((w) => w.id === worldId)?.name ?? '未知世界';
  }

  if (loading) {
    return <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '13px', color: 'var(--we-ink-faded)', fontStyle: 'italic', padding: '8px 0' }}>加载中…</p>;
  }

  const rulesByScope = SCOPE_ORDER.reduce((acc, scope) => {
    acc[scope] = rules.filter((r) => r.scope === scope);
    return acc;
  }, {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--we-font-serif)', fontSize: '13px', color: 'var(--we-ink-faded)', fontStyle: 'italic' }}>
          按 scope 分组，同组内按顺序链式执行
        </span>
        <Button variant="ghost" size="sm" onClick={openCreate}>+ 新建规则</Button>
      </div>

      {SCOPE_ORDER.map((scope) => (
        <div key={scope}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontFamily: 'var(--we-font-display)', fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--we-ink-faded)' }}>
              {SCOPE_LABELS[scope]}
            </span>
            <span style={{ fontFamily: 'var(--we-font-serif)', fontSize: '11px', color: 'var(--we-ink-faded)', opacity: 0.6 }}>
              — {SCOPE_HINTS[scope]}
            </span>
          </div>

          {rulesByScope[scope].length === 0 ? (
            <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '12px', color: 'var(--we-ink-faded)', fontStyle: 'italic', opacity: 0.5, marginLeft: '4px' }}>暂无规则</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {rulesByScope[scope].map((rule, idx) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  worldName={getWorldName(rule.world_id)}
                  onEdit={() => openEdit(rule)}
                  onToggle={() => handleToggleEnabled(rule)}
                  onDelete={() => handleDelete(rule.id)}
                  onDragStart={() => handleDragStart(scope, idx)}
                  onDragOver={(e) => handleDragOver(e, scope, idx)}
                  onDragEnd={() => handleDragEnd(scope)}
                />
              ))}
            </div>
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
    </div>
  );
}

function RuleRow({ rule, worldName, onEdit, onToggle, onDelete, onDragStart, onDragOver, onDragEnd }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'var(--we-paper-aged)',
        border: `1px solid ${hovered ? 'var(--we-ink-faded)' : 'var(--we-paper-shadow)'}`,
        padding: '8px 12px',
        cursor: 'grab',
        userSelect: 'none',
        transition: 'border-color 0.15s',
      }}
    >
      {/* 拖拽把手 */}
      <span style={{ color: 'var(--we-ink-faded)', fontSize: '12px', flexShrink: 0, opacity: 0.5 }}>⠿</span>

      {/* 名称 + 所属世界 + 正则预览 */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{
          fontFamily: 'var(--we-font-serif)',
          fontSize: '14px',
          fontWeight: 500,
          color: 'var(--we-ink-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          opacity: rule.enabled ? 1 : 0.45,
        }}>
          {rule.name}
        </span>
        {worldName !== '全局' && (
          <span style={{ fontFamily: 'var(--we-font-serif)', fontSize: '11px', color: 'var(--we-ink-faded)', flexShrink: 0 }}>
            {worldName}
          </span>
        )}
        <span style={{ fontFamily: 'Courier New, monospace', fontSize: '11px', color: 'var(--we-ink-faded)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.6 }}>
          /{rule.pattern}/{rule.flags}
        </span>
      </div>

      {/* 操作区 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
        <button
          onClick={onToggle}
          title={rule.enabled ? '点击禁用' : '点击启用'}
          style={{
            fontFamily: 'var(--we-font-serif)',
            fontSize: '11px',
            padding: '2px 8px',
            border: `1px solid ${rule.enabled ? 'var(--we-vermilion)' : 'var(--we-paper-shadow)'}`,
            color: rule.enabled ? 'var(--we-vermilion)' : 'var(--we-ink-faded)',
            background: rule.enabled ? 'var(--we-vermilion-bg)' : 'transparent',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {rule.enabled ? '启用' : '禁用'}
        </button>
        <button
          onClick={onEdit}
          title="编辑"
          style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--we-ink-faded)', cursor: 'pointer', fontSize: '12px', transition: 'color 0.15s' }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--we-ink-primary)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--we-ink-faded)'}
        >✎</button>
        <button
          onClick={onDelete}
          title="删除"
          style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--we-ink-faded)', cursor: 'pointer', fontSize: '12px', transition: 'color 0.15s' }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--we-vermilion)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--we-ink-faded)'}
        >✕</button>
      </div>
    </div>
  );
}
