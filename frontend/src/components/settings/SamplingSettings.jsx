import { useState } from 'react';
import Input from '../ui/Input';
import FormGroup from '../ui/FormGroup';
import { SAMPLING_PARAMS, getSupportedSamplingParams, normalizeSamplingValue } from '../../core/utils/constants';

// 输入框显示用户敲的原文（如「0.」），存的是规整后的数字；失焦后显示存下的值
function SamplingField({ paramKey, value, onChange }) {
  const spec = SAMPLING_PARAMS[paramKey];
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  return (
    <FormGroup label={spec.label} hint={spec.hint} variant="settings">
      <Input
        type="number"
        min={spec.min} max={spec.max} step={spec.step}
        value={draft}
        placeholder="留空则不发送，用服务商默认值"
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(normalizeSamplingValue(paramKey, e.target.value));
        }}
        onBlur={() => setDraft(value == null ? '' : String(value))}
      />
    </FormGroup>
  );
}

// 只列出当前服务商支持的采样参数（shared/sampling-params.mjs）；未选服务商时不显示，都不支持时说明原因
export default function SamplingSettings({ provider, sampling, onSamplingChange }) {
  if (!onSamplingChange || !provider) return null;
  const keys = getSupportedSamplingParams(provider);
  const current = sampling || {};
  const setCount = keys.filter((key) => current[key] != null).length;

  return (
    <details className="we-settings-sampling">
      <summary>高级采样{setCount > 0 ? `（已设置 ${setCount} 项）` : ''}</summary>
      <div className="we-settings-sampling-body">
        {keys.length === 0 ? (
          <p className="we-settings-inline-hint">当前服务商固定了采样参数或会拒收这些参数，这里没有可调项。</p>
        ) : keys.map((key) => (
          <SamplingField
            key={key}
            paramKey={key}
            value={current[key]}
            onChange={(value) => onSamplingChange({ ...current, [key]: value })}
          />
        ))}
      </div>
    </details>
  );
}
