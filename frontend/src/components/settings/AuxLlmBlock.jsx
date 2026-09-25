import { useState } from 'react';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import ModelSelector from './ModelSelector';
import FormGroup from '../ui/FormGroup';
import LlmConnectionTest from './LlmConnectionTest';
import { DEFAULT_BASE_URLS, getProviderDisplaySettings } from '../../core/constants/settings';
import { log } from '../../core/utils/logger.js';

/**
 * 副模型(LLM)配置区块
 * 显示 provider / API Key / base_url / model / thinking_level / 测试连接按钮
 * 不显示 temperature / max_tokens
 */
export default function AuxLlmBlock({ providers, config, onProviderChange, onBaseUrlChange, onModelChange, onThinkingLevelChange, onApiKeySave, onApiKeySaved, testConnection, loadModels, fallbackHint = '未配置则回退主模型' }) {
  const [apiKey, setApiKey] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState(false);

  async function handleSaveKey() {
    if (!config.provider) {
      log.error('settings.aux_llm.no_provider', null, { toast: '请先选择 Provider 再保存密钥' });
      return;
    }
    try {
      await onApiKeySave(config.provider, apiKey);
      setApiKey('');
      setApiKeySaved(true);
      onApiKeySaved?.();
      setTimeout(() => setApiKeySaved(false), 2000);
    } catch (e) {
      log.error('settings.aux_llm.save_failed', e, { toast: `保存失败：${e.message}` });
    }
  }

  const { isLocal, needsBaseUrl, providerHint, thinkingOptions, isModelDrivenThinking } =
    getProviderDisplaySettings(config.provider, onThinkingLevelChange);

  return (
    <div className="we-settings-field-group">
      <p className="we-settings-subsection-title">副模型(LLM)</p>

      <FormGroup label="Provider" hint={`用于摘要、状态栏、记忆展开、日记、标题等后台任务；${fallbackHint}。`} variant="settings">
        <Select
          value={config.provider || ''}
          onChange={onProviderChange}
          options={[{ value: '', label: `未配置（${fallbackHint}）` }, ...providers]}
        />
      </FormGroup>

      {config.provider && !isLocal && (
        <FormGroup label="API Key" variant="settings">
          <div className="we-settings-inline-field-row">
            <Input
              type="password"
              autoComplete="new-password"
              className="we-settings-inline-field-input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={config.has_key ? '••••••••（已配置，输入新密钥可覆盖）' : '输入后单独保存，不随其他配置提交'}
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
            value={config.base_url || ''}
            onChange={(e) => onBaseUrlChange(e.target.value)}
            placeholder={DEFAULT_BASE_URLS[config.provider] ?? 'https://your-api-endpoint/v1'}
          />
        </FormGroup>
      )}

      {config.provider && (
        <FormGroup label="模型" variant="settings">
          <ModelSelector
            key={config.provider + (config.base_url || '') + (config.has_key ? '1' : '0')}
            value={config.model || ''}
            onChange={onModelChange}
            loadModels={loadModels}
          />
        </FormGroup>
      )}

      {thinkingOptions.length > 0 && onThinkingLevelChange && (
        <FormGroup label="思考链级别" hint="auto = 不传参数，使用模型默认行为" variant="settings">
          <Select
            value={config.thinking_level || ''}
            onChange={(v) => onThinkingLevelChange(v || null)}
            options={[{ value: '', label: '自动（模型默认）' }, ...thinkingOptions]}
          />
        </FormGroup>
      )}

      {isModelDrivenThinking && (
        <FormGroup label="思考链级别" hint="该 provider 由模型决定是否思考（如 kimi-k2-thinking / minimax-m2），无需也无法在请求中切换" variant="settings">
          <Input value="模型驱动" disabled readOnly />
        </FormGroup>
      )}

      <LlmConnectionTest provider={config.provider} testConnection={testConnection} />
    </div>
  );
}
