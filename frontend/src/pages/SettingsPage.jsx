import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
// 需要显示 Base URL 输入框的 provider（本地 + openai_compatible）
const NEEDS_BASE_URL_PROVIDERS = new Set([...LOCAL_PROVIDERS, 'openai_compatible']);

function SectionTitle({ children }) {
  return (
    <h2 className="font-serif text-base font-semibold text-text mb-4">{children}</h2>
  );
}

function FieldLabel({ children, hint }) {
  return (
    <label className="block text-sm text-text-secondary mb-1">
      {children}
      {hint && <span className="text-text-secondary opacity-40 ml-1.5 text-xs">{hint}</span>}
    </label>
  );
}

function textInput(value, onChange, placeholder) {
  return (
    <input
      className="w-full px-3 py-2 bg-ivory border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

/** 模型下拉框 + 加载/错误状态 */
function ModelSelector({ value, onChange, loadModels, disabled }) {
  const [models, setModels] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | loading | error
  const [errMsg, setErrMsg] = useState('');

  async function load() {
    setStatus('loading');
    setErrMsg('');
    try {
      const data = await loadModels();
      const list = data.models || [];
      setModels(list);
      setStatus('ok');
      // 当前值为空或不在新列表中时，自动选第一个可用模型
      if (list.length > 0 && !value) {
        onChange(list[0]);
      }
    } catch (e) {
      setErrMsg(e.message || '无法获取模型列表，请检查 API Key 和网络连接');
      setStatus('error');
    }
  }

  useEffect(() => { load(); }, []);

  if (status === 'loading') {
    return <p className="text-sm text-text-secondary opacity-60 py-1">获取模型列表中…</p>;
  }

  if (status === 'error') {
    return (
      <div>
        <p className="text-sm text-red-400 mb-1">{errMsg}</p>
        <button
          onClick={load}
          className="text-xs text-accent hover:opacity-80 transition-opacity"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <ModelCombobox
      value={value}
      onChange={onChange}
      options={models}
      disabled={disabled}
      placeholder="输入或选择模型名称"
    />
  );
}

/** LLM 或 Embedding 配置区块 */
function ProviderSection({
  title,
  providers,
  config,
  onProviderChange,
  onBaseUrlChange,
  onModelChange,
  onApiKeySave,
  onApiKeySaved,
  loadModels,
}) {
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
    <div className="flex flex-col gap-4">
      <SectionTitle>{title}</SectionTitle>

      {/* Provider */}
      <div>
        <FieldLabel>Provider</FieldLabel>
        <Select
          value={config.provider || ''}
          onChange={onProviderChange}
          options={providers}
        />
      </div>

      {/* API Key（本地 provider 无需 API Key） */}
      {config.provider && !isLocal && (
        <div>
          <FieldLabel>API Key</FieldLabel>
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 bg-ivory border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={config.has_key ? '••••••••（已配置，输入新密钥可覆盖）' : '输入后单独保存，不随其他配置提交'}
            />
            <button
              onClick={handleSaveKey}
              className="px-4 py-2 text-sm bg-ivory border border-border rounded-lg text-text hover:border-accent transition-colors"
            >
              {apiKeySaved ? '已保存' : '保存密钥'}
            </button>
          </div>
        </div>
      )}

      {/* Base URL（本地 provider 和 openai_compatible 显示） */}
      {needsBaseUrl && (
        <div>
          <FieldLabel>Base URL</FieldLabel>
          {textInput(
            config.base_url || '',
            onBaseUrlChange,
            config.provider === 'ollama' ? 'http://localhost:11434'
              : config.provider === 'lmstudio' ? 'http://localhost:1234'
              : 'https://your-api-endpoint/v1',
          )}
        </div>
      )}

      {/* 模型 */}
      {config.provider && (
        <div>
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

export default function SettingsPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  // 独立存储 llm 和 embedding 的 provider/base_url/model（从 config 加载，本地修改后 patch 到服务器）
  const [llm, setLlm] = useState({});
  const [embedding, setEmbedding] = useState({});
  const [contextRounds, setContextRounds] = useState(10);
  const [globalSystemPrompt, setGlobalSystemPrompt] = useState('');
  const [globalPostPrompt, setGlobalPostPrompt] = useState('');
  const [memoryExpansionEnabled, setMemoryExpansionEnabled] = useState(true);

  const [testStatus, setTestStatus] = useState('idle'); // idle | testing | ok | error
  const [testMsg, setTestMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getConfig().then((c) => {
      setConfig(c);
      setLlm(c.llm || {});
      setEmbedding(c.embedding || {});
      setContextRounds(c.context_compress_rounds ?? 10);
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
      // 切换 provider 时清除 base_url（非本地）和 model，避免旧值干扰新 provider
      const isLocal = LOCAL_PROVIDERS.includes(value);
      const patch = isLocal
        ? { provider: value, model: '' }
        : { provider: value, base_url: '', model: '' };
      // 先保存再更新 state，避免 ModelSelector 在旧 provider 下拉取模型
      await patchConfig({ llm: patch });
      setLlm((prev) => ({ ...prev, ...patch }));
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
    } else {
      setEmbedding((prev) => ({ ...prev, [field]: value }));
      await patchConfig({ embedding: { [field]: value } });
    }
  }

  async function handleSaveGeneral() {
    setSaving(true);
    try {
      await patchConfig({
        context_compress_rounds: Number(contextRounds),
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-text-secondary">
        加载中…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      {/* 固定顶栏 */}
      <div className="sticky top-0 z-40 bg-canvas border-b border-border px-4">
        <div className="max-w-[56rem] mx-auto flex items-center justify-between py-2.5">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text transition-colors"
          >
            ← 返回
          </button>
          <button
            onClick={handleSaveGeneral}
            disabled={saving}
            className="px-4 py-1.5 bg-accent text-white text-sm rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="px-4 pt-8 pb-10">
      <div className="max-w-[56rem] mx-auto">
        <h1 className="text-2xl font-serif font-semibold text-text tracking-tight mb-10">设置</h1>

        <div className="flex flex-col gap-10">
          {/* ── LLM 配置 ─────────────────────────────── */}
          <section className="bg-ivory border border-border rounded-2xl p-6">
            <ProviderSection
              title="语言模型（LLM）"
              providers={LLM_PROVIDERS}
              config={llm}
              onProviderChange={(v) => handleLlmChange('provider', v)}
              onBaseUrlChange={(v) => handleLlmChange('base_url', v)}
              onModelChange={(v) => handleLlmChange('model', v)}
              onApiKeySave={updateApiKey}
              onApiKeySaved={() => setLlm((prev) => ({ ...prev, has_key: true }))}
              loadModels={fetchModels}
            />

            {/* 模型参数 */}
            <div className="mt-4 flex flex-col gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <FieldLabel>Temperature</FieldLabel>
                  <span className="text-sm text-text font-mono">
                    {(llm.temperature ?? 0.8).toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1" max="2.0" step="0.1"
                  value={llm.temperature ?? 0.8}
                  onChange={(e) => handleLlmChange('temperature', parseFloat(e.target.value))}
                  className="w-full accent-accent"
                />
              </div>
              <div>
                <FieldLabel>Max Tokens</FieldLabel>
                <input
                  type="number"
                  min="64" max="32000" step="64"
                  value={llm.max_tokens ?? 4096}
                  onChange={(e) => handleLlmChange('max_tokens', parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 bg-ivory border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
                />
              </div>
            </div>

            {/* 测试连接 */}
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={handleTestConnection}
                disabled={testStatus === 'testing'}
                className="px-4 py-2 text-sm border border-border rounded-lg text-text hover:border-accent transition-colors disabled:opacity-50"
              >
                {testStatus === 'testing' ? '测试中…' : '测试连接'}
              </button>
              {testStatus === 'ok' && (
                <span className="text-sm text-green-500">{testMsg}</span>
              )}
              {testStatus === 'error' && (
                <span className="text-sm text-red-400">{testMsg}</span>
              )}
            </div>
          </section>

          {/* ── Embedding 配置 ───────────────────────── */}
          <section className="bg-ivory border border-border rounded-2xl p-6">
            <ProviderSection
              title="Embedding 模型"
              providers={EMBEDDING_PROVIDERS}
              config={embedding}
              onProviderChange={(v) => handleEmbeddingChange('provider', v || null)}
              onBaseUrlChange={(v) => handleEmbeddingChange('base_url', v)}
              onModelChange={(v) => handleEmbeddingChange('model', v)}
              onApiKeySave={updateEmbeddingApiKey}
              onApiKeySaved={() => setEmbedding((prev) => ({ ...prev, has_key: true }))}
              loadModels={fetchEmbeddingModels}
            />
          </section>

          {/* ── 通用配置 ─────────────────────────────── */}
          <section className="bg-ivory border border-border rounded-2xl p-6">
            <SectionTitle>通用配置</SectionTitle>
            <div className="flex flex-col gap-4">
              <div>
                <FieldLabel hint="0 = 不限制">上下文保留轮次</FieldLabel>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    className="w-28 px-3 py-2 bg-canvas border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
                    value={contextRounds}
                    onChange={(e) => setContextRounds(e.target.value)}
                  />
                  <span className="text-sm text-text-secondary opacity-60">
                    保留最近 N 轮对话历史发送给 AI，0 = 不限制
                  </span>
                </div>
              </div>

              <div>
                <FieldLabel>全局 System Prompt</FieldLabel>
                <MarkdownEditor
                  value={globalSystemPrompt}
                  onChange={setGlobalSystemPrompt}
                  placeholder="适用于所有世界和角色的全局指令"
                  minHeight={96}
                />
              </div>

              <div>
                <FieldLabel hint="插入在用户消息之后，作为 user 角色发送">全局后置提示词</FieldLabel>
                <MarkdownEditor
                  value={globalPostPrompt}
                  onChange={setGlobalPostPrompt}
                  placeholder="每次用户发送消息后附加的全局指令，例如输出格式要求"
                  minHeight={72}
                />
              </div>

              <div className="border-t border-border pt-4">
                <EntryList type="global" />
              </div>
            </div>
          </section>

          {/* ── 自定义样式 ────────────────────────────── */}
          <section className="bg-ivory border border-border rounded-2xl p-6">
            <SectionTitle>自定义样式</SectionTitle>
            <CustomCssManager />
          </section>

          {/* ── 正则替换 ──────────────────────────────── */}
          <section className="bg-ivory border border-border rounded-2xl p-6">
            <SectionTitle>正则替换</SectionTitle>
            <RegexRulesManager />
          </section>

          {/* ── 记忆与召回 ────────────────────────────── */}
          <section className="bg-ivory border border-border rounded-2xl p-6">
            <SectionTitle>记忆与召回</SectionTitle>
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-text">记忆原文展开</p>
                  <p className="text-xs text-text-secondary opacity-60 mt-0.5">
                    召回历史摘要后允许 AI 读取原文，会略增加首包延迟
                  </p>
                </div>
                <button
                  role="switch"
                  aria-checked={memoryExpansionEnabled}
                  onClick={() => handleToggleMemoryExpansion(!memoryExpansionEnabled)}
                  className={[
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                    memoryExpansionEnabled ? 'bg-accent' : 'bg-border',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200',
                      memoryExpansionEnabled ? 'translate-x-5' : 'translate-x-0',
                    ].join(' ')}
                  />
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
      </div>
    </div>
  );
}
