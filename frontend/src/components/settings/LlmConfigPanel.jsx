import { useState } from 'react';
import {
  updateProviderKey,
  fetchModels, fetchEmbeddingModels,
  testConnection, testEmbeddingConnection,
} from '../../core/api/config';
import ProviderBlock from './ProviderBlock';
import MainLlmBlock from './MainLlmBlock';
import AuxLlmBlock from './AuxLlmBlock';
import AssistantModelBlock from './AssistantModelBlock';
import FormGroup from '../ui/FormGroup';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { LLM_PROVIDERS, EMBEDDING_PROVIDERS, SETTINGS_MODE } from '../../core/constants/settings';

export default function LlmConfigPanel({
  llm, embedding, onLlmChange, onEmbeddingChange,
  settingsMode,
  writingLlm, onWritingLlmChange, onWritingApiKeySave, fetchWritingModels, testWritingConnection,
  auxLlm, onAuxLlmChange, onAuxApiKeySave, fetchAuxModels, testAuxConnection,
  writingAuxLlm, onWritingAuxLlmChange, onWritingAuxApiKeySave, fetchWritingAuxModels, testWritingAuxConnection,
  assistantModelSource, onAssistantModelSourceChange,
  proxyUrl, onProxyUrlSave,
}) {
  const [embedTestStatus, setEmbedTestStatus] = useState('idle');
  const [embedTestMsg, setEmbedTestMsg] = useState('');
  const [proxyInput, setProxyInput] = useState(proxyUrl ?? '');
  const [proxySaved, setProxySaved] = useState(false);

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
    <div className="we-settings-llm-panel">
      <h2 className="we-settings-section-title">LLM 配置</h2>

      {/* 主模型区块：对话/写作共用 MainLlmBlock，inheritFrom 切换继承语义 */}
      {settingsMode === SETTINGS_MODE.WRITING ? (
        <MainLlmBlock
          title="主模型(LLM)"
          providers={LLM_PROVIDERS}
          config={writingLlm}
          onProviderChange={(v) => onWritingLlmChange('provider', v)}
          onBaseUrlChange={(v) => onWritingLlmChange('base_url', v)}
          onModelChange={(v) => onWritingLlmChange('model', v)}
          onThinkingLevelChange={(v) => onWritingLlmChange('thinking_level', v)}
          onTemperatureChange={(v) => onWritingLlmChange('temperature', v)}
          onMaxTokensChange={(v) => onWritingLlmChange('max_tokens', v)}
          onApiKeySave={onWritingApiKeySave}
          onApiKeySaved={() => onWritingLlmChange('has_key', true)}
          testConnection={testWritingConnection}
          loadModels={fetchWritingModels}
          inheritFrom={{ label: '对话主模型', model: llm.model }}
        />
      ) : (
        <MainLlmBlock
          title="主模型（LLM）"
          providers={LLM_PROVIDERS}
          config={llm}
          onProviderChange={(v) => onLlmChange('provider', v)}
          onBaseUrlChange={(v) => onLlmChange('base_url', v)}
          onModelChange={(v) => onLlmChange('model', v)}
          onThinkingLevelChange={(v) => onLlmChange('thinking_level', v)}
          onTemperatureChange={(v) => onLlmChange('temperature', v)}
          onMaxTokensChange={(v) => onLlmChange('max_tokens', v)}
          onApiKeySave={updateProviderKey}
          onApiKeySaved={() => onLlmChange('has_key', true)}
          testConnection={testConnection}
          loadModels={fetchModels}
        />
      )}

      {/* 副模型按 settingsMode 分别渲染（写作 tab 与对话 tab 各自独立配置） */}
      <hr className="we-settings-divider" />

      {settingsMode === SETTINGS_MODE.WRITING ? (
        <AuxLlmBlock
          providers={LLM_PROVIDERS}
          config={writingAuxLlm}
          onProviderChange={(v) => onWritingAuxLlmChange('provider', v)}
          onBaseUrlChange={(v) => onWritingAuxLlmChange('base_url', v)}
          onModelChange={(v) => onWritingAuxLlmChange('model', v)}
          onThinkingLevelChange={(v) => onWritingAuxLlmChange('thinking_level', v)}
          onApiKeySave={onWritingAuxApiKeySave}
          onApiKeySaved={() => onWritingAuxLlmChange('has_key', true)}
          testConnection={testWritingAuxConnection}
          loadModels={fetchWritingAuxModels}
          fallbackHint="使用对话副模型"
        />
      ) : (
        <AuxLlmBlock
          providers={LLM_PROVIDERS}
          config={auxLlm}
          onProviderChange={(v) => onAuxLlmChange('provider', v)}
          onBaseUrlChange={(v) => onAuxLlmChange('base_url', v)}
          onModelChange={(v) => onAuxLlmChange('model', v)}
          onThinkingLevelChange={(v) => onAuxLlmChange('thinking_level', v)}
          onApiKeySave={onAuxApiKeySave}
          onApiKeySaved={() => onAuxLlmChange('has_key', true)}
          testConnection={testAuxConnection}
          loadModels={fetchAuxModels}
        />
      )}

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
        onApiKeySave={updateProviderKey}
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
        <FormGroup label="HTTP 代理地址" hint="仅对 LLM / Embedding 网络请求生效，留空不使用代理。支持 http:// 和 socks5:// 协议，修改后立即生效。" variant="settings">
          <div className="we-settings-inline-field-row">
            <Input
              className="we-settings-inline-field-input"
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
