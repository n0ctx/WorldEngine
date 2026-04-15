import { useState, useRef } from 'react';

const TYPE_OPTIONS = [
  { value: 'text',    label: '文本' },
  { value: 'number',  label: '数值' },
  { value: 'boolean', label: '布尔' },
  { value: 'enum',    label: '枚举' },
];

const UPDATE_MODE_OPTIONS = [
  { value: 'manual',      label: '手动' },
  { value: 'llm_auto',    label: 'LLM 自动' },
  { value: 'system_rule', label: '系统规则' },
];

const TRIGGER_MODE_OPTIONS = [
  { value: 'manual_only',    label: '仅手动' },
  { value: 'every_turn',     label: '每轮更新' },
  { value: 'keyword_based',  label: '关键词触发' },
];

const inputCls = 'w-full px-3 py-2 bg-ivory border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent';
const selectCls = 'w-full px-3 py-2 bg-ivory border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent';
const labelCls = 'block text-sm text-text-secondary mb-1';

/**
 * StateFieldEditor — 创建/编辑状态字段的模态弹窗
 * Props:
 *   field      — 现有字段对象（编辑模式）或 null（创建模式）
 *   scope      — 'world' | 'character'（决定 update_mode 选项范围）
 *   onSave(data) — 父组件负责调用 API，返回 Promise
 *   onClose()
 */
export default function StateFieldEditor({ field, scope, onSave, onClose }) {
  const [form, setForm] = useState(() => ({
    field_key:          field?.field_key ?? '',
    label:              field?.label ?? '',
    type:               field?.type ?? 'text',
    description:        field?.description ?? '',
    update_mode:        field?.update_mode ?? 'manual',
    trigger_mode:       field?.trigger_mode ?? 'manual_only',
    trigger_keywords:   Array.isArray(field?.trigger_keywords) ? field.trigger_keywords : [],
    enum_options:       Array.isArray(field?.enum_options) ? field.enum_options : [],
    min_value:          field?.min_value ?? '',
    max_value:          field?.max_value ?? '',
    allow_empty:        field?.allow_empty ?? 1,
    update_instruction: field?.update_instruction ?? '',
    default_value:      field?.default_value ?? '',
  }));

  const [kwInput, setKwInput] = useState('');
  const [enumInput, setEnumInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const kwRef = useRef(null);
  const enumRef = useRef(null);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  // ── 关键词 tags ──
  function addKw(raw) {
    const kw = raw.trim();
    if (!kw || form.trigger_keywords.includes(kw)) return;
    set('trigger_keywords', [...form.trigger_keywords, kw]);
    setKwInput('');
  }
  function removeKw(kw) { set('trigger_keywords', form.trigger_keywords.filter((k) => k !== kw)); }

  // ── 枚举选项 tags ──
  function addEnum(raw) {
    const v = raw.trim();
    if (!v || form.enum_options.includes(v)) return;
    set('enum_options', [...form.enum_options, v]);
    setEnumInput('');
  }
  function removeEnum(v) { set('enum_options', form.enum_options.filter((e) => e !== v)); }

  async function handleSave() {
    if (!form.field_key.trim()) { setError('field_key 为必填项'); return; }
    if (!form.label.trim())     { setError('label 为必填项'); return; }
    if (!form.type)             { setError('type 为必填项'); return; }

    setSaving(true);
    setError('');
    try {
      const payload = {
        field_key:          form.field_key.trim(),
        label:              form.label.trim(),
        type:               form.type,
        description:        form.description,
        update_mode:        form.update_mode,
        trigger_mode:       form.trigger_mode,
        trigger_keywords:   form.trigger_mode === 'keyword_based' && form.trigger_keywords.length
                              ? form.trigger_keywords : null,
        enum_options:       form.type === 'enum' && form.enum_options.length
                              ? form.enum_options : null,
        min_value:          form.type === 'number' && form.min_value !== '' ? Number(form.min_value) : null,
        max_value:          form.type === 'number' && form.max_value !== '' ? Number(form.max_value) : null,
        allow_empty:        form.allow_empty,
        update_instruction: form.update_instruction,
        default_value:      form.default_value !== '' ? form.default_value : null,
      };
      await onSave(payload);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const updateModeOpts = scope === 'world'
    ? UPDATE_MODE_OPTIONS
    : UPDATE_MODE_OPTIONS.filter((o) => o.value !== 'system_rule');

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
      <div className="bg-canvas border border-border rounded-2xl shadow-whisper w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-base font-semibold text-text">
            {field ? '编辑字段' : '新建字段'}
          </h2>
        </div>

        <div className="px-6 py-4 flex flex-col gap-4 overflow-y-auto">
          {/* 基础信息 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>label <span className="text-red-400">*</span></label>
              <input className={inputCls} value={form.label}
                onChange={(e) => set('label', e.target.value)} placeholder="显示名称" />
            </div>
            <div>
              <label className={labelCls}>field_key <span className="text-red-400">*</span></label>
              <input className={inputCls} value={form.field_key}
                onChange={(e) => set('field_key', e.target.value.replace(/\s/g, '_'))}
                placeholder="唯一标识符" disabled={!!field} />
            </div>
          </div>

          {/* 类型 */}
          <div>
            <label className={labelCls}>类型 <span className="text-red-400">*</span></label>
            <select className={selectCls} value={form.type}
              onChange={(e) => set('type', e.target.value)}>
              {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* 枚举选项（type=enum 时显示） */}
          {form.type === 'enum' && (
            <div>
              <label className={labelCls}>枚举选项（回车添加）</label>
              <div
                className="w-full min-h-[42px] px-2 py-1.5 bg-ivory border border-border rounded-lg flex flex-wrap gap-1.5 cursor-text focus-within:border-accent"
                onClick={() => enumRef.current?.focus()}
              >
                {form.enum_options.map((v) => (
                  <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent/10 text-accent text-xs rounded-md">
                    {v}
                    <button type="button" onClick={(e) => { e.stopPropagation(); removeEnum(v); }}
                      className="opacity-60 hover:opacity-100">×</button>
                  </span>
                ))}
                <input ref={enumRef}
                  className="flex-1 min-w-[80px] bg-transparent outline-none text-sm text-text placeholder:text-text-secondary placeholder:opacity-40"
                  value={enumInput} onChange={(e) => setEnumInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addEnum(enumInput); }
                    else if (e.key === 'Backspace' && enumInput === '' && form.enum_options.length) {
                      removeEnum(form.enum_options[form.enum_options.length - 1]);
                    }
                  }}
                  onBlur={() => { if (enumInput.trim()) addEnum(enumInput); }}
                  placeholder={form.enum_options.length === 0 ? '输入选项后按回车' : ''}
                />
              </div>
            </div>
          )}

          {/* 数值范围（type=number 时显示） */}
          {form.type === 'number' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>最小值</label>
                <input type="number" className={inputCls} value={form.min_value}
                  onChange={(e) => set('min_value', e.target.value)} placeholder="不限" />
              </div>
              <div>
                <label className={labelCls}>最大值</label>
                <input type="number" className={inputCls} value={form.max_value}
                  onChange={(e) => set('max_value', e.target.value)} placeholder="不限" />
              </div>
            </div>
          )}

          {/* 默认值 */}
          <div>
            <label className={labelCls}>默认值</label>
            <input className={inputCls} value={form.default_value}
              onChange={(e) => set('default_value', e.target.value)}
              placeholder="留空表示无默认值" />
          </div>

          {/* 说明 */}
          <div>
            <label className={labelCls}>字段说明（给 LLM 的提示）</label>
            <textarea className={`${inputCls} resize-none`} rows={2} value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="告诉 LLM 这个字段代表什么" />
          </div>

          {/* 更新模式 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>更新方式</label>
              <select className={selectCls} value={form.update_mode}
                onChange={(e) => set('update_mode', e.target.value)}>
                {updateModeOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>触发时机</label>
              <select className={selectCls} value={form.trigger_mode}
                onChange={(e) => set('trigger_mode', e.target.value)}>
                {TRIGGER_MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* 触发关键词（trigger_mode=keyword_based 时显示） */}
          {form.trigger_mode === 'keyword_based' && (
            <div>
              <label className={labelCls}>触发关键词（回车添加）</label>
              <div
                className="w-full min-h-[42px] px-2 py-1.5 bg-ivory border border-border rounded-lg flex flex-wrap gap-1.5 cursor-text focus-within:border-accent"
                onClick={() => kwRef.current?.focus()}
              >
                {form.trigger_keywords.map((kw) => (
                  <span key={kw} className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent/10 text-accent text-xs rounded-md">
                    {kw}
                    <button type="button" onClick={(e) => { e.stopPropagation(); removeKw(kw); }}
                      className="opacity-60 hover:opacity-100">×</button>
                  </span>
                ))}
                <input ref={kwRef}
                  className="flex-1 min-w-[80px] bg-transparent outline-none text-sm text-text placeholder:text-text-secondary placeholder:opacity-40"
                  value={kwInput} onChange={(e) => setKwInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addKw(kwInput); }
                    else if (e.key === 'Backspace' && kwInput === '' && form.trigger_keywords.length) {
                      removeKw(form.trigger_keywords[form.trigger_keywords.length - 1]);
                    }
                  }}
                  onBlur={() => { if (kwInput.trim()) addKw(kwInput); }}
                  placeholder={form.trigger_keywords.length === 0 ? '输入关键词后按回车' : ''}
                />
              </div>
            </div>
          )}

          {/* 更新指令 */}
          <div>
            <label className={labelCls}>更新指令（告诉 LLM 如何更新该字段）</label>
            <textarea className={`${inputCls} resize-none`} rows={2} value={form.update_instruction}
              onChange={(e) => set('update_instruction', e.target.value)}
              placeholder="例：根据对话内容判断当前心情" />
          </div>

          {/* 允许为空 */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.allow_empty === 1}
              onChange={(e) => set('allow_empty', e.target.checked ? 1 : 0)}
              className="accent-accent" />
            <span className="text-sm text-text-secondary">允许值为空</span>
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text transition-colors">
            取消
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 text-sm bg-accent text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
