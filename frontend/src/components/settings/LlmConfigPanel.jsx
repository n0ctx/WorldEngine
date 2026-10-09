import { useState } from 'react';
import { updateProviderKey, fetchModels, testConnection } from '../../core/api/config';
import MainLlmBlock from './MainLlmBlock';
import AuxLlmBlock from './AuxLlmBlock';
import AssistantModelBlock from './AssistantModelBlock';
import FormGroup from '../ui/FormGroup';
import Divider from '../ui/Divider';
import SectionTitle from '../ui/SectionTitle';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { LLM_PROVIDERS, SETTINGS_MODE } from '../../core/constants/settings';

export default function LlmConfigPanel({
  llm, onLlmChange,
  settingsMode,
  writingLlm, onWritingLlmChange, onWritingApiKeySave, fetchWritingModels, testWritingConnection,
  auxLlm, onAuxLlmChange, onAuxApiKeySave, fetchAuxModels, testAuxConnection,
  writingAuxLlm, onWritingAuxLlmChange, onWritingAuxApiKeySave, fetchWritingAuxModels, testWritingAuxConnection,
  assistantModelSource, onAssistantModelSourceChange,
  proxyUrl, onProxyUrlSave,
}) {
  const [proxyInput, setProxyInput] = useState(proxyUrl ?? '');
  const [proxySaved, setProxySaved] = useState(false);

  return (
    <div className="we-settings-llm-panel">
      <SectionTitle level="section" rule="under" as="h2">模型</SectionTitle>

      {/* 主模型区块：对话/写作共用 MainLlmBlock，inheritFrom 切换继承语义 */}
      {settingsMode === SETTINGS_MODE.WRITING ? (
        <MainLlmBlock
          title="主模型"
          providers={LLM_PROVIDERS}
          config={writingLlm}
          onProviderChange={(v) => onWritingLlmChange('provider', v)}
          onBaseUrlChange={(v) => onWritingLlmChange('base_url', v)}
          onModelChange={(v) => onWritingLlmChange('model', v)}
          onThinkingLevelChange={(v) => onWritingLlmChange('thinking_level', v)}
          onTemperatureChange={(v) => onWritingLlmChange('temperature', v)}
          onMaxTokensChange={(v) => onWritingLlmChange('max_tokens', v)}
          onSamplingChange={(v) => onWritingLlmChange('sampling', v)}
          onApiKeySave={onWritingApiKeySave}
          onApiKeySaved={() => onWritingLlmChange('has_key', true)}
          testConnection={testWritingConnection}
          loadModels={fetchWritingModels}
          inheritFrom={{ label: '对话主模型', model: llm.model }}
        />
      ) : (
        <MainLlmBlock
          title="主模型"
          providers={LLM_PROVIDERS}
          config={llm}
          onProviderChange={(v) => onLlmChange('provider', v)}
          onBaseUrlChange={(v) => onLlmChange('base_url', v)}
          onModelChange={(v) => onLlmChange('model', v)}
          onThinkingLevelChange={(v) => onLlmChange('thinking_level', v)}
          onTemperatureChange={(v) => onLlmChange('temperature', v)}
          onMaxTokensChange={(v) => onLlmChange('max_tokens', v)}
          onSamplingChange={(v) => onLlmChange('sampling', v)}
          onApiKeySave={updateProviderKey}
          onApiKeySaved={() => onLlmChange('has_key', true)}
          testConnection={testConnection}
          loadModels={fetchModels}
        />
      )}

      {/* 副模型按 settingsMode 分别渲染（写作 tab 与对话 tab 各自独立配置） */}
      <Divider size="lg" />

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

      <Divider size="lg" />

      <AssistantModelBlock
        modelSource={assistantModelSource}
        onModelSourceChange={onAssistantModelSourceChange}
      />

      <Divider size="lg" />

      <div className="we-settings-field-group">
        <SectionTitle level="group" as="p">网络代理</SectionTitle>
        <FormGroup label="HTTP 代理地址" hint="仅对 LLM 网络请求生效，留空不使用代理。支持 http:// 和 socks5:// 协议，修改后立即生效。" variant="settings">
          <div className="we-settings-inline-field-row">
            <Input
              className="we-settings-inline-field-input"
              value={proxyInput}
              onChange={(e) => { setProxyInput(e.target.value); setProxySaved(false); }}
              placeholder="http://127.0.0.1:7890"
            />
            <Button
              variant="secondary"
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
