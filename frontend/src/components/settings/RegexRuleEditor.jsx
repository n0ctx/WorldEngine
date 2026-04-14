import { useState, useEffect } from 'react';

const SCOPE_OPTIONS = [
  { value: 'user_input', label: '用户输入', desc: '发送前处理，影响存库与 LLM' },
  { value: 'ai_output', label: 'AI 输出', desc: '流式完结后处理，影响存库与显示' },
  { value: 'display_only', label: '仅显示', desc: '渲染时处理，不改存库' },
  { value: 'prompt_only', label: '仅 Prompt', desc: '组装历史消息时处理，仅影响送给 LLM 的副本' },
];

const FLAGS_PRESETS = ['g', 'gi', 'gm', 'gim'];

export default function RegexRuleEditor({ rule, worlds, onSave, onClose }) {
  const [form, setForm] = useState({
    name: '',
    enabled: 1,
    pattern: '',
    replacement: '',
    flags: 'g',
    scope: 'user_input',
    world_id: null,
  });

  const [testInput, setTestInput] = useState('');
  const [testOutput, setTestOutput] = useState(null);
  const [testError, setTestError] = useState('');
  const [saving, setSaving] = useState(false);
  const [flagsCustom, setFlagsCustom] = useState(false);

  useEffect(() => {
    if (rule) {
      setForm({
        name: rule.name ?? '',
        enabled: rule.enabled ?? 1,
        pattern: rule.pattern ?? '',
        replacement: rule.replacement ?? '',
        flags: rule.flags ?? 'g',
        scope: rule.scope ?? 'user_input',
        world_id: rule.world_id ?? null,
      });
      if (!FLAGS_PRESETS.includes(rule.flags ?? 'g')) {
        setFlagsCustom(true);
      }
    }
  }, [rule]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleTest() {
    setTestError('');
    setTestOutput(null);
    try {
      const re = new RegExp(form.pattern, form.flags);
      setTestOutput(testInput.replace(re, form.replacement));
    } catch (err) {
      setTestError(err.message);
    }
  }

  async function handleSave() {
    if (!form.name.trim()) { alert('请填写规则名称'); return; }
    if (!form.pattern.trim()) { alert('请填写正则表达式'); return; }
    setSaving(true);
    try {
      await onSave(form);
    } catch (e) {
      alert(`保存失败：${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-[var(--text-h)]">
            {rule ? '编辑规则' : '新建规则'}
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--text)] opacity-50 hover:opacity-100 transition-opacity text-lg leading-none"
          >
            ×
          </button>
        </div>

        {/* 名称 */}
        <div>
          <label className="block text-sm text-[var(--text)] mb-1">规则名称</label>
          <input
            className="w-full px-3 py-2 bg-[var(--code-bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm focus:outline-none focus:border-[var(--accent)]"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="便于识别的名称"
          />
        </div>

        {/* 作用时机 */}
        <div>
          <label className="block text-sm text-[var(--text)] mb-1">作用时机</label>
          <select
            className="w-full px-3 py-2 bg-[var(--code-bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm focus:outline-none focus:border-[var(--accent)]"
            value={form.scope}
            onChange={(e) => setField('scope', e.target.value)}
          >
            {SCOPE_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label} — {s.desc}</option>
            ))}
          </select>
        </div>

        {/* 作用世界 */}
        <div>
          <label className="block text-sm text-[var(--text)] mb-1">作用范围</label>
          <select
            className="w-full px-3 py-2 bg-[var(--code-bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm focus:outline-none focus:border-[var(--accent)]"
            value={form.world_id ?? ''}
            onChange={(e) => setField('world_id', e.target.value || null)}
          >
            <option value="">全局（所有世界）</option>
            {(worlds || []).map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>

        {/* 正则表达式 */}
        <div>
          <label className="block text-sm text-[var(--text)] mb-1">正则表达式</label>
          <input
            className="w-full px-3 py-2 bg-[var(--code-bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
            value={form.pattern}
            onChange={(e) => setField('pattern', e.target.value)}
            placeholder="不含 / 分隔符和 flags，如：哈哈"
          />
        </div>

        {/* 替换文本 */}
        <div>
          <label className="block text-sm text-[var(--text)] mb-1">替换文本</label>
          <input
            className="w-full px-3 py-2 bg-[var(--code-bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
            value={form.replacement}
            onChange={(e) => setField('replacement', e.target.value)}
            placeholder="支持 $1 $2 等回引，留空表示删除匹配部分"
          />
        </div>

        {/* Flags */}
        <div>
          <label className="block text-sm text-[var(--text)] mb-1">Flags</label>
          <div className="flex gap-2 flex-wrap">
            {FLAGS_PRESETS.map((f) => (
              <button
                key={f}
                onClick={() => { setField('flags', f); setFlagsCustom(false); }}
                className={`px-3 py-1 text-sm rounded border font-mono transition-colors ${
                  !flagsCustom && form.flags === f
                    ? 'border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--text-h)]'
                    : 'border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]'
                }`}
              >
                {f}
              </button>
            ))}
            <button
              onClick={() => setFlagsCustom(true)}
              className={`px-3 py-1 text-sm rounded border transition-colors ${
                flagsCustom
                  ? 'border-[var(--accent)] bg-[var(--accent-bg)] text-[var(--text-h)]'
                  : 'border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]'
              }`}
            >
              自定义
            </button>
            {flagsCustom && (
              <input
                className="px-3 py-1 w-24 bg-[var(--code-bg)] border border-[var(--accent)] rounded text-[var(--text-h)] text-sm font-mono focus:outline-none"
                value={form.flags}
                onChange={(e) => setField('flags', e.target.value)}
                placeholder="如 gims"
              />
            )}
          </div>
        </div>

        {/* 启用 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setField('enabled', form.enabled ? 0 : 1)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              form.enabled ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                form.enabled ? 'translate-x-4' : 'translate-x-1'
              }`}
            />
          </button>
          <span className="text-sm text-[var(--text)]">{form.enabled ? '已启用' : '已禁用'}</span>
        </div>

        {/* 测试区 */}
        <div className="border border-[var(--border)] rounded-xl p-4 flex flex-col gap-2 bg-[var(--code-bg)]">
          <span className="text-xs text-[var(--text)] opacity-60 font-medium uppercase tracking-wide">测试</span>
          <textarea
            className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm font-mono focus:outline-none focus:border-[var(--accent)] resize-none"
            rows={3}
            placeholder="输入样本文本…"
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
          />
          <button
            onClick={handleTest}
            className="self-start px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg text-[var(--text-h)] hover:border-[var(--accent)] transition-colors"
          >
            测试替换
          </button>
          {testError && (
            <p className="text-xs text-red-400 font-mono">{testError}</p>
          )}
          {testOutput !== null && !testError && (
            <div className="px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm font-mono whitespace-pre-wrap">
              {testOutput}
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg text-[var(--text-h)] hover:bg-[var(--border)] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
