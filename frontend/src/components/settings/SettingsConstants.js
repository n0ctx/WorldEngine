export const LLM_PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'grok', label: 'Grok (xAI)' },
  { value: 'siliconflow', label: 'SiliconFlow' },
  { value: 'glm', label: 'GLM (智谱)' },
  { value: 'glm-coding', label: 'GLM Coding Plan (智谱)' },
  { value: 'kimi', label: 'Kimi (月之暗面)' },
  { value: 'kimi-coding', label: 'Kimi Coding Plan' },
  { value: 'minimax', label: 'MiniMax' },
  { value: 'minimax-coding', label: 'MiniMax Coding Plan' },
  { value: 'ollama', label: 'Ollama（本地）' },
  { value: 'lmstudio', label: 'LM Studio（本地）' },
];

export const PROVIDER_HINTS = {
  'kimi-coding': {
    links: [
      { label: '打开 Kimi Code 控制台', url: 'https://www.kimi.com/code/console' },
      { label: '查看 Kimi 接入文档', url: 'https://www.kimi.com/code/docs/en/third-party-tools/other-coding-agents.html' },
      { label: '打开 Kimi 登录页', url: 'https://www.kimi.com/code/en' },
    ],
  },
  'minimax-coding': {
    links: [
      { label: '打开 Token Plan 文档', url: 'https://platform.minimax.io/docs/coding-plan/intro' },
      { label: '查看 Anthropic 兼容文档', url: 'https://platform.minimax.io/docs/api-reference/text-anthropic-api' },
      { label: '打开 MiniMax 控制台', url: 'https://platform.minimax.io/' },
    ],
  },
  'glm-coding': {
    links: [
      { label: '打开 Z.AI 控制台', url: 'https://platform.z.ai/' },
      { label: '查看 GLM Coding 文档', url: 'https://docs.z.ai/devpack/tool/others' },
      { label: '查看配置说明', url: 'https://zcode.z.ai/docs/configuration' },
    ],
  },
};

export const EMBEDDING_PROVIDERS = [
  { value: '', label: '不启用' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'openai_compatible', label: 'OpenAI Compatible' },
  { value: 'ollama', label: 'Ollama（本地）' },
];

export const NAV_KEY = {
  LLM: 'llm',
  FEATURES: 'features',
  PROMPT: 'prompt',
  CSS: 'css',
  REGEX: 'regex',
  IMPORT_EXPORT: 'import_export',
  ABOUT: 'about',
};

export const NAV_SECTIONS = [
  { key: NAV_KEY.LLM, label: 'LLM 配置' },
  { key: NAV_KEY.FEATURES, label: '功能配置' },
  { key: NAV_KEY.PROMPT, label: '全局提示词' },
  { key: NAV_KEY.CSS, label: '自定义 CSS' },
  { key: NAV_KEY.REGEX, label: '正则规则' },
  { key: NAV_KEY.IMPORT_EXPORT, label: '导入导出' },
  { key: NAV_KEY.ABOUT, label: '关于' },
];

export const LOCAL_PROVIDERS = ['ollama', 'lmstudio'];
export const NEEDS_BASE_URL_PROVIDERS = new Set([...LOCAL_PROVIDERS, 'openai_compatible']);

export const DEFAULT_BASE_URLS = {
  ollama: 'http://localhost:11434',
  lmstudio: 'http://localhost:1234',
};

export const SETTINGS_MODE = { CHAT: 'chat', WRITING: 'writing' };

export const DIARY_DATE_MODE = { VIRTUAL: 'virtual', REAL: 'real' };

export function getProviderThinkingOptions(provider) {
  switch (provider) {
    case 'anthropic':
    case 'gemini':
    case 'kimi-coding':
    case 'minimax-coding':
      return [
        { value: 'budget_low', label: '思考：低（1024 tokens）' },
        { value: 'budget_medium', label: '思考：中（8192 tokens）' },
        { value: 'budget_high', label: '思考：高（16384 tokens）' },
      ];
    case 'openai':
    case 'glm-coding':
      return [
        { value: 'effort_low', label: '推理：低（仅 o-series）' },
        { value: 'effort_medium', label: '推理：中（仅 o-series）' },
        { value: 'effort_high', label: '推理：高（仅 o-series）' },
      ];
    default:
      return [];
  }
}
