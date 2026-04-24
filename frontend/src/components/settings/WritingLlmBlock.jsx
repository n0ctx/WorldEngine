import Input from '../ui/Input';
import Button from '../ui/Button';
import ModelCombobox from '../ui/ModelCombobox';
import FormGroup from '../ui/FormGroup';
import FieldLabel from '../ui/FieldLabel';

const RANGE_PCT_CLASS = {
  0: '[--range-pct:0%]',
  5: '[--range-pct:5%]',
  10: '[--range-pct:10%]',
  15: '[--range-pct:15%]',
  20: '[--range-pct:20%]',
  25: '[--range-pct:25%]',
  30: '[--range-pct:30%]',
  35: '[--range-pct:35%]',
  40: '[--range-pct:40%]',
  45: '[--range-pct:45%]',
  50: '[--range-pct:50%]',
  55: '[--range-pct:55%]',
  60: '[--range-pct:60%]',
  65: '[--range-pct:65%]',
  70: '[--range-pct:70%]',
  75: '[--range-pct:75%]',
  80: '[--range-pct:80%]',
  85: '[--range-pct:85%]',
  90: '[--range-pct:90%]',
  95: '[--range-pct:95%]',
  100: '[--range-pct:100%]',
};

export default function WritingLlmBlock({ writingLlm, onWritingLlmChange, chatModel }) {
  const temperature = writingLlm.temperature ?? 0;
  const temperaturePct = Math.round((temperature / 2.0) * 20) * 5;

  return (
    <div className="we-settings-field-group">
      <p className="we-settings-subsection-title">写作空间 LLM 覆盖</p>
      <p className="mb-3 mt-0 text-xs italic text-[var(--we-color-text-tertiary)] [font-family:var(--we-font-serif)]">
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
      <div>
        <div className="we-settings-range-head">
          <FieldLabel hint="null 则继承对话温度">写作 Temperature</FieldLabel>
          <span className="we-settings-range-value">
            {writingLlm.temperature != null ? (writingLlm.temperature).toFixed(1) : '继承'}
          </span>
        </div>
        <input
          type="range"
          className={['we-range', RANGE_PCT_CLASS[temperaturePct] ?? RANGE_PCT_CLASS[0]].join(' ')}
          min="0" max="2.0" step="0.1"
          value={temperature}
          onChange={(e) => onWritingLlmChange('temperature', parseFloat(e.target.value))}
        />
        <div className="mt-2 flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => onWritingLlmChange('temperature', null)}>继承</Button>
        </div>
      </div>
      <FormGroup label="写作 Max Tokens" hint="null 则继承对话最大 Token">
        <div className="flex gap-2">
          <Input
            type="number"
            min="64" max="32000" step="64"
            value={writingLlm.max_tokens ?? ''}
            placeholder="留空继承对话配置"
            onChange={(e) => onWritingLlmChange('max_tokens', e.target.value ? parseInt(e.target.value, 10) : null)}
            className="flex-1"
          />
          <Button variant="ghost" size="sm" onClick={() => onWritingLlmChange('max_tokens', null)}>继承</Button>
        </div>
      </FormGroup>
    </div>
  );
}
