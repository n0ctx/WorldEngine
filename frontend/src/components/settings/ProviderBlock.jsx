import { useState } from 'react';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import ModelSelector from './ModelSelector';
import FieldLabel from './FieldLabel';
import { LOCAL_PROVIDERS, NEEDS_BASE_URL_PROVIDERS, getProviderThinkingOptions } from './_settingsConstants';

export default function ProviderBlock({ title, providers, config, onProviderChange, onBaseUrlChange, onModelChange, onApiKeySave, onApiKeySaved, onThinkingLevelChange, loadModels }) {
  const [apiKey, setApiKey] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const thinkingOptions = onThinkingLevelChange ? getProviderThinkingOptions(config.provider) : [];

  async function handleSaveKey() {
    try {
      await onApiKeySave(apiKey);
      setApiKey('');
      setApiKeySaved(true);
      onApiKeySaved?.();
      setTimeout(() => setApiKeySaved(false), 2000);
    } catch (e) {
      alert(`保存失败：${e.message}`);
    }
  }

  const isLocal = LOCAL_PROVIDERS.includes(config.provider);
  const needsBaseUrl = NEEDS_BASE_URL_PROVIDERS.has(config.provider);

  return (
    <div className="we-settings-field-group">
      {title && <p className="we-settings-subsection-title">{title}</p>}

      <div className="we-edit-form-group">
        <FieldLabel>Provider</FieldLabel>
        <Select value={config.provider || ''} onChange={onProviderChange} options={providers} />
      </div>

      {config.provider && !isLocal && (
        <div className="we-edit-form-group">
          <FieldLabel>API Key</FieldLabel>
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
        </div>
      )}

      {needsBaseUrl && (
        <div className="we-edit-form-group">
          <FieldLabel>Base URL</FieldLabel>
          <Input
            value={config.base_url || ''}
            onChange={(e) => onBaseUrlChange(e.target.value)}
            placeholder={
              config.provider === 'ollama' ? 'http://localhost:11434'
                : config.provider === 'lmstudio' ? 'http://localhost:1234'
                : 'https://your-api-endpoint/v1'
            }
          />
        </div>
      )}

      {config.provider && (
        <div className="we-edit-form-group">
          <FieldLabel>模型</FieldLabel>
          <ModelSelector
            key={config.provider + (config.base_url || '') + (config.has_key ? '1' : '0')}
            value={config.model || ''}
            onChange={onModelChange}
            loadModels={loadModels}
          />
        </div>
      )}

      {thinkingOptions.length > 0 && onThinkingLevelChange && (
        <div className="we-edit-form-group">
          <FieldLabel hint="auto = 不传参数，使用模型默认行为">思考链级别</FieldLabel>
          <Select
            value={config.thinking_level || ''}
            onChange={(v) => onThinkingLevelChange(v || null)}
            options={[{ value: '', label: '自动（模型默认）' }, ...thinkingOptions]}
          />
        </div>
      )}
    </div>
  );
}
