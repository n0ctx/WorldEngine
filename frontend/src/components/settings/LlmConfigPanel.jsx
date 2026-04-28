import { useState } from 'react';
import {
  updateApiKey, updateEmbeddingApiKey,
  fetchModels, fetchEmbeddingModels,
  testConnection, testEmbeddingConnection,
} from '../../api/config';
import ProviderBlock from './ProviderBlock';
import WritingLlmBlock from './WritingLlmBlock';
import AuxLlmBlock from './AuxLlmBlock';
import AssistantModelBlock from './AssistantModelBlock';
import ModeSwitch from './ModeSwitch';
import FormGroup from '../ui/FormGroup';
import FieldLabel from '../ui/FieldLabel';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { LLM_PROVIDERS, EMBEDDING_PROVIDERS, SETTINGS_MODE } from './SettingsConstants';

export default function LlmConfigPanel({
  llm, embedding, onLlmChange, onEmbeddingChange,
  settingsMode, onModeChange,
  writingLlm, onWritingLlmChange,
  auxLlm, onAuxLlmChange, onAuxApiKeySave, fetchAuxModels, testAuxConnection,
  assistantModelSource, onAssistantModelSourceChange,
  proxyUrl, onProxyUrlSave,
}) {
  const [testStatus, setTestStatus] = useState('idle');
  const [testMsg, setTestMsg] = useState('');
  const [embedTestStatus, setEmbedTestStatus] = useState('idle');
  const [embedTestMsg, setEmbedTestMsg] = useState('');
  const [proxyInput, setProxyInput] = useState(proxyUrl ?? '');
  const [proxySaved, setProxySaved] = useState(false);

  async function handleTestConnection() {
    setTestStatus('testing');
    setTestMsg('');
    try {
      const result = await testConnection();
      if (result.success) {
        setTestStatus('ok');
        setTestMsg('连接成功');
      } else {
        setTestStatus('error');
        setTestMsg(result.error || '连接失败');
      }
    } catch (e) {
      setTestStatus('error');
      setTestMsg(e.message);
    }
    setTimeout(() => setTestStatus('idle'), 4000);
  }

  async function handleTestEmbedding() {
    setEmbedTestStatus('testing');
    setEmbedTestMsg('');
    try {
      const result = await testEmbeddingConnection();
      if (result.success) {
        setEmbedTestStatus('ok');
        setEmbedTestMsg(`连接成功（${result.dimensions} 维）`);
      } else {
        setEmbedTestStatus('error');
        setEmbedTestMsg(result.error || '连接失败');
      }
    } catch (e) {
      setEmbedTestStatus('error');
      setEmbedTestMsg(e.message);
    }
    setTimeout(() => setEmbedTestStatus('idle'), 5000);
  }

  return (
    <div>
      <h2 className="we-settings-section-title">LLM 配置</h2>
      <ModeSwitch mode={settingsMode} onChange={onModeChange} />

      {/* 主模型区块：按 settingsMode 分支渲染 */}
      {settingsMode === SETTINGS_MODE.WRITING ? (
        <WritingLlmBlock writingLlm={writingLlm} onWritingLlmChange={onWritingLlmChange} chatModel={llm.model} />
      ) : (
        <div className="we-settings-field-group">
          <ProviderBlock
            title="语言模型（LLM）"
            providers={LLM_PROVIDERS}
            config={llm}
            onProviderChange={(v) => onLlmChange('provider', v)}
            onBaseUrlChange={(v) => onLlmChange('base_url', v)}
            onModelChange={(v) => onLlmChange('model', v)}
            onApiKeySave={updateApiKey}
            onApiKeySaved={() => onLlmChange('has_key', true)}
            onThinkingLevelChange={(v) => onLlmChange('thinking_level', v)}
            loadModels={fetchModels}
          />

          <div className="we-settings-field-group">
            <div>
              <div className="we-settings-range-head">
                <FieldLabel>Temperature</FieldLabel>
                <span className="we-settings-range-value">
                  {(llm.temperature ?? 0.8).toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                className="we-range"
                min="0.1" max="2.0" step="0.1"
                value={llm.temperature ?? 0.8}
                onChange={(e) => onLlmChange('temperature', parseFloat(e.target.value))}
                style={{ '--range-pct': `${((llm.temperature ?? 0.8) - 0.1) / (2.0 - 0.1) * 100}%` }}
              />
            </div>

            <FormGroup label="Max Tokens">
              <Input
                type="number"
                min="64" max="32000" step="64"
                value={llm.max_tokens ?? 4096}
                onChange={(e) => onLlmChange('max_tokens', parseInt(e.target.value, 10))}
              />
            </FormGroup>

            <div className="we-settings-action-row we-settings-action-row--spaced">
              <Button variant="default" onClick={handleTestConnection} disabled={testStatus === 'testing'}>
                {testStatus === 'testing' ? '测试中…' : '测试连接'}
              </Button>
              {testStatus === 'ok' && <span className="we-settings-status-ok">{testMsg}</span>}
              {testStatus === 'error' && <span className="we-settings-status-error">{testMsg}</span>}
            </div>
          </div>
        </div>
      )}

      {/* 副模型、助手、embedding、网络代理区块：两个 tab 共享 */}
      <hr className="we-settings-divider" />

      <AuxLlmBlock
        providers={LLM_PROVIDERS}
        config={auxLlm}
        onProviderChange={(v) => onAuxLlmChange('provider', v)}
        onBaseUrlChange={(v) => onAuxLlmChange('base_url', v)}
        onModelChange={(v) => onAuxLlmChange('model', v)}
        onApiKeySave={onAuxApiKeySave}
        onApiKeySaved={() => onAuxLlmChange('has_key', true)}
        testConnection={testAuxConnection}
        loadModels={fetchAuxModels}
      />

      <hr className="we-settings-divider" />

      <AssistantModelBlock
        modelSource={assistantModelSource}
        onModelSourceChange={onAssistantModelSourceChange}
      />

      <hr className="we-settings-divider" />

      <ProviderBlock
        title="Embedding 模型"
        providers={EMBEDDING_PROVIDERS}
        config={embedding}
        onProviderChange={(v) => onEmbeddingChange('provider', v || null)}
        onBaseUrlChange={(v) => onEmbeddingChange('base_url', v)}
        onModelChange={(v) => onEmbeddingChange('model', v)}
        onApiKeySave={updateEmbeddingApiKey}
        onApiKeySaved={() => onEmbeddingChange('has_key', true)}
        loadModels={fetchEmbeddingModels}
      />

      {embedding.provider && (
        <div className="we-settings-field-group">
          <div className="we-settings-action-row">
            <Button variant="default" onClick={handleTestEmbedding} disabled={embedTestStatus === 'testing'}>
              {embedTestStatus === 'testing' ? '测试中…' : '测试 Embedding'}
            </Button>
            {embedTestStatus === 'ok' && <span className="we-settings-status-ok">{embedTestMsg}</span>}
            {embedTestStatus === 'error' && <span className="we-settings-status-error">{embedTestMsg}</span>}
          </div>
        </div>
      )}

      <hr className="we-settings-divider" />

      <div className="we-settings-field-group">
        <p className="we-settings-subsection-title">网络代理</p>
        <FormGroup label="HTTP 代理地址" hint="仅对 LLM / Embedding 网络请求生效，留空不使用代理。支持 http:// 和 socks5:// 协议，修改后立即生效。">
          <div className="we-settings-proxy-row">
            <Input
              className="we-settings-proxy-input"
              value={proxyInput}
              onChange={(e) => { setProxyInput(e.target.value); setProxySaved(false); }}
              placeholder="http://127.0.0.1:7890"
            />
            <Button
              variant="default"
              onClick={async () => {
                await onProxyUrlSave(proxyInput.trim());
                setProxySaved(true);
                setTimeout(() => setProxySaved(false), 2000);
              }}
            >
              {proxySaved ? '已应用' : '应用'}
            </Button>
          </div>
        </FormGroup>
      </div>

    </div>
  );
}
