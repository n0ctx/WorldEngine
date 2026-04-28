import { useState } from 'react';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import ModelSelector from './ModelSelector';
import FormGroup from '../ui/FormGroup';
import { LOCAL_PROVIDERS, NEEDS_BASE_URL_PROVIDERS, DEFAULT_BASE_URLS, PROVIDER_HINTS, getProviderThinkingOptions } from './SettingsConstants';
import { pushErrorToast } from '../../utils/toast';

/**
 * 副模型(LLM)配置区块
 * 仅显示 provider / API Key / base_url / model / 测试连接按钮
 * 不显示 temperature / max_tokens / thinking_level
 */
export default function AuxLlmBlock({ providers, config, onProviderChange, onBaseUrlChange, onModelChange, onApiKeySave, onApiKeySaved, testConnection, loadModels }) {
  const [apiKey, setApiKey] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null);

  async function handleSaveKey() {
    try {
      await onApiKeySave(apiKey);
      setApiKey('');
      setApiKeySaved(true);
      onApiKeySaved?.();
      setTimeout(() => setApiKeySaved(false), 2000);
    } catch (e) {
      pushErrorToast(`保存失败：${e.message}`);
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

  const isLocal = config.provider && LOCAL_PROVIDERS.includes(config.provider);
  const needsBaseUrl = config.provider && NEEDS_BASE_URL_PROVIDERS.has(config.provider);
  const providerHint = config.provider ? (PROVIDER_HINTS[config.provider] || null) : null;

  return (
    <div className="we-settings-field-group">
      <p className="we-settings-subsection-title">副模型(LLM)</p>

      <FormGroup label="Provider" hint="用于摘要、状态栏、记忆展开、日记、标题等后台任务；未配置则回退主模型。">
        <Select
          value={config.provider || ''}
          onChange={onProviderChange}
          options={[{ value: '', label: '未配置（使用主模型）' }, ...providers]}
        />
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

      {config.provider && (
        <FormGroup label="连接测试">
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
    </div>
  );
}
