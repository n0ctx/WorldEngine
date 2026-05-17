import { useState } from 'react';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import Range from '../ui/Range';
import ModelSelector from './ModelSelector';
import FormGroup from '../ui/FormGroup';
import FieldLabel from '../ui/FieldLabel';
import {
  LOCAL_PROVIDERS,
  NEEDS_BASE_URL_PROVIDERS,
  DEFAULT_BASE_URLS,
  PROVIDER_HINTS,
  getProviderThinkingOptions,
} from '../../core/constants/settings';
import { log } from '../../core/utils/logger.js';

/**
 * 主模型(LLM)配置区块 —— 对话/写作模式共用
 *
 * 通过 `inheritFrom` 切换两套语义：
 *   - null（对话模式）：provider 必填；temperature 0.1–2.0 默认 0.8；max_tokens 默认 4096。
 *   - { label, model }（写作模式）：provider 留空回退；temperature 0 = 继承；max_tokens 留空继承。
 */
export default function MainLlmBlock({
  title = '主模型(LLM)',
  providers,
  config,
  onProviderChange,
  onBaseUrlChange,
  onModelChange,
  onThinkingLevelChange,
  onTemperatureChange,
  onMaxTokensChange,
  onApiKeySave,
  onApiKeySaved,
  testConnection,
  loadModels,
  inheritFrom = null,
}) {
  const [apiKey, setApiKey] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const cfg = config || {};
  const inherit = !!inheritFrom;
  const inheritLabel = inheritFrom?.label ?? '主模型';
  const inheritModel = inheritFrom?.model ?? '';

  const isLocal = cfg.provider && LOCAL_PROVIDERS.includes(cfg.provider);
  const needsBaseUrl = cfg.provider && NEEDS_BASE_URL_PROVIDERS.has(cfg.provider);
  const providerHint = cfg.provider ? (PROVIDER_HINTS[cfg.provider] || null) : null;
  const thinkingOptions = onThinkingLevelChange ? getProviderThinkingOptions(cfg.provider) : [];
  const isModelDrivenThinking = onThinkingLevelChange && thinkingOptions.length === 0
    && (cfg.provider === 'kimi' || cfg.provider === 'minimax');

  async function handleSaveKey() {
    if (!cfg.provider) {
      log.error('settings.main_llm.no_provider', null, { toast: '请先选择 Provider 再保存密钥' });
      return;
    }
    try {
      await onApiKeySave(cfg.provider, apiKey);
      setApiKey('');
      setApiKeySaved(true);
      onApiKeySaved?.();
      setTimeout(() => setApiKeySaved(false), 2000);
    } catch (e) {
      log.error('settings.main_llm.save_failed', e, { toast: `保存失败：${e.message}` });
    }
  }

  async function handleTestConnection() {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const result = await testConnection();
      setTestResult(result.success ? { success: true } : { success: false, error: result.error });
    } catch (e) {
      setTestResult({ success: false, error: e.message });
    } finally {
      setTestingConnection(false);
    }
  }

  const providerOptions = inherit
    ? [{ value: '', label: `未配置（使用${inheritLabel}）` }, ...providers]
    : providers;
  const providerHintText = inherit
    ? `用于写作页生成；未配置则回退${inheritLabel}（${inheritModel || '未配置'}）。`
    : undefined;

  const tempMin = inherit ? 0 : 0.1;
  const tempDefault = inherit ? 0 : 0.8;
  const tempValue = inherit
    ? (cfg.temperature ?? 0)
    : (cfg.temperature ?? tempDefault);
  const tempDisplay = inherit
    ? (cfg.temperature != null && cfg.temperature > 0 ? cfg.temperature.toFixed(1) : '继承')
    : (cfg.temperature ?? tempDefault).toFixed(1);

  return (
    <div className="we-settings-field-group">
      <p className="we-settings-subsection-title">{title}</p>

      <FormGroup label="Provider" hint={providerHintText} variant="settings">
        <Select
          value={cfg.provider || ''}
          onChange={onProviderChange}
          options={providerOptions}
        />
      </FormGroup>

      {cfg.provider && !isLocal && (
        <FormGroup label="API Key" variant="settings">
          <div className="we-settings-inline-field-row">
            <Input
              type="password"
              autoComplete="new-password"
              className="we-settings-inline-field-input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={cfg.has_key ? '••••••••（已配置，输入新密钥可覆盖）' : '输入后单独保存，不随其他配置提交'}
            />
            <Button variant="default" onClick={handleSaveKey}>
              {apiKeySaved ? '已保存' : '保存密钥'}
            </Button>
          </div>
        </FormGroup>
      )}

      {providerHint && (
        <div className="we-settings-provider-hint">
          {providerHint.summary && (
            <p className="we-settings-provider-hint-text">{providerHint.summary}</p>
          )}
          <div className={`we-settings-provider-link-row${providerHint.summary ? '' : ' we-settings-provider-link-row--compact'}`}>
            {providerHint.links.map((link) => (
              <Button
                key={link.url}
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')}
              >
                {link.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {needsBaseUrl && (
        <FormGroup label="Base URL" variant="settings">
          <Input
            value={cfg.base_url || ''}
            onChange={(e) => onBaseUrlChange(e.target.value)}
            placeholder={DEFAULT_BASE_URLS[cfg.provider] ?? 'https://your-api-endpoint/v1'}
          />
        </FormGroup>
      )}

      {cfg.provider && (
        <FormGroup label="模型" variant="settings">
          <ModelSelector
            key={cfg.provider + (cfg.base_url || '') + (cfg.has_key ? '1' : '0')}
            value={cfg.model || ''}
            onChange={onModelChange}
            loadModels={loadModels}
          />
        </FormGroup>
      )}

      {thinkingOptions.length > 0 && onThinkingLevelChange && (
        <FormGroup
          label="思考链级别"
          hint="auto = 不传参数，使用模型默认行为"
          variant="settings"
        >
          <Select
            value={cfg.thinking_level || ''}
            onChange={(v) => onThinkingLevelChange(v || null)}
            options={[
              { value: '', label: '自动（模型默认）' },
              ...thinkingOptions,
            ]}
          />
        </FormGroup>
      )}

      {isModelDrivenThinking && (
        <FormGroup label="思考链级别" hint="该 provider 由模型决定是否思考（如 kimi-k2-thinking / minimax-m2），无需也无法在请求中切换" variant="settings">
          <Input value="模型驱动" disabled readOnly />
        </FormGroup>
      )}

      {cfg.provider && testConnection && (
        <FormGroup label="连接测试" variant="settings">
          <div className="we-settings-action-row we-settings-action-row--spaced">
            <Button
              variant="default"
              onClick={handleTestConnection}
              disabled={testingConnection}
            >
              {testingConnection ? '测试中…' : '测试连接'}
            </Button>
            {testResult?.success && <span className="we-settings-status-ok">连接成功</span>}
            {testResult && !testResult.success && (
              <span className="we-settings-status-error">{`连接失败：${testResult.error}`}</span>
            )}
          </div>
        </FormGroup>
      )}

      {onTemperatureChange && (
        <div className="we-settings-inline-control-block">
          <div className="we-settings-range-head">
            <FieldLabel
              hint={inherit ? '拉到最左侧（0）则继承对话温度' : undefined}
              variant="settings"
            >
              {inherit ? '写作 Temperature' : 'Temperature'}
            </FieldLabel>
            <span className="we-settings-range-value">{tempDisplay}</span>
          </div>
          <Range
            min={tempMin}
            max="2.0"
            step="0.1"
            value={tempValue}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (inherit) {
                onTemperatureChange(v === 0 ? null : v);
              } else {
                onTemperatureChange(v);
              }
            }}
          />
        </div>
      )}

      {onMaxTokensChange && (
        <FormGroup
          label={inherit ? '写作 Max Tokens' : 'Max Tokens'}
          hint={inherit ? '留空则继承对话最大 Token' : undefined}
          variant="settings"
        >
          <Input
            type="number"
            min="64" max="32000" step="64"
            value={inherit ? (cfg.max_tokens ?? '') : (cfg.max_tokens ?? 4096)}
            placeholder={inherit ? '留空继承对话配置' : undefined}
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
    </div>
  );
}
