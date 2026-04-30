import { useState } from 'react';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import Range from '../ui/Range';
import ModelSelector from './ModelSelector';
import FormGroup from '../ui/FormGroup';
import FieldLabel from '../ui/FieldLabel';
import { LOCAL_PROVIDERS, NEEDS_BASE_URL_PROVIDERS, DEFAULT_BASE_URLS, PROVIDER_HINTS } from './SettingsConstants';
import { pushErrorToast } from '../../utils/toast';

/**
 * 写作主模型(LLM)配置区块
 * Provider / API Key / Base URL / Model / 连接测试 + Temperature / Max Tokens
 * Provider 留空则回退对话主模型；Temperature / Max Tokens 留空则继承对话配置
 */
export default function WritingLlmBlock({
  writingLlm,
  providers,
  onWritingLlmChange,
  onApiKeySave,
  loadModels,
  testConnection,
  chatModel,
}) {
  const [apiKey, setApiKey] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const config = writingLlm || {};
  const temperature = config.temperature ?? 0;

  async function handleSaveKey() {
    if (!config.provider) {
      pushErrorToast('请先选择 Provider 再保存密钥');
      return;
    }
    try {
      await onApiKeySave(config.provider, apiKey);
      setApiKey('');
      setApiKeySaved(true);
      onWritingLlmChange?.('has_key', true);
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
      <p className="we-settings-subsection-title">主模型(LLM)</p>

      <FormGroup label="Provider" hint={`用于写作页生成；未配置则回退对话主模型（${chatModel || '未配置'}）。`}>
        <Select
          value={config.provider || ''}
          onChange={(v) => onWritingLlmChange('provider', v)}
          options={[{ value: '', label: '未配置（使用对话主模型）' }, ...providers]}
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
            onChange={(e) => onWritingLlmChange('base_url', e.target.value)}
            placeholder={DEFAULT_BASE_URLS[config.provider] ?? 'https://your-api-endpoint/v1'}
          />
        </FormGroup>
      )}

      {config.provider && (
        <FormGroup label="模型">
          <ModelSelector
            key={config.provider + (config.base_url || '') + (config.has_key ? '1' : '0')}
            value={config.model || ''}
            onChange={(v) => onWritingLlmChange('model', v)}
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

      <div>
        <div className="we-settings-range-head">
          <FieldLabel hint="拉到最左侧（0）则继承对话温度">写作 Temperature</FieldLabel>
          <span className="we-settings-range-value">
            {config.temperature != null && config.temperature > 0 ? (config.temperature).toFixed(1) : '继承'}
          </span>
        </div>
        <Range
          min="0"
          max="2.0"
          step="0.1"
          value={temperature}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            onWritingLlmChange('temperature', v === 0 ? null : v);
          }}
        />
      </div>

      <FormGroup label="写作 Max Tokens" hint="留空则继承对话最大 Token">
        <Input
          type="number"
          min="64" max="32000" step="64"
          value={config.max_tokens ?? ''}
          placeholder="留空继承对话配置"
          onChange={(e) => onWritingLlmChange('max_tokens', e.target.value ? parseInt(e.target.value, 10) : null)}
        />
      </FormGroup>
    </div>
  );
}
