import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  getConfig, updateConfig, updateApiKey, updateEmbeddingApiKey,
  fetchModels, fetchEmbeddingModels, testConnection,
} from '../api/config';
import { useDisplaySettingsStore } from '../store/displaySettings';
import { downloadGlobalSettings, importGlobalSettings, readJsonFile } from '../api/importExport';
import { refreshCustomCss } from '../api/customCssSnippets';
import { useAppModeStore } from '../store/appMode';
import { invalidateCache, loadRules } from '../utils/regex-runner';
import EntryList from '../components/prompt/EntryList';
import CustomCssManager from '../components/settings/CustomCssManager';
import RegexRulesManager from '../components/settings/RegexRulesManager';
import MarkdownEditor from '../components/ui/MarkdownEditor';
import ModelCombobox from '../components/ui/ModelCombobox';
import Select from '../components/ui/Select';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

const LLM_PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'grok', label: 'Grok (xAI)' },
  { value: 'siliconflow', label: 'SiliconFlow' },
  { value: 'glm', label: 'GLM (智谱)' },
  { value: 'kimi', label: 'Kimi (月之暗面)' },
  { value: 'minimax', label: 'MiniMax' },
  { value: 'ollama', label: 'Ollama（本地）' },
  { value: 'lmstudio', label: 'LM Studio（本地）' },
];

const EMBEDDING_PROVIDERS = [
  { value: '', label: '不启用' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'openai_compatible', label: 'OpenAI Compatible' },
  { value: 'ollama', label: 'Ollama（本地）' },
];

const LOCAL_PROVIDERS = ['ollama', 'lmstudio'];
const NEEDS_BASE_URL_PROVIDERS = new Set([...LOCAL_PROVIDERS, 'openai_compatible']);

/** 按 provider 静态返回 thinking 级别选项，不依赖模型列表加载 */
function getProviderThinkingOptions(provider) {
  switch (provider) {
    case 'anthropic':
    case 'gemini':
      return [
        { value: 'budget_low', label: '思考：低（1024 tokens）' },
        { value: 'budget_medium', label: '思考：中（8192 tokens）' },
        { value: 'budget_high', label: '思考：高（16384 tokens）' },
      ];
    case 'openai':
      return [
        { value: 'effort_low', label: '推理：低（仅 o-series）' },
        { value: 'effort_medium', label: '推理：中（仅 o-series）' },
        { value: 'effort_high', label: '推理：高（仅 o-series）' },
      ];
    default:
      return [];
  }
}

const NAV_SECTIONS = [
  { key: 'llm', label: 'LLM 配置' },
  { key: 'prompt', label: '全局 Prompt' },
  { key: 'css', label: '自定义 CSS' },
  { key: 'regex', label: '正则规则' },
  { key: 'import_export', label: '导入导出' },
  { key: 'about', label: '关于' },
];

function ModeSwitch({ mode, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '3px', marginBottom: '20px', background: 'var(--we-paper-aged)', borderRadius: '6px', padding: '3px', width: 'fit-content' }}>
      {[{ key: 'chat', label: '对话' }, { key: 'writing', label: '写作' }].map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          style={{
            padding: '4px 20px', fontSize: '13px', borderRadius: '4px', border: 'none', cursor: 'pointer',
            background: mode === key ? 'var(--we-paper-base)' : 'transparent',
            color: mode === key ? 'var(--we-ink-primary)' : 'var(--we-ink-faded)',
            fontFamily: 'var(--we-font-serif)',
            boxShadow: mode === key ? '0 0 0 1px var(--we-paper-shadow)' : 'none',
            transition: 'all 0.15s',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function FieldLabel({ children, hint }) {
  return (
    <label className="we-edit-label">
      {children}
      {hint && <span className="we-edit-label-hint">{hint}</span>}
    </label>
  );
}

function ModelSelector({ value, onChange, loadModels }) {
  const [models, setModels] = useState([]);
  const [status, setStatus] = useState('idle');
  const [errMsg, setErrMsg] = useState('');

  async function load() {
    setStatus('loading');
    setErrMsg('');
    try {
      const data = await loadModels();
      const list = data.models || [];
      setModels(list);
      setStatus('ok');
      if (list.length > 0 && !value) onChange(list[0]);
    } catch (e) {
      setErrMsg(e.message || '无法获取模型列表，请检查 API Key 和网络连接');
      setStatus('error');
    }
  }

  useEffect(() => { load(); }, []);

  if (status === 'loading') {
    return <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '13px', color: 'var(--we-ink-faded)' }}>获取模型列表中…</p>;
  }
  if (status === 'error') {
    return (
      <div>
        <p style={{ fontSize: '13px', color: 'var(--we-vermilion)', marginBottom: '6px' }}>{errMsg}</p>
        <Button variant="ghost" size="sm" onClick={load}>重试</Button>
      </div>
    );
  }
  return (
    <ModelCombobox
      value={value}
      onChange={onChange}
      options={models}
      placeholder="输入或选择模型名称"
    />
  );
}

function ProviderBlock({ title, providers, config, onProviderChange, onBaseUrlChange, onModelChange, onApiKeySave, onApiKeySaved, onThinkingLevelChange, loadModels }) {
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
            options={[
              { value: '', label: '自动（模型默认）' },
              ...thinkingOptions,
            ]}
          />
        </div>
      )}
    </div>
  );
}

function WritingLlmBlock({ writingLlm, onWritingLlmChange, chatModel }) {
  return (
    <div className="we-settings-field-group">
      <p className="we-settings-subsection-title">写作空间 LLM 覆盖</p>
      <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '12px', color: 'var(--we-ink-faded)', fontStyle: 'italic', margin: '0 0 12px' }}>
        Provider / API Key / Base URL 与对话空间共享。留空或为 null 则继承对话空间的值。
      </p>
      <div className="we-edit-form-group">
        <FieldLabel hint={`对话模型：${chatModel || '(未配置)'}`}>写作模型</FieldLabel>
        <ModelCombobox
          value={writingLlm.model || ''}
          onChange={(v) => onWritingLlmChange('model', v)}
          options={[]}
          placeholder={`留空则使用对话模型（${chatModel || '未配置'}）`}
        />
      </div>
      <div className="we-edit-form-group">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <FieldLabel hint="null 则继承对话温度">写作 Temperature</FieldLabel>
          <span style={{ fontFamily: 'var(--we-font-serif)', fontSize: '14px', color: 'var(--we-ink-primary)' }}>
            {writingLlm.temperature != null ? (writingLlm.temperature).toFixed(1) : '继承'}
          </span>
        </div>
        <input
          type="range"
          className="we-range"
          min="0" max="2.0" step="0.1"
          value={writingLlm.temperature ?? 0}
          onChange={(e) => onWritingLlmChange('temperature', parseFloat(e.target.value))}
          style={{ '--range-pct': `${((writingLlm.temperature ?? 0) / 2.0) * 100}%` }}
        />
        <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
          <Button variant="ghost" size="sm" onClick={() => onWritingLlmChange('temperature', null)}>继承</Button>
        </div>
      </div>
      <div className="we-edit-form-group">
        <FieldLabel hint="null 则继承对话最大 Token">写作 Max Tokens</FieldLabel>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Input
            type="number"
            min="64" max="32000" step="64"
            value={writingLlm.max_tokens ?? ''}
            placeholder="留空继承对话配置"
            onChange={(e) => onWritingLlmChange('max_tokens', e.target.value ? parseInt(e.target.value, 10) : null)}
            style={{ flex: 1 }}
          />
          <Button variant="ghost" size="sm" onClick={() => onWritingLlmChange('max_tokens', null)}>继承</Button>
        </div>
      </div>
    </div>
  );
}

function LlmSection({ llm, embedding, onLlmChange, onEmbeddingChange, settingsMode, writingLlm, onWritingLlmChange, onModeChange, proxyUrl, onProxyUrlSave, showThinking, onToggleShowThinking }) {
  const [testStatus, setTestStatus] = useState('idle');
  const [testMsg, setTestMsg] = useState('');
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
              <Button
                variant="default"
                onClick={handleTestConnection}
                disabled={testStatus === 'testing'}
              >
                {testStatus === 'testing' ? '测试中…' : '测试连接'}
              </Button>
              {testStatus === 'ok' && (
                <span style={{ fontSize: '13px', color: 'var(--we-moss)' }}>{testMsg}</span>
              )}
              {testStatus === 'error' && (
                <span style={{ fontSize: '13px', color: 'var(--we-vermilion)' }}>{testMsg}</span>
              )}
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
        </>
      )}

      {/* 渲染设置：对话/写作空间共用，始终可见 */}
      <hr className="we-settings-divider" />
      <div className="we-settings-field-group">
        <p className="we-settings-subsection-title">渲染设置</p>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '14px', color: 'var(--we-ink-primary)', margin: '0 0 4px' }}>
              渲染思考链
            </p>
            <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '12px', color: 'var(--we-ink-faded)', fontStyle: 'italic', margin: 0 }}>
              显示 &lt;think&gt; 标签内容（可折叠），对话与写作空间均生效；关闭则完全屏蔽
            </p>
          </div>
          <button
            role="switch"
            aria-checked={showThinking}
            onClick={() => onToggleShowThinking(!showThinking)}
            style={{
              flexShrink: 0,
              position: 'relative',
              display: 'inline-flex',
              height: '24px',
              width: '44px',
              cursor: 'pointer',
              borderRadius: '9999px',
              border: '2px solid transparent',
              transition: 'background-color 0.2s',
              backgroundColor: showThinking ? 'var(--we-vermilion)' : 'var(--we-paper-shadow)',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                height: '20px',
                width: '20px',
                borderRadius: '9999px',
                backgroundColor: 'var(--we-paper-base)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                transition: 'transform 0.2s',
                transform: showThinking ? 'translateX(20px)' : 'translateX(0)',
              }}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

function PromptSection({
  settingsMode, onModeChange,
  globalSystemPrompt, setGlobalSystemPrompt,
  globalPostPrompt, setGlobalPostPrompt,
  contextRounds, setContextRounds,
  memoryExpansionEnabled, onToggleMemoryExpansion,
  onSave, saving,
  writingSystemPrompt, setWritingSystemPrompt,
  writingPostPrompt, setWritingPostPrompt,
  writingContextRounds, setWritingContextRounds,
  onSaveWriting,
}) {
  return (
    <div>
      <h2 className="we-settings-section-title">全局 Prompt</h2>
      <ModeSwitch mode={settingsMode} onChange={onModeChange} />

      {settingsMode === 'writing' ? (
        <>
          <div className="we-settings-field-group">
            <div className="we-edit-form-group">
              <FieldLabel hint="null = 继承对话配置，0 = 不限制">写作上下文保留轮次</FieldLabel>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Input
                  type="number"
                  min={0}
                  style={{ width: '96px' }}
                  value={writingContextRounds ?? ''}
                  placeholder="继承对话"
                  onChange={(e) => setWritingContextRounds(e.target.value === '' ? null : e.target.value)}
                />
                <span style={{ fontSize: '13px', color: 'var(--we-ink-faded)', fontStyle: 'italic', fontFamily: 'var(--we-font-serif)' }}>
                  留空继承对话配置，0 = 不限制
                </span>
              </div>
            </div>

            <div className="we-edit-form-group">
              <FieldLabel>写作 System Prompt</FieldLabel>
              <MarkdownEditor
                value={writingSystemPrompt}
                onChange={setWritingSystemPrompt}
                placeholder="写作空间专用全局指令，覆盖对话 System Prompt"
                minHeight={96}
              />
            </div>

            <div className="we-edit-form-group">
              <FieldLabel hint="插入在用户消息之后，作为 user 角色发送">写作后置提示词</FieldLabel>
              <MarkdownEditor
                value={writingPostPrompt}
                onChange={setWritingPostPrompt}
                placeholder="写作空间专用后置提示词"
                minHeight={72}
              />
            </div>
          </div>

          <p className="we-edit-label">写作 Prompt 条目</p>
          <EntryList type="global" mode="writing" />

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <Button variant="primary" onClick={onSaveWriting} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="we-settings-field-group">
            <div className="we-edit-form-group">
              <FieldLabel hint="0 = 不限制">上下文保留轮次</FieldLabel>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Input
                  type="number"
                  min={0}
                  style={{ width: '96px' }}
                  value={contextRounds}
                  onChange={(e) => setContextRounds(e.target.value)}
                />
                <span style={{ fontSize: '13px', color: 'var(--we-ink-faded)', fontStyle: 'italic', fontFamily: 'var(--we-font-serif)' }}>
                  保留最近 N 轮，0 = 不限制
                </span>
              </div>
            </div>

            <div className="we-edit-form-group">
              <FieldLabel>全局 System Prompt</FieldLabel>
              <MarkdownEditor
                value={globalSystemPrompt}
                onChange={setGlobalSystemPrompt}
                placeholder="适用于所有世界和角色的全局指令"
                minHeight={96}
              />
            </div>

            <div className="we-edit-form-group">
              <FieldLabel hint="插入在用户消息之后，作为 user 角色发送">全局后置提示词</FieldLabel>
              <MarkdownEditor
                value={globalPostPrompt}
                onChange={setGlobalPostPrompt}
                placeholder="每次用户发送消息后附加的全局指令，例如输出格式要求"
                minHeight={72}
              />
            </div>
          </div>

          <p className="we-edit-label">全局 Prompt 条目</p>
          <EntryList type="global" mode="chat" />

          <hr className="we-settings-divider" />

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '24px' }}>
            <div>
              <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '14px', color: 'var(--we-ink-primary)', margin: '0 0 4px' }}>
                记忆原文展开
              </p>
              <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '12px', color: 'var(--we-ink-faded)', fontStyle: 'italic', margin: 0 }}>
                召回历史摘要后允许 AI 读取原文，会略增加首包延迟
              </p>
            </div>
            <button
              role="switch"
              aria-checked={memoryExpansionEnabled}
              onClick={() => onToggleMemoryExpansion(!memoryExpansionEnabled)}
              style={{
                flexShrink: 0,
                position: 'relative',
                display: 'inline-flex',
                height: '24px',
                width: '44px',
                cursor: 'pointer',
                borderRadius: '9999px',
                border: '2px solid transparent',
                transition: 'background-color 0.2s',
                backgroundColor: memoryExpansionEnabled ? 'var(--we-vermilion)' : 'var(--we-paper-shadow)',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  height: '20px',
                  width: '20px',
                  borderRadius: '9999px',
                  backgroundColor: 'var(--we-paper-base)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  transition: 'transform 0.2s',
                  transform: memoryExpansionEnabled ? 'translateX(20px)' : 'translateX(0)',
                }}
              />
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" onClick={onSave} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function ImportExportSection({ onImportSuccess }) {
  const fileInputRef = useRef(null);
  const [mode, setMode] = useState('chat');
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState(null);
  const appMode = useAppModeStore((s) => s.appMode);

  async function handleExport() {
    setExporting(true);
    setMessage(null);
    try {
      await downloadGlobalSettings(mode);
      setMessage({ type: 'ok', text: '导出成功' });
    } catch (e) {
      setMessage({ type: 'err', text: `导出失败：${e.message}` });
    } finally {
      setExporting(false);
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    if (!file) return;
    setImporting(true);
    setMessage(null);
    try {
      const data = await readJsonFile(file);
      const result = await importGlobalSettings(data);
      await Promise.all([
        refreshCustomCss(appMode),
        loadRules().catch(() => {}),
      ]);
      invalidateCache();
      const label = result.mode === 'writing' ? '写作空间' : '对话空间';
      setMessage({ type: 'ok', text: `导入成功，已覆盖${label}全局设置` });
      onImportSuccess?.();
    } catch (e) {
      setMessage({ type: 'err', text: `导入失败：${e.message}` });
    } finally {
      setImporting(false);
    }
  }

  const modeLabel = mode === 'writing' ? '写作空间' : '对话空间';

  return (
    <div>
      <h2 className="we-settings-section-title">导入导出</h2>

      <div className="we-settings-field-group">
        <ModeSwitch mode={mode} onChange={(m) => { setMode(m); setMessage(null); }} />

        <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '13px', color: 'var(--we-ink-faded)', lineHeight: '1.7', margin: '0 0 16px' }}>
          当前操作范围：<strong>{modeLabel}</strong>。导出内容包括该模式的全局 Prompt（system/post prompt、prompt 条目）、自定义 CSS、全局正则规则。不含 LLM 配置与 API 密钥。
          <br />
          导入为<strong>覆盖</strong>模式，仅清空并写入<strong>{modeLabel}</strong>的数据，不影响另一空间。
        </p>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? '导出中…' : `导出${modeLabel}设置`}
          </Button>
          <Button variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            {importing ? '导入中…' : '导入设置文件'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.weglobal.json"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>

        {message && (
          <p style={{
            marginTop: '12px',
            fontFamily: 'var(--we-font-serif)',
            fontSize: '13px',
            color: message.type === 'ok' ? 'var(--we-gold-leaf)' : 'var(--we-vermilion)',
          }}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}

function AboutSection() {
  return (
    <div>
      <h2 className="we-settings-section-title">关于</h2>
      <div className="we-settings-field-group">
        <div>
          <p style={{ fontFamily: 'var(--we-font-display)', fontSize: '15px', fontStyle: 'italic', color: 'var(--we-ink-secondary)', margin: '0 0 4px' }}>
            WorldEngine
          </p>
          <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '13px', color: 'var(--we-ink-faded)', margin: 0 }}>
            版本 0.0.0（开发版）
          </p>
        </div>

        <hr className="we-settings-divider" />

        <div>
          <p style={{ fontFamily: 'var(--we-font-display)', fontSize: '14px', fontStyle: 'italic', color: 'var(--we-ink-secondary)', margin: '0 0 8px' }}>
            重置数据库
          </p>
          <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '13px', color: 'var(--we-ink-faded)', fontStyle: 'italic', lineHeight: '1.6', margin: '0 0 12px' }}>
            重置将清除所有数据（世界、角色、会话、消息）。请在后端目录执行：
          </p>
          <pre style={{
            fontFamily: 'Courier New, monospace',
            fontSize: '12.5px',
            background: 'var(--we-paper-aged)',
            border: '1px solid var(--we-paper-shadow)',
            padding: '10px 14px',
            color: 'var(--we-ink-secondary)',
            margin: 0,
          }}>
            {'cd backend && npm run db:reset'}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isOverlay = !!location.state?.backgroundLocation;
  const [activeSection, setActiveSection] = useState('llm');
  const [settingsMode, setSettingsMode] = useState('chat');
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  const [llm, setLlm] = useState({});
  const [embedding, setEmbedding] = useState({});
  const [proxyUrl, setProxyUrl] = useState('');
  const [contextRounds, setContextRounds] = useState(10);
  const [globalSystemPrompt, setGlobalSystemPrompt] = useState('');
  const [globalPostPrompt, setGlobalPostPrompt] = useState('');
  const [memoryExpansionEnabled, setMemoryExpansionEnabled] = useState(true);
  const [showThinking, setShowThinkingLocal] = useState(true);
  const setShowThinkingStore = useDisplaySettingsStore((s) => s.setShowThinking);
  const [saving, setSaving] = useState(false);

  const [writingLlm, setWritingLlm] = useState({ model: '', temperature: null, max_tokens: null });
  const [writingSystemPrompt, setWritingSystemPrompt] = useState('');
  const [writingPostPrompt, setWritingPostPrompt] = useState('');
  const [writingContextRounds, setWritingContextRounds] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    getConfig().then((c) => {
      setConfig(c);
      setLlm(c.llm || {});
      setEmbedding(c.embedding || {});
      setProxyUrl(c.proxy_url ?? '');
      setContextRounds(c.context_history_rounds ?? 10);
      setGlobalSystemPrompt(c.global_system_prompt ?? '');
      setGlobalPostPrompt(c.global_post_prompt ?? '');
      setMemoryExpansionEnabled(c.memory_expansion_enabled !== false);
      setShowThinkingLocal(c.ui?.show_thinking !== false);
      const w = c.writing || {};
      setWritingLlm(w.llm || { model: '', temperature: null, max_tokens: null });
      setWritingSystemPrompt(w.global_system_prompt ?? '');
      setWritingPostPrompt(w.global_post_prompt ?? '');
      setWritingContextRounds(w.context_history_rounds ?? null);
      setLoading(false);
    });
  }, [reloadKey]);

  useEffect(() => {
    const h = () => setReloadKey((k) => k + 1);
    window.addEventListener('we:global-config-updated', h);
    return () => window.removeEventListener('we:global-config-updated', h);
  }, []);

  async function patchConfig(patch) {
    const updated = await updateConfig(patch);
    setConfig(updated);
  }

  async function handleLlmChange(field, value) {
    if (field === 'provider') {
      const isLocal = LOCAL_PROVIDERS.includes(value);
      // 不传 model，让后端从 provider_models 恢复；base_url 切本地 provider 时清空
      const patch = isLocal ? { provider: value } : { provider: value, base_url: '' };
      const updated = await updateConfig({ llm: patch });
      setConfig(updated);
      setLlm((prev) => ({
        ...prev,
        provider: value,
        base_url: updated.llm?.base_url ?? '',
        model: updated.llm?.model ?? '',
        has_key: updated.llm?.has_key ?? false,
        provider_keys: updated.llm?.provider_keys ?? {},
      }));
    } else if (field === 'has_key') {
      setLlm((prev) => ({ ...prev, has_key: value }));
    } else {
      setLlm((prev) => ({ ...prev, [field]: value }));
      await patchConfig({ llm: { [field]: value } });
    }
  }

  async function handleEmbeddingChange(field, value) {
    if (field === 'provider') {
      const keepBaseUrl = NEEDS_BASE_URL_PROVIDERS.has(value);
      const patch = keepBaseUrl ? { provider: value } : { provider: value, base_url: '' };
      const updated = await updateConfig({ embedding: patch });
      setConfig(updated);
      setEmbedding((prev) => ({
        ...prev,
        provider: value,
        base_url: updated.embedding?.base_url ?? '',
        model: updated.embedding?.model ?? '',
        has_key: updated.embedding?.has_key ?? false,
        provider_keys: updated.embedding?.provider_keys ?? {},
      }));
    } else if (field === 'has_key') {
      setEmbedding((prev) => ({ ...prev, has_key: value }));
    } else {
      setEmbedding((prev) => ({ ...prev, [field]: value }));
      await patchConfig({ embedding: { [field]: value } });
    }
  }

  async function handleWritingLlmChange(field, value) {
    setWritingLlm((prev) => ({ ...prev, [field]: value }));
    await patchConfig({ writing: { llm: { [field]: value } } });
  }

  async function handleSaveGeneral() {
    setSaving(true);
    try {
      await patchConfig({
        context_history_rounds: Number(contextRounds),
        global_system_prompt: globalSystemPrompt,
        global_post_prompt: globalPostPrompt,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveWritingGeneral() {
    setSaving(true);
    try {
      await patchConfig({
        writing: {
          context_history_rounds: writingContextRounds !== '' && writingContextRounds !== null ? Number(writingContextRounds) : null,
          global_system_prompt: writingSystemPrompt,
          global_post_prompt: writingPostPrompt,
        },
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleProxyUrlSave(url) {
    setProxyUrl(url);
    await patchConfig({ proxy_url: url });
  }

  async function handleToggleMemoryExpansion(enabled) {
    setMemoryExpansionEnabled(enabled);
    await patchConfig({ memory_expansion_enabled: enabled });
  }

  async function handleToggleShowThinking(enabled) {
    setShowThinkingLocal(enabled);
    setShowThinkingStore(enabled);
    await patchConfig({ ui: { show_thinking: enabled } });
  }

  async function handleImportSuccess() {
    const c = await getConfig();
    setConfig(c);
    setGlobalSystemPrompt(c.global_system_prompt ?? '');
    setGlobalPostPrompt(c.global_post_prompt ?? '');
    setContextRounds(c.context_history_rounds ?? 10);
    setMemoryExpansionEnabled(c.memory_expansion_enabled !== false);
    const w = c.writing || {};
    setWritingLlm(w.llm || { model: '', temperature: null, max_tokens: null });
    setWritingSystemPrompt(w.global_system_prompt ?? '');
    setWritingPostPrompt(w.global_post_prompt ?? '');
    setWritingContextRounds(w.context_history_rounds ?? null);
  }

  function closeOverlay() {
    navigate(-1);
  }

  function handleBack() {
    if (isOverlay) {
      closeOverlay();
      return;
    }
    const from = location.state?.from;
    if (from?.pathname) {
      navigate(
        {
          pathname: from.pathname,
          search: from.search || '',
          hash: from.hash || '',
        },
        { state: from.state }
      );
      return;
    }
    navigate(-1);
  }

  if (loading) {
    return (
      isOverlay ? (
        <div className="we-settings-overlay" onClick={closeOverlay}>
          <div className="we-settings-panel we-settings-panel-overlay" onClick={(e) => e.stopPropagation()}>
            <div className="we-settings-loading">
              <p style={{ fontFamily: 'var(--we-font-serif)', color: 'var(--we-ink-faded)', fontStyle: 'italic' }}>加载中…</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="we-edit-canvas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
          <p style={{ fontFamily: 'var(--we-font-serif)', color: 'var(--we-ink-faded)', fontStyle: 'italic' }}>加载中…</p>
        </div>
      )
    );
  }

  const settingsContent = (
    <div className="we-settings-panel-wrap">
      <div
        className={`we-settings-panel${isOverlay ? ' we-settings-panel-overlay' : ''}`}
        onClick={isOverlay ? (e) => e.stopPropagation() : undefined}
      >
        {/* 左栏导航 */}
        <nav className="we-settings-nav">
          <button className="we-edit-back" onClick={handleBack}>← 返回</button>
          <p className="we-settings-nav-title">设置</p>
          <div className="we-settings-nav-items">
            {NAV_SECTIONS.map((s) => (
              <button
                key={s.key}
                className={`we-settings-nav-item${activeSection === s.key ? ' active' : ''}`}
                onClick={() => setActiveSection(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </nav>

        {/* 右栏内容 */}
        <div className="we-settings-body">
          {activeSection === 'llm' && (
            <div className="we-settings-section">
              <LlmSection
                llm={llm}
                embedding={embedding}
                onLlmChange={handleLlmChange}
                onEmbeddingChange={handleEmbeddingChange}
                settingsMode={settingsMode}
                writingLlm={writingLlm}
                onWritingLlmChange={handleWritingLlmChange}
                onModeChange={setSettingsMode}
                proxyUrl={proxyUrl}
                onProxyUrlSave={handleProxyUrlSave}
                showThinking={showThinking}
                onToggleShowThinking={handleToggleShowThinking}
              />
            </div>
          )}
          {activeSection === 'prompt' && (
            <div className="we-settings-section">
              <PromptSection
                settingsMode={settingsMode}
                onModeChange={setSettingsMode}
                globalSystemPrompt={globalSystemPrompt}
                setGlobalSystemPrompt={setGlobalSystemPrompt}
                globalPostPrompt={globalPostPrompt}
                setGlobalPostPrompt={setGlobalPostPrompt}
                contextRounds={contextRounds}
                setContextRounds={setContextRounds}
                memoryExpansionEnabled={memoryExpansionEnabled}
                onToggleMemoryExpansion={handleToggleMemoryExpansion}
                onSave={handleSaveGeneral}
                saving={saving}
                writingSystemPrompt={writingSystemPrompt}
                setWritingSystemPrompt={setWritingSystemPrompt}
                writingPostPrompt={writingPostPrompt}
                setWritingPostPrompt={setWritingPostPrompt}
                writingContextRounds={writingContextRounds}
                setWritingContextRounds={setWritingContextRounds}
                onSaveWriting={handleSaveWritingGeneral}
              />
            </div>
          )}
          {activeSection === 'css' && (
            <div className="we-settings-section">
              <h2 className="we-settings-section-title">自定义 CSS</h2>
              <ModeSwitch mode={settingsMode} onChange={setSettingsMode} />
              <CustomCssManager settingsMode={settingsMode} />
            </div>
          )}
          {activeSection === 'regex' && (
            <div className="we-settings-section">
              <h2 className="we-settings-section-title">正则规则</h2>
              <ModeSwitch mode={settingsMode} onChange={setSettingsMode} />
              <RegexRulesManager settingsMode={settingsMode} />
            </div>
          )}
          {activeSection === 'import_export' && (
            <div className="we-settings-section">
              <ImportExportSection onImportSuccess={handleImportSuccess} />
            </div>
          )}
          {activeSection === 'about' && (
            <div className="we-settings-section">
              <AboutSection />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return isOverlay ? (
    <div className="we-settings-overlay" onClick={closeOverlay}>
      {settingsContent}
    </div>
  ) : (
    <div className="we-edit-canvas">
      {settingsContent}
    </div>
  );
}
