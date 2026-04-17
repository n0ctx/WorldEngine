import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  getConfig, updateConfig, updateApiKey, updateEmbeddingApiKey,
  fetchModels, fetchEmbeddingModels, testConnection,
} from '../api/config';
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

const NAV_SECTIONS = [
  { key: 'llm', label: 'LLM 配置' },
  { key: 'prompt', label: '全局 Prompt' },
  { key: 'css', label: '自定义 CSS' },
  { key: 'regex', label: '正则规则' },
  { key: 'entries', label: '全局 Prompt 条目' },
  { key: 'about', label: '关于' },
];

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

function ProviderBlock({ title, providers, config, onProviderChange, onBaseUrlChange, onModelChange, onApiKeySave, onApiKeySaved, loadModels }) {
  const [apiKey, setApiKey] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState(false);

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
            key={config.provider + (config.base_url || '') + (config.api_key || '')}
            value={config.model || ''}
            onChange={onModelChange}
            loadModels={loadModels}
          />
        </div>
      )}
    </div>
  );
}

function LlmSection({ llm, embedding, onLlmChange, onEmbeddingChange }) {
  const [testStatus, setTestStatus] = useState('idle');
  const [testMsg, setTestMsg] = useState('');

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

      <ProviderBlock
        title="语言模型（LLM）"
        providers={LLM_PROVIDERS}
        config={llm}
        onProviderChange={(v) => onLlmChange('provider', v)}
        onBaseUrlChange={(v) => onLlmChange('base_url', v)}
        onModelChange={(v) => onLlmChange('model', v)}
        onApiKeySave={updateApiKey}
        onApiKeySaved={() => onLlmChange('has_key', true)}
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
            min="0.1" max="2.0" step="0.1"
            value={llm.temperature ?? 0.8}
            onChange={(e) => onLlmChange('temperature', parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--we-vermilion)' }}
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
    </div>
  );
}

function PromptSection({
  globalSystemPrompt, setGlobalSystemPrompt,
  globalPostPrompt, setGlobalPostPrompt,
  contextRounds, setContextRounds,
  memoryExpansionEnabled, onToggleMemoryExpansion,
  onSave, saving,
}) {
  return (
    <div>
      <h2 className="we-settings-section-title">全局 Prompt</h2>

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
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  const [llm, setLlm] = useState({});
  const [embedding, setEmbedding] = useState({});
  const [contextRounds, setContextRounds] = useState(10);
  const [globalSystemPrompt, setGlobalSystemPrompt] = useState('');
  const [globalPostPrompt, setGlobalPostPrompt] = useState('');
  const [memoryExpansionEnabled, setMemoryExpansionEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getConfig().then((c) => {
      setConfig(c);
      setLlm(c.llm || {});
      setEmbedding(c.embedding || {});
      setContextRounds(c.context_history_rounds ?? 10);
      setGlobalSystemPrompt(c.global_system_prompt ?? '');
      setGlobalPostPrompt(c.global_post_prompt ?? '');
      setMemoryExpansionEnabled(c.memory_expansion_enabled !== false);
      setLoading(false);
    });
  }, []);

  async function patchConfig(patch) {
    const updated = await updateConfig(patch);
    setConfig(updated);
  }

  async function handleLlmChange(field, value) {
    if (field === 'provider') {
      const isLocal = LOCAL_PROVIDERS.includes(value);
      const patch = isLocal
        ? { provider: value, model: '' }
        : { provider: value, base_url: '', model: '' };
      await patchConfig({ llm: patch });
      setLlm((prev) => ({ ...prev, ...patch }));
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
      const patch = keepBaseUrl
        ? { provider: value, model: '' }
        : { provider: value, base_url: '', model: '' };
      await patchConfig({ embedding: patch });
      setEmbedding((prev) => ({ ...prev, ...patch }));
    } else if (field === 'has_key') {
      setEmbedding((prev) => ({ ...prev, has_key: value }));
    } else {
      setEmbedding((prev) => ({ ...prev, [field]: value }));
      await patchConfig({ embedding: { [field]: value } });
    }
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

  async function handleToggleMemoryExpansion(enabled) {
    setMemoryExpansionEnabled(enabled);
    await patchConfig({ memory_expansion_enabled: enabled });
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
              />
            </div>
          )}
          {activeSection === 'prompt' && (
            <div className="we-settings-section">
              <PromptSection
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
              />
            </div>
          )}
          {activeSection === 'css' && (
            <div className="we-settings-section">
              <h2 className="we-settings-section-title">自定义 CSS</h2>
              <CustomCssManager />
            </div>
          )}
          {activeSection === 'regex' && (
            <div className="we-settings-section">
              <h2 className="we-settings-section-title">正则规则</h2>
              <RegexRulesManager />
            </div>
          )}
          {activeSection === 'entries' && (
            <div className="we-settings-section">
              <h2 className="we-settings-section-title">全局 Prompt 条目</h2>
              <EntryList type="global" />
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
