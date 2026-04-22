import Input from '../ui/Input';
import Button from '../ui/Button';
import ModelCombobox from '../ui/ModelCombobox';
import FormGroup from '../ui/FormGroup';
import FieldLabel from '../ui/FieldLabel';

export default function WritingLlmBlock({ writingLlm, onWritingLlmChange, chatModel }) {
  return (
    <div className="we-settings-field-group">
      <p className="we-settings-subsection-title">写作空间 LLM 覆盖</p>
      <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '12px', color: 'var(--we-ink-faded)', fontStyle: 'italic', margin: '0 0 12px' }}>
        Provider / API Key / Base URL 与对话空间共享。留空或为 null 则继承对话空间的值。
      </p>
      <FormGroup label="写作模型" hint={`对话模型：${chatModel || '(未配置)'}`}>
        <ModelCombobox
          value={writingLlm.model || ''}
          onChange={(v) => onWritingLlmChange('model', v)}
          options={[]}
          placeholder={`留空则使用对话模型（${chatModel || '未配置'}）`}
        />
      </FormGroup>
      <div className="we-edit-form-group">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <FieldLabel hint="null 则继承对话温度">写作 Temperature</FieldLabel>
          <span style={{ fontFamily: 'var(--we-font-serif)', fontSize: '14px', color: 'var(--we-ink-primary)' }}>
            {writingLlm.temperature != null ? (writingLlm.temperature).toFixed(1) : '继承'}
          </span>
        </div>
        <input
          type="range"
          className="we-range"
          min="0" max="2.0" step="0.1"
          value={writingLlm.temperature ?? 0}
          onChange={(e) => onWritingLlmChange('temperature', parseFloat(e.target.value))}
          style={{ '--range-pct': `${((writingLlm.temperature ?? 0) / 2.0) * 100}%` }}
        />
        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
          <Button variant="ghost" size="sm" onClick={() => onWritingLlmChange('temperature', null)}>继承</Button>
        </div>
      </div>
      <FormGroup label="写作 Max Tokens" hint="null 则继承对话最大 Token">
        <div style={{ display: 'flex', gap: '8px' }}>
          <Input
            type="number"
            min="64" max="32000" step="64"
            value={writingLlm.max_tokens ?? ''}
            placeholder="留空继承对话配置"
            onChange={(e) => onWritingLlmChange('max_tokens', e.target.value ? parseInt(e.target.value, 10) : null)}
            style={{ flex: 1 }}
          />
          <Button variant="ghost" size="sm" onClick={() => onWritingLlmChange('max_tokens', null)}>继承</Button>
        </div>
      </FormGroup>
    </div>
  );
}
