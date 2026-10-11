import Input from '../ui/Input';
import Range from '../ui/Range';
import FormGroup from '../ui/FormGroup';
import FieldLabel from '../ui/FieldLabel';

/**
 * 温度 / 单次回复上限生成参数 —— 对话主模型 / 写作主模型 / 副模型共用。
 *
 * inherit 为假（对话主模型）：温度 0.1–2.0 默认 0.8，单次回复上限默认 4096。
 * inherit 为真（写作主模型 / 副模型）：温度滑条 min=0，0 = 继承显示「继承」；
 * 单次回复上限留空 = 继承。inherit 模式下的标签与提示文案由调用方传入
 * （写作主模型与副模型措辞不同）。
 */
export default function LlmGenerationSettings({
  config,
  inherit = false,
  temperatureLabel,
  temperatureHint,
  maxTokensLabel,
  maxTokensHint,
  inheritPlaceholder,
  onTemperatureChange,
  onMaxTokensChange,
}) {
  const tempMin = inherit ? 0 : 0.1;
  const tempDefault = inherit ? 0 : 0.8;
  const tempValue = inherit ? (config.temperature ?? 0) : (config.temperature ?? tempDefault);
  const tempDisplay = inherit
    ? (config.temperature != null && config.temperature > 0 ? config.temperature.toFixed(1) : '继承')
    : (config.temperature ?? tempDefault).toFixed(1);

  return (
    <>
      {onTemperatureChange && (
        <div className="we-settings-inline-control-block">
          <div className="we-settings-range-head">
            <FieldLabel
              hint={inherit ? temperatureHint : '即 Temperature。越高越天马行空，越低越稳定'}
              variant="settings"
            >
              {inherit ? temperatureLabel : '随机度'}
            </FieldLabel>
            <span className="we-settings-range-value">{tempDisplay}</span>
          </div>
          <Range
            min={tempMin}
            max="2.0"
            step="0.1"
            value={tempValue}
            onChange={(e) => {
              const value = parseFloat(e.target.value);
              if (inherit) {
                onTemperatureChange(value === 0 ? null : value);
              } else {
                onTemperatureChange(value);
              }
            }}
          />
        </div>
      )}

      {onMaxTokensChange && (
        <FormGroup
          label={inherit ? maxTokensLabel : '单次回复上限'}
          hint={inherit ? maxTokensHint : '即 Max Tokens，一次回复最多生成多少 Token'}
          variant="settings"
        >
          <Input
            type="number"
            min="64" max="32000" step="64"
            value={inherit ? (config.max_tokens ?? '') : (config.max_tokens ?? 4096)}
            placeholder={inherit ? inheritPlaceholder : undefined}
            onChange={(e) => {
              const raw = e.target.value;
              if (inherit) {
                onMaxTokensChange(raw ? parseInt(raw, 10) : null);
              } else {
                onMaxTokensChange(parseInt(raw, 10));
              }
            }}
          />
        </FormGroup>
      )}
    </>
  );
}
