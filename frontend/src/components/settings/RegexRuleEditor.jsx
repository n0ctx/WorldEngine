import { useState } from 'react';
import Select from '../ui/Select';
import Input from '../ui/Input';
import SegmentedControl from '../ui/SegmentedControl';
import ToggleSwitch from '../ui/ToggleSwitch';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import Dialog from '../ui/Dialog';
import { log } from '../../core/utils/logger.js';
import {
  REGEX_SCOPES,
  REGEX_SCOPE_LABELS,
  REGEX_SCOPE_DESCRIPTIONS,
} from '../../../../shared/regex-scopes.mjs';

const SCOPE_OPTIONS = REGEX_SCOPES.map((value) => ({
  value,
  label: REGEX_SCOPE_LABELS[value],
  desc: REGEX_SCOPE_DESCRIPTIONS[value],
}));

const FLAGS_PRESETS = ['g', 'gi', 'gm', 'gim'];
const FLAGS_CUSTOM = 'custom';
const FLAGS_OPTIONS = [...FLAGS_PRESETS.map((f) => ({ value: f, label: f })), { value: FLAGS_CUSTOM, label: '自定义' }];

function buildForm(rule, fallbackMode) {
  return {
    name: rule?.name ?? '',
    enabled: rule?.enabled ?? 1,
    pattern: rule?.pattern ?? '',
    replacement: rule?.replacement ?? '',
    flags: rule?.flags ?? 'g',
    scope: rule?.scope ?? 'user_input',
    world_id: rule?.world_id ?? null,
    mode: rule?.mode ?? fallbackMode ?? 'chat',
  };
}

export default function RegexRuleEditor({ rule, worlds, settingsMode, onSave, onClose }) {
  const [form, setForm] = useState(() => buildForm(rule, settingsMode));

  const [testInput, setTestInput] = useState('');
  const [testOutput, setTestOutput] = useState(null);
  const [testError, setTestError] = useState('');
  const [saving, setSaving] = useState(false);
  const [flagsCustom, setFlagsCustom] = useState(() => !FLAGS_PRESETS.includes(rule?.flags ?? 'g'));

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
    if (!form.name.trim()) { log.error('regex.rule.name_required', null, { toast: '请填写规则名称' }); return; }
    if (!form.pattern.trim()) { log.error('regex.rule.pattern_required', null, { toast: '请填写正则表达式' }); return; }
    setSaving(true);
    try {
      await onSave(form);
    } catch (e) {
      log.error('regex.rule.save_failed', e, { toast: `保存失败：${e.message}` });
      setSaving(false);
    }
  }

  return (
    <Dialog
      size="md"
      title={rule ? '编辑规则' : '新建规则'}
      busy={saving}
      bodyClassName="flex flex-col gap-4"
      onClose={onClose}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>取消</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </>
      )}
    >
      {/* 名称 */}
      <div>
        <label className="we-dialog-label">规则名称</label>
        <Input
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

      {/* 作用范围 */}
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
        <Input
          className="we-regex-field--mono"
          value={form.pattern}
          onChange={(e) => setField('pattern', e.target.value)}
          placeholder="不含 / 分隔符和 flags，如：哈哈"
        />
      </div>

      {/* 替换文本 */}
      <div>
        <label className="we-dialog-label">替换文本</label>
        <Input
          className="we-regex-field--mono"
          value={form.replacement}
          onChange={(e) => setField('replacement', e.target.value)}
          placeholder="支持 $1 $2 等回引，留空表示删除匹配部分"
        />
      </div>

      {/* Flags */}
      <div>
        <label className="we-dialog-label">Flags</label>
        <div className="flex gap-2 flex-wrap items-center">
          <SegmentedControl
            size="sm"
            label="Flags"
            options={FLAGS_OPTIONS}
            value={flagsCustom ? FLAGS_CUSTOM : form.flags}
            onChange={(value) => {
              if (value === FLAGS_CUSTOM) { setFlagsCustom(true); return; }
              setField('flags', value);
              setFlagsCustom(false);
            }}
          />
          {flagsCustom && (
            <Input
              size="sm"
              style={{ width: '7em' }}
              value={form.flags}
              onChange={(e) => setField('flags', e.target.value)}
              placeholder="如 gims"
            />
          )}
        </div>
      </div>

      {/* 启用 */}
      <div className="flex items-center gap-2">
        <ToggleSwitch checked={!!form.enabled} onChange={(on) => setField('enabled', on ? 1 : 0)} label="启用规则" />
        <span className="we-type-ui text-[var(--we-color-text-secondary)]">{form.enabled ? '已启用' : '已禁用'}</span>
      </div>

      {/* 测试区 */}
      <div className="we-regex-test-box">
        <span className="we-regex-test-label">测试替换</span>
        <Textarea
          className="we-regex-test-textarea"
          rows={3}
          placeholder="输入样本文本…"
          value={testInput}
          onChange={(e) => setTestInput(e.target.value)}
        />
        <Button size="sm" variant="secondary" onClick={handleTest} className="we-regex-test-btn">
          测试
        </Button>
        {testError && (
          <p className="we-regex-test-error">{testError}</p>
        )}
        {testOutput !== null && !testError && (
          <div className="we-regex-test-output">
            {testOutput}
          </div>
        )}
      </div>
    </Dialog>
  );
}
