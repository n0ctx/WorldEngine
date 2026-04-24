import { useState, useRef } from 'react';
import Select from '../ui/Select';

const TYPE_OPTIONS = [
  { value: 'text',    label: '文本' },
  { value: 'number',  label: '数值' },
  { value: 'boolean', label: '布尔' },
  { value: 'enum',    label: '枚举' },
  { value: 'list',    label: '列表' },
];

const UPDATE_MODE_OPTIONS = [
  { value: 'manual',   label: '手动' },
  { value: 'llm_auto', label: 'LLM 自动' },
];

const inputCls = 'we-input';
const labelCls = 'we-dialog-label';
const requiredMark = <span className="we-state-field-required">*</span>;

const DIARY_TIME_FIELD_KEY = 'diary_time';

/** 从 "N年N月N日N时N分" 字符串解析出 5 个整数，失败时返回默认值 */
function parseDiaryTimeDefault(str) {
  const m = (str ?? '').match(/^(\d+)年(\d+)月(\d+)日(\d+)时(\d+)分/);
  if (m) return { year: parseInt(m[1], 10), month: parseInt(m[2], 10), day: parseInt(m[3], 10), hour: parseInt(m[4], 10), minute: parseInt(m[5], 10) };
  // 兼容旧格式 "N年N月N日N时"（无分）
  const m2 = (str ?? '').match(/^(\d+)年(\d+)月(\d+)日(\d+)时/);
  if (m2) return { year: parseInt(m2[1], 10), month: parseInt(m2[2], 10), day: parseInt(m2[3], 10), hour: parseInt(m2[4], 10), minute: 0 };
  return { year: 1000, month: 1, day: 1, hour: 0, minute: 0 };
}

/**
 * StateFieldEditor — 创建/编辑状态字段的模态弹窗
 * Props:
 *   field         — 现有字段对象（编辑模式）或 null（创建模式）
 *   scope         — 'world' | 'character'（保留参数，不影响当前逻辑）
 *   diaryDateMode — 'virtual' | 'real' | undefined（仅 diary_time 字段时传入）
 *   onSave(data)  — 父组件负责调用 API，返回 Promise
 *   onClose()
 */
export default function StateFieldEditor({ field, diaryDateMode, onSave, onClose }) {
  const [form, setForm] = useState(() => {
    // 解析 list 类型的 default_value（存储为 JSON 数组字符串）
    let listDefaults = [];
    if (field?.type === 'list' && field?.default_value) {
      try { listDefaults = JSON.parse(field.default_value) || []; } catch { listDefaults = []; }
    }
    return {
      field_key:          field?.field_key ?? '',
      label:              field?.label ?? '',
      type:               field?.type ?? 'text',
      description:        field?.description ?? '',
      update_mode:        field?.update_mode === 'manual' ? 'manual' : 'llm_auto',
      enum_options:       Array.isArray(field?.enum_options) ? field.enum_options : [],
      list_defaults:      listDefaults,
      min_value:          field?.min_value ?? '',
      max_value:          field?.max_value ?? '',
      allow_empty:        field?.allow_empty ?? 1,
      update_instruction: field?.update_instruction ?? '',
      default_value:      field?.type === 'list' ? '' : (field?.default_value ?? ''),
    };
  });

  const [enumInput, setEnumInput] = useState('');
  const [listDefInput, setListDefInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const enumRef = useRef(null);
  const listDefRef = useRef(null);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  // ── 枚举选项 tags ──
  function addEnum(raw) {
    const v = raw.trim();
    if (!v || form.enum_options.includes(v)) return;
    set('enum_options', [...form.enum_options, v]);
    setEnumInput('');
  }
  function removeEnum(v) { set('enum_options', form.enum_options.filter((e) => e !== v)); }

  // ── 列表默认条目 tags ──
  function addListDef(raw) {
    const v = raw.trim();
    if (!v || form.list_defaults.includes(v)) return;
    set('list_defaults', [...form.list_defaults, v]);
    setListDefInput('');
  }
  function removeListDef(v) { set('list_defaults', form.list_defaults.filter((e) => e !== v)); }

  async function handleSave() {
    if (!form.field_key.trim()) { setError('field_key 为必填项'); return; }
    if (!form.label.trim())     { setError('label 为必填项'); return; }
    if (!form.type)             { setError('type 为必填项'); return; }

    setSaving(true);
    setError('');
    try {
      const defaultValue = (() => {
        if (form.type === 'list') {
          return form.list_defaults.length > 0 ? JSON.stringify(form.list_defaults) : null;
        }
        return form.default_value !== '' ? form.default_value : null;
      })();

      const payload = {
        field_key:          form.field_key.trim(),
        label:              form.label.trim(),
        type:               form.type,
        description:        form.description,
        update_mode:        form.update_mode,
        enum_options:       form.type === 'enum' && form.enum_options.length
                              ? form.enum_options : null,
        min_value:          form.type === 'number' && form.min_value !== '' ? Number(form.min_value) : null,
        max_value:          form.type === 'number' && form.max_value !== '' ? Number(form.max_value) : null,
        allow_empty:        1,
        update_instruction: form.update_instruction,
        default_value:      defaultValue,
      };
      await onSave(payload);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const isDiaryTime = field?.field_key === DIARY_TIME_FIELD_KEY;

  // ── diary_time 特殊编辑器 ──────────────────────────────────────────
  if (isDiaryTime) {
    const isReal = diaryDateMode === 'real';
    const dtParsed = parseDiaryTimeDefault(form.default_value);

    function setDt(k, v) {
      const next = { ...dtParsed, [k]: parseInt(v, 10) || 0 };
      set('default_value', `${next.year}年${next.month}月${next.day}日${next.hour}时${next.minute}分`);
    }

    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
        <div className="we-dialog-panel w-full max-w-sm flex flex-col">
          <div className="we-dialog-header">
            <h2>日记时间字段</h2>
          </div>
          <div className="we-dialog-body flex flex-col gap-4">
            <div>
              <label className={labelCls}>label {requiredMark}</label>
              <input className={inputCls} value={form.label} onChange={(e) => set('label', e.target.value)} />
            </div>
            {isReal ? (
              <p className="we-state-field-note">
                当前为<strong>真实日期</strong>模式，此字段由系统自动更新，无法手动编辑。
              </p>
            ) : (
              <>
                <p className="we-state-field-hint">
                  虚拟日期模式：设置故事的初始时间。格式固定为 <code>N年N月N日N时N分</code>，由 AI 每轮自动更新。
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {[
                    { key: 'year',   label: '年', min: 1 },
                    { key: 'month',  label: '月', min: 1, max: 12 },
                    { key: 'day',    label: '日', min: 1, max: 31 },
                    { key: 'hour',   label: '时', min: 0, max: 23 },
                    { key: 'minute', label: '分', min: 0, max: 59 },
                  ].map(({ key, label, min, max }) => (
                    <div key={key}>
                      <label className={labelCls}>{label}</label>
                      <input
                        type="number"
                        className={inputCls}
                        value={dtParsed[key]}
                        min={min}
                        max={max}
                        onChange={(e) => setDt(key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
                <p className="we-state-field-hint">
                  初始时间：<strong>{form.default_value || `${dtParsed.year}年${dtParsed.month}月${dtParsed.day}日${dtParsed.hour}时${dtParsed.minute}分`}</strong>
                </p>
              </>
            )}
            {error && (
              <p className="we-state-field-error">{error}</p>
            )}
          </div>
          <div className="we-dialog-footer">
            <button onClick={onClose} className="we-btn we-btn-sm we-btn-secondary">关闭</button>
            <button onClick={handleSave} disabled={saving} className="we-btn we-btn-sm we-btn-primary">
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
      <div className="we-dialog-panel w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="we-dialog-header">
          <h2>{field ? '编辑字段' : '新建字段'}</h2>
        </div>

        <div className="we-dialog-body flex flex-col gap-4">
          {/* 基础信息 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>label {requiredMark}</label>
              <input className={inputCls} value={form.label}
                onChange={(e) => set('label', e.target.value)} placeholder="显示名称" />
            </div>
            <div>
              <label className={labelCls}>field_key {requiredMark}</label>
              <input className={inputCls} value={form.field_key}
                onChange={(e) => set('field_key', e.target.value.replace(/\s/g, '_'))}
                placeholder="唯一标识符" disabled={!!field} />
            </div>
          </div>

          {/* 类型 */}
          <div>
            <label className={labelCls}>类型 {requiredMark}</label>
            <Select value={form.type} onChange={(v) => set('type', v)} options={TYPE_OPTIONS} />
          </div>

          {/* 枚举选项（type=enum 时显示） */}
          {form.type === 'enum' && (
            <div>
              <label className={labelCls}>枚举选项（回车添加）</label>
              <div
                className="we-tag-input"
                onClick={() => enumRef.current?.focus()}
                role="group"
                aria-label="枚举选项标签输入区"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.currentTarget.querySelector('input')?.focus();
                  }
                }}
              >
                {form.enum_options.map((v) => (
                  <span key={v} className="we-tag">
                    {v}
                    <button type="button" onClick={(e) => { e.stopPropagation(); removeEnum(v); }}>×</button>
                  </span>
                ))}
                <input ref={enumRef} className="we-tag-input-field"
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

          {/* 列表默认条目（type=list 时显示） */}
          {form.type === 'list' && (
            <div>
              <label className={labelCls}>默认条目（回车添加）</label>
              <div
                className="we-tag-input"
                onClick={() => listDefRef.current?.focus()}
                role="group"
                aria-label="列表默认条目标签输入区"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.currentTarget.querySelector('input')?.focus();
                  }
                }}
              >
                {form.list_defaults.map((v) => (
                  <span key={v} className="we-tag">
                    {v}
                    <button type="button" onClick={(e) => { e.stopPropagation(); removeListDef(v); }}>×</button>
                  </span>
                ))}
                <input ref={listDefRef} className="we-tag-input-field"
                  value={listDefInput} onChange={(e) => setListDefInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addListDef(listDefInput); }
                    else if (e.key === 'Backspace' && listDefInput === '' && form.list_defaults.length) {
                      removeListDef(form.list_defaults[form.list_defaults.length - 1]);
                    }
                  }}
                  onBlur={() => { if (listDefInput.trim()) addListDef(listDefInput); }}
                  placeholder={form.list_defaults.length === 0 ? '输入条目后按回车' : ''}
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

          {/* 默认值（list 类型用上方"默认条目"代替，此处不显示） */}
          {form.type !== 'list' && (
            <div>
              <label className={labelCls}>默认值</label>
              <input className={inputCls} value={form.default_value}
                onChange={(e) => set('default_value', e.target.value)}
                placeholder="留空表示无默认值" />
            </div>
          )}

          {/* 说明 */}
          <div>
            <label className={labelCls}>字段说明（给 LLM 的提示）</label>
            <textarea className={`${inputCls} resize-none`} rows={2} value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="「字段含义说明」——告诉 LLM 这个字段代表什么，会注入到提示词上下文中" />
          </div>

          {/* 更新方式 */}
          <div>
            <label className={labelCls}>更新方式</label>
            <Select value={form.update_mode} onChange={(v) => set('update_mode', v)} options={UPDATE_MODE_OPTIONS} />
          </div>

          {/* 更新指令（LLM 自动时显示） */}
          {form.update_mode === 'llm_auto' && (
            <div>
              <label className={labelCls}>更新指令（告诉 LLM 如何更新该字段）</label>
              <textarea className={`${inputCls} resize-none`} rows={2} value={form.update_instruction}
                onChange={(e) => set('update_instruction', e.target.value)}
                placeholder="「更新指令」——告诉 LLM 在何种情况下、如何判断并更新这个字段的值" />
            </div>
          )}

          {error && (
            <p className="we-state-field-error">
              {error}
            </p>
          )}
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
