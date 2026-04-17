import { useState, useEffect } from 'react';
import Select from '../ui/Select';

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
      <div className="we-dialog-panel w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="we-dialog-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>{rule ? '编辑规则' : '新建规则'}</h3>
          <button
            onClick={onClose}
            style={{ fontFamily: 'var(--we-font-serif)', fontSize: '18px', color: 'var(--we-ink-faded)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, opacity: 0.6, transition: 'opacity 0.15s' }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
            onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
          >
            ×
          </button>
        </div>

        <div className="we-dialog-body flex flex-col gap-4">

        {/* 名称 */}
        <div>
          <label className="we-dialog-label">规则名称</label>
          <input
            className="we-input"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="便于识别的名称"
          />
        </div>

        {/* 作用时机 */}
        <div>
          <label className="we-dialog-label">作用时机</label>
          <Select
            value={form.scope}
            onChange={(v) => setField('scope', v)}
            options={SCOPE_OPTIONS.map((s) => ({ value: s.value, label: `${s.label} — ${s.desc}` }))}
          />
        </div>

        {/* 作用世界 */}
        <div>
          <label className="we-dialog-label">作用范围</label>
          <Select
            value={form.world_id ?? ''}
            onChange={(v) => setField('world_id', v || null)}
            options={[
              { value: '', label: '全局（所有世界）' },
              ...(worlds || []).map((w) => ({ value: w.id, label: w.name })),
            ]}
          />
        </div>

        {/* 正则表达式 */}
        <div>
          <label className="we-dialog-label">正则表达式</label>
          <input
            className="we-input"
            style={{ fontFamily: 'var(--we-font-mono)', fontSize: '13.5px' }}
            value={form.pattern}
            onChange={(e) => setField('pattern', e.target.value)}
            placeholder="不含 / 分隔符和 flags，如：哈哈"
          />
        </div>

        {/* 替换文本 */}
        <div>
          <label className="we-dialog-label">替换文本</label>
          <input
            className="we-input"
            style={{ fontFamily: 'var(--we-font-mono)', fontSize: '13.5px' }}
            value={form.replacement}
            onChange={(e) => setField('replacement', e.target.value)}
            placeholder="支持 $1 $2 等回引，留空表示删除匹配部分"
          />
        </div>

        {/* Flags */}
        <div>
          <label className="we-dialog-label">Flags</label>
          <div className="flex gap-2 flex-wrap">
            {FLAGS_PRESETS.map((f) => (
              <button
                key={f}
                onClick={() => { setField('flags', f); setFlagsCustom(false); }}
                className={`px-3 py-1 text-sm rounded border font-mono transition-colors ${
                  !flagsCustom && form.flags === f
                    ? 'border-accent bg-accent/10 text-text'
                    : 'border-border text-text-secondary hover:border-accent'
                }`}
              >
                {f}
              </button>
            ))}
            <button
              onClick={() => setFlagsCustom(true)}
              className={`px-3 py-1 text-sm rounded border transition-colors ${
                flagsCustom
                  ? 'border-accent bg-accent/10 text-text'
                  : 'border-border text-text-secondary hover:border-accent'
              }`}
            >
              自定义
            </button>
            {flagsCustom && (
              <input
                className="px-3 py-1 w-24 bg-ivory border border-accent rounded text-text text-sm font-mono focus:outline-none"
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
              form.enabled ? 'bg-accent' : 'bg-border'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                form.enabled ? 'translate-x-4' : 'translate-x-1'
              }`}
            />
          </button>
          <span className="text-sm text-text-secondary">{form.enabled ? '已启用' : '已禁用'}</span>
        </div>

        {/* 测试区 */}
        <div style={{ border: '1px solid var(--we-paper-shadow)', borderRadius: '2px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(0,0,0,0.02)' }}>
          <span style={{ fontFamily: 'var(--we-font-display)', fontSize: '11px', letterSpacing: '0.2em', color: 'var(--we-ink-faded)', fontStyle: 'italic' }}>测试替换</span>
          <textarea
            className="we-textarea"
            style={{ fontFamily: 'var(--we-font-mono)', fontSize: '13px', minHeight: '64px' }}
            rows={3}
            placeholder="输入样本文本…"
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
          />
          <button onClick={handleTest} className="we-btn we-btn-sm" style={{ alignSelf: 'flex-start' }}>
            测试
          </button>
          {testError && (
            <p style={{ fontFamily: 'var(--we-font-mono)', fontSize: '12px', color: 'var(--we-vermilion)' }}>{testError}</p>
          )}
          {testOutput !== null && !testError && (
            <div style={{ fontFamily: 'var(--we-font-mono)', fontSize: '13px', color: 'var(--we-ink-secondary)', background: 'var(--we-paper-aged)', border: '1px solid var(--we-paper-shadow)', padding: '6px 10px', borderRadius: '1px', whiteSpace: 'pre-wrap' }}>
              {testOutput}
            </div>
          )}
        </div>

        </div>
        <div className="we-dialog-footer">
          <button onClick={onClose} className="we-btn we-btn-sm we-btn-secondary">取消</button>
          <button onClick={handleSave} disabled={saving} className="we-btn we-btn-sm we-btn-primary">
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
