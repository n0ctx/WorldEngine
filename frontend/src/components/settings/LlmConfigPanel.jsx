import { useState } from 'react';
import {
  updateApiKey, updateEmbeddingApiKey,
  fetchModels, fetchEmbeddingModels,
  testConnection, testEmbeddingConnection,
} from '../../api/config';
import ProviderBlock from './ProviderBlock';
import WritingLlmBlock from './WritingLlmBlock';
import ModeSwitch from './ModeSwitch';
import FieldLabel from './FieldLabel';
import ToggleSwitch from '../ui/ToggleSwitch';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { LLM_PROVIDERS, EMBEDDING_PROVIDERS } from './_settingsConstants';

export default function LlmConfigPanel({
  llm, embedding, onLlmChange, onEmbeddingChange,
  settingsMode, onModeChange,
  writingLlm, onWritingLlmChange,
  proxyUrl, onProxyUrlSave,
  showThinking, onToggleShowThinking,
  autoCollapseThinking, onToggleAutoCollapseThinking,
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

      {settingsMode === 'writing' ? (
        <WritingLlmBlock writingLlm={writingLlm} onWritingLlmChange={onWritingLlmChange} chatModel={llm.model} />
      ) : (
        <>
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
            <div className="we-edit-form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <FieldLabel>Temperature</FieldLabel>
                <span style={{ fontFamily: 'var(--we-font-serif)', fontSize: '14px', color: 'var(--we-ink-primary)' }}>
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

            <div className="we-edit-form-group">
              <FieldLabel>Max Tokens</FieldLabel>
              <Input
                type="number"
                min="64" max="32000" step="64"
                value={llm.max_tokens ?? 4096}
                onChange={(e) => onLlmChange('max_tokens', parseInt(e.target.value, 10))}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
              <Button variant="default" onClick={handleTestConnection} disabled={testStatus === 'testing'}>
                {testStatus === 'testing' ? '测试中…' : '测试连接'}
              </Button>
              {testStatus === 'ok' && <span style={{ fontSize: '13px', color: 'var(--we-moss)' }}>{testMsg}</span>}
              {testStatus === 'error' && <span style={{ fontSize: '13px', color: 'var(--we-vermilion)' }}>{testMsg}</span>}
            </div>
          </div>

          <hr className="we-settings-divider" />

          <div className="we-settings-field-group">
            <p className="we-settings-subsection-title">网络代理</p>
            <div className="we-edit-form-group">
              <FieldLabel hint="仅对 LLM / Embedding 网络请求生效，留空不使用代理">HTTP 代理地址</FieldLabel>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Input
                  style={{ flex: 1 }}
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
              <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '12px', color: 'var(--we-ink-faded)', fontStyle: 'italic', margin: '6px 0 0' }}>
                支持 http:// 和 socks5:// 协议。修改后立即生效，无需重启服务。
              </p>
            </div>
          </div>

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
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Button variant="default" onClick={handleTestEmbedding} disabled={embedTestStatus === 'testing'}>
                  {embedTestStatus === 'testing' ? '测试中…' : '测试 Embedding'}
                </Button>
                {embedTestStatus === 'ok' && <span style={{ fontSize: '13px', color: 'var(--we-moss)' }}>{embedTestMsg}</span>}
                {embedTestStatus === 'error' && <span style={{ fontSize: '13px', color: 'var(--we-vermilion)' }}>{embedTestMsg}</span>}
              </div>
            </div>
          )}
        </>
      )}

      {/* 思考链设置：对话/写作空间共用，始终可见 */}
      <hr className="we-settings-divider" />
      <div className="we-settings-field-group">
        <p className="we-settings-subsection-title">思考链设置</p>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '16px' }}>
          <div>
            <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '14px', color: 'var(--we-ink-primary)', margin: '0 0 4px' }}>
              渲染思考链
            </p>
            <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '12px', color: 'var(--we-ink-faded)', fontStyle: 'italic', margin: 0 }}>
              显示 &lt;think&gt; 标签内容（可折叠），对话与写作空间均生效；关闭则完全屏蔽
            </p>
          </div>
          <ToggleSwitch checked={showThinking} onChange={onToggleShowThinking} />
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '14px', color: 'var(--we-ink-primary)', margin: '0 0 4px' }}>
              自动折叠
            </p>
            <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '12px', color: 'var(--we-ink-faded)', fontStyle: 'italic', margin: 0 }}>
              思考完成后默认折叠；关闭则默认展开
            </p>
          </div>
          <ToggleSwitch checked={autoCollapseThinking} onChange={onToggleAutoCollapseThinking} />
        </div>
      </div>
    </div>
  );
}
