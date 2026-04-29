import { useState } from 'react';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import ModelSelector from './ModelSelector';
import FormGroup from '../ui/FormGroup';
import { LOCAL_PROVIDERS, NEEDS_BASE_URL_PROVIDERS, DEFAULT_BASE_URLS, PROVIDER_HINTS, getProviderThinkingOptions } from './SettingsConstants';
import { pushErrorToast } from '../../utils/toast';

export default function ProviderBlock({ title, providers, config, onProviderChange, onBaseUrlChange, onModelChange, onApiKeySave, onApiKeySaved, onThinkingLevelChange, loadModels }) {
  const [apiKey, setApiKey] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const thinkingOptions = onThinkingLevelChange ? getProviderThinkingOptions(config.provider) : [];
  const providerHint = PROVIDER_HINTS[config.provider] || null;

  async function handleSaveKey() {
    if (!config.provider) {
      pushErrorToast('请先选择 Provider 再保存密钥');
      return;
    }
    try {
      await onApiKeySave(config.provider, apiKey);
      setApiKey('');
      setApiKeySaved(true);
      onApiKeySaved?.();
      setTimeout(() => setApiKeySaved(false), 2000);
    } catch (e) {
      pushErrorToast(`保存失败：${e.message}`);
    }
  }

  const isLocal = LOCAL_PROVIDERS.includes(config.provider);
  const needsBaseUrl = NEEDS_BASE_URL_PROVIDERS.has(config.provider);

  return (
    <div className="we-settings-field-group">
      {title && <p className="we-settings-subsection-title">{title}</p>}

      <FormGroup label="Provider">
        <Select value={config.provider || ''} onChange={onProviderChange} options={providers} />
      </FormGroup>

      {config.provider && !isLocal && (
        <FormGroup label="API Key">
          <div style={{ display: 'flex', gap: '8px' }}>
            <Input
              type="password"
              autoComplete="new-password"
              style={{ flex: 1 }}
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
        <FormGroup label="Base URL">
          <Input
            value={config.base_url || ''}
            onChange={(e) => onBaseUrlChange(e.target.value)}
            placeholder={DEFAULT_BASE_URLS[config.provider] ?? 'https://your-api-endpoint/v1'}
          />
        </FormGroup>
      )}

      {config.provider && (
        <FormGroup label="模型">
          <ModelSelector
            key={config.provider + (config.base_url || '') + (config.has_key ? '1' : '0')}
            value={config.model || ''}
            onChange={onModelChange}
            loadModels={loadModels}
          />
        </FormGroup>
      )}

      {thinkingOptions.length > 0 && onThinkingLevelChange && (
        <FormGroup label="思考链级别" hint="auto = 不传参数，使用模型默认行为">
          <Select
            value={config.thinking_level || ''}
            onChange={(v) => onThinkingLevelChange(v || null)}
            options={[{ value: '', label: '自动（模型默认）' }, ...thinkingOptions]}
          />
        </FormGroup>
      )}
    </div>
  );
}
