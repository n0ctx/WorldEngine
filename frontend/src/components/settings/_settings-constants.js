export const LLM_PROVIDERS = [
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

export const EMBEDDING_PROVIDERS = [
  { value: '', label: '不启用' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'openai_compatible', label: 'OpenAI Compatible' },
  { value: 'ollama', label: 'Ollama（本地）' },
];

export const NAV_SECTIONS = [
  { key: 'llm', label: 'LLM 配置' },
  { key: 'prompt', label: '全局 Prompt' },
  { key: 'memory', label: '记忆' },
  { key: 'css', label: '自定义 CSS' },
  { key: 'regex', label: '正则规则' },
  { key: 'import_export', label: '导入导出' },
  { key: 'about', label: '关于' },
];

export const LOCAL_PROVIDERS = ['ollama', 'lmstudio'];
export const NEEDS_BASE_URL_PROVIDERS = new Set([...LOCAL_PROVIDERS, 'openai_compatible']);

export function getProviderThinkingOptions(provider) {
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
