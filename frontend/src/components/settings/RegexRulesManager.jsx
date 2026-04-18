import { useState, useEffect, useCallback } from 'react';
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

const SCOPE_ORDER = ['user_input', 'ai_output', 'display_only', 'prompt_only'];

export default function RegexRulesManager() {
  const [rules, setRules] = useState([]);
  const [worlds, setWorlds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [r, w] = await Promise.all([listRegexRules(), getWorlds()]);
      setRules(r);
      setWorlds(w);
      // 同步刷新前端运行时缓存
      invalidateCache();
      await loadRules();
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  function openCreate() {
    setEditingRule(null);
    setEditorOpen(true);
  }

  function openEdit(rule) {
    setEditingRule(rule);
    setEditorOpen(true);
  }

  async function handleSave(form) {
    if (editingRule) {
      await updateRegexRule(editingRule.id, form);
    } else {
      await createRegexRule(form);
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

  async function moveRule(rule, direction) {
    const scopeRules = rules.filter((r) => r.scope === rule.scope);
    const idx = scopeRules.findIndex((r) => r.id === rule.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= scopeRules.length) return;

    const items = [
      { id: scopeRules[idx].id, sort_order: scopeRules[swapIdx].sort_order },
      { id: scopeRules[swapIdx].id, sort_order: scopeRules[idx].sort_order },
    ];
    await reorderRegexRules(items);
    await refresh();
  }

  function getWorldName(worldId) {
    if (!worldId) return '全局';
    return worlds.find((w) => w.id === worldId)?.name ?? '未知世界';
  }

  if (loading) {
    return <p className="text-sm text-text-secondary opacity-60 py-2">加载中…</p>;
  }

  const rulesByScope = SCOPE_ORDER.reduce((acc, scope) => {
    acc[scope] = rules.filter((r) => r.scope === scope);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary opacity-60">
          按 scope 分组，同组内按顺序链式执行
        </p>
        <Button variant="ghost" size="sm" onClick={openCreate}>
          + 新建规则
        </Button>
      </div>

      {SCOPE_ORDER.map((scope) => (
        <div key={scope}>
          <div className="flex items-center gap-2 mb-2">
            <span className="we-edit-label" style={{ margin: 0 }}>{SCOPE_LABELS[scope]}</span>
            <span className="text-xs text-text-secondary opacity-40">
              {scope === 'user_input' && '— 前端发送前，影响存库与 LLM'}
              {scope === 'ai_output' && '— 后端流式完结后，影响存库与显示'}
              {scope === 'display_only' && '— 前端渲染时，不改存库'}
              {scope === 'prompt_only' && '— 后端历史消息组装时，仅影响 LLM 副本'}
            </span>
          </div>

          {rulesByScope[scope].length === 0 ? (
            <p className="text-xs text-text-secondary opacity-30 ml-1 mb-2">暂无规则</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {rulesByScope[scope].map((rule, idx) => (
                <div
                  key={rule.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-canvas hover:border-accent transition-colors group"
                >
                  {/* 顺序操作 */}
                  <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-60 transition-opacity">
                    <button
                      onClick={() => moveRule(rule, -1)}
                      disabled={idx === 0}
                      className="text-text-secondary hover:text-text disabled:opacity-30"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="18 15 12 9 6 15" />
                      </svg>
                    </button>
                    <button
                      onClick={() => moveRule(rule, 1)}
                      disabled={idx === rulesByScope[scope].length - 1}
                      className="text-text-secondary hover:text-text disabled:opacity-30"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  </div>

                  {/* 启用开关 */}
                  <button
                    onClick={() => handleToggleEnabled(rule)}
                    className={`relative flex-none inline-flex h-[18px] w-8 items-center rounded-full transition-colors ${
                      rule.enabled ? 'bg-accent' : 'bg-border'
                    }`}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                        rule.enabled ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>

                  {/* 名称 + 作用域 */}
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm ${rule.enabled ? 'text-text' : 'text-text-secondary opacity-50'}`}>
                      {rule.name}
                    </span>
                    <span className="ml-2 text-xs text-text-secondary opacity-40">
                      {getWorldName(rule.world_id)}
                    </span>
                  </div>

                  {/* 正则预览 */}
                  <span className="text-xs font-mono text-text-secondary opacity-50 truncate max-w-[120px] hidden sm:block">
                    /{rule.pattern}/{rule.flags}
                  </span>

                  {/* 操作按钮 */}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="default" size="sm" onClick={() => openEdit(rule)}>
                      编辑
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => handleDelete(rule.id)}>
                      删除
                    </Button>
                  </div>
                </div>
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
