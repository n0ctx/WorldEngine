import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getConfig, updateConfig, updateApiKey, updateEmbeddingApiKey,
  fetchModels, fetchEmbeddingModels, testConnection,
} from '../api/config';
import EntryList from '../components/prompt/EntryList';
import CustomCssManager from '../components/settings/CustomCssManager';

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

function SectionTitle({ children }) {
  return (
    <h2 className="text-base font-semibold text-[var(--text-h)] mb-4">{children}</h2>
  );
}

function FieldLabel({ children, hint }) {
  return (
    <label className="block text-sm text-[var(--text)] mb-1">
      {children}
      {hint && <span className="text-[var(--text)] opacity-40 ml-1.5 text-xs">{hint}</span>}
    </label>
  );
}

function textInput(value, onChange, placeholder) {
  return (
    <input
      className="w-full px-3 py-2 bg-[var(--code-bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm focus:outline-none focus:border-[var(--accent)]"
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
      setModels(data.models || []);
      setStatus('ok');
    } catch (e) {
      setErrMsg(e.message || '无法获取模型列表，请检查 API Key 和网络连接');
      setStatus('error');
    }
  }

  useEffect(() => { load(); }, []);

  if (status === 'loading') {
    return <p className="text-sm text-[var(--text)] opacity-60 py-1">获取模型列表中…</p>;
  }

  if (status === 'error') {
    return (
      <div>
        <p className="text-sm text-red-400 mb-1">{errMsg}</p>
        <button
          onClick={load}
          className="text-xs text-[var(--accent)] hover:opacity-80 transition-opacity"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <select
      className="w-full px-3 py-2 bg-[var(--code-bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm focus:outline-none focus:border-[var(--accent)]"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    >
      {value && !models.includes(value) && (
        <option value={value}>{value}</option>
      )}
      {models.map((m) => (
        <option key={m} value={m}>{m}</option>
      ))}
    </select>
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

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle>{title}</SectionTitle>

      {/* Provider */}
      <div>
        <FieldLabel>Provider</FieldLabel>
        <select
          className="w-full px-3 py-2 bg-[var(--code-bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm focus:outline-none focus:border-[var(--accent)]"
          value={config.provider || ''}
          onChange={(e) => onProviderChange(e.target.value)}
        >
          {providers.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* API Key */}
      {config.provider && !isLocal && (
        <div>
          <FieldLabel>API Key</FieldLabel>
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 bg-[var(--code-bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm focus:outline-none focus:border-[var(--accent)]"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={config.has_key ? '••••••••（已配置，输入新密钥可覆盖）' : '输入后单独保存，不随其他配置提交'}
            />
            <button
              onClick={handleSaveKey}
              className="px-4 py-2 text-sm bg-[var(--code-bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] hover:border-[var(--accent)] transition-colors"
            >
              {apiKeySaved ? '已保存' : '保存密钥'}
            </button>
          </div>
        </div>
      )}

      {/* Base URL（仅本地 provider 显示） */}
      {isLocal && (
        <div>
          <FieldLabel>Base URL</FieldLabel>
          {textInput(
            config.base_url || '',
            onBaseUrlChange,
            config.provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234',
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
      setLoading(false);
    });
  }, []);

  async function patchConfig(patch) {
    const updated = await updateConfig(patch);
    setConfig(updated);
  }

  async function handleLlmChange(field, value) {
    if (field === 'provider') {
      // 先保存再更新 state，避免 ModelSelector 在旧 provider 下拉取模型
      await patchConfig({ llm: { [field]: value } });
      setLlm((prev) => ({ ...prev, [field]: value }));
    } else {
      setLlm((prev) => ({ ...prev, [field]: value }));
      await patchConfig({ llm: { [field]: value } });
    }
  }

  async function handleEmbeddingChange(field, value) {
    if (field === 'provider') {
      await patchConfig({ embedding: { [field]: value } });
      setEmbedding((prev) => ({ ...prev, [field]: value }));
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
      });
    } finally {
      setSaving(false);
    }
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
      <div className="min-h-screen flex items-center justify-center text-[var(--text)]">
        加载中…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] px-4 py-10">
      <div className="max-w-2xl mx-auto">
        {/* 返回 */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-sm text-[var(--text)] hover:text-[var(--text-h)] transition-colors mb-8"
        >
          ← 返回
        </button>

        <h1 className="text-2xl font-semibold text-[var(--text-h)] tracking-tight mb-10">设置</h1>

        <div className="flex flex-col gap-10">
          {/* ── LLM 配置 ─────────────────────────────── */}
          <section className="bg-[var(--code-bg)] border border-[var(--border)] rounded-2xl p-6">
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

            {/* 测试连接 */}
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={handleTestConnection}
                disabled={testStatus === 'testing'}
                className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg text-[var(--text-h)] hover:border-[var(--accent)] transition-colors disabled:opacity-50"
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
          <section className="bg-[var(--code-bg)] border border-[var(--border)] rounded-2xl p-6">
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
          <section className="bg-[var(--code-bg)] border border-[var(--border)] rounded-2xl p-6">
            <SectionTitle>通用配置</SectionTitle>
            <div className="flex flex-col gap-4">
              <div>
                <FieldLabel hint="0 = 不限制">上下文保留轮次</FieldLabel>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={0}
                    className="w-28 px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm focus:outline-none focus:border-[var(--accent)]"
                    value={contextRounds}
                    onChange={(e) => setContextRounds(e.target.value)}
                  />
                  <span className="text-sm text-[var(--text)] opacity-60">
                    保留最近 N 轮对话历史发送给 AI，0 = 不限制
                  </span>
                </div>
              </div>

              <div>
                <FieldLabel>全局 System Prompt</FieldLabel>
                <textarea
                  className="w-full px-3 py-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm focus:outline-none focus:border-[var(--accent)] resize-none"
                  rows={4}
                  value={globalSystemPrompt}
                  onChange={(e) => setGlobalSystemPrompt(e.target.value)}
                  placeholder="适用于所有世界和角色的全局指令"
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSaveGeneral}
                  disabled={saving}
                  className="px-5 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {saving ? '保存中…' : '保存'}
                </button>
              </div>
            </div>
          </section>

          {/* ── 全局 Prompt 条目 ──────────────────────── */}
          <section className="bg-[var(--code-bg)] border border-[var(--border)] rounded-2xl p-6">
            <EntryList type="global" />
          </section>

          {/* ── 自定义样式 ────────────────────────────── */}
          <section className="bg-[var(--code-bg)] border border-[var(--border)] rounded-2xl p-6">
            <SectionTitle>自定义样式</SectionTitle>
            <CustomCssManager />
          </section>
        </div>
      </div>
    </div>
  );
}
