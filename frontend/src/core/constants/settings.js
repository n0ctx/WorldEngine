import {
  OLLAMA_DEFAULT_BASE_URL,
  LMSTUDIO_DEFAULT_BASE_URL,
  LLAMACPP_DEFAULT_BASE_URL,
  PROVIDER_THINKING_LEVELS,
} from '../utils/constants.js';

export const LLM_PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'grok', label: 'Grok (xAI)' },
  { value: 'siliconflow', label: 'SiliconFlow' },
  { value: 'qwen', label: 'Qwen (阿里云百炼)' },
  { value: 'xiaomi', label: 'Xiaomi (小米)' },
  { value: 'xiaomi-coding', label: 'Xiaomi Coding Plan (小米)' },
  { value: 'glm', label: 'GLM (智谱)' },
  { value: 'glm-coding', label: 'GLM Coding Plan (智谱)' },
  { value: 'kimi', label: 'Kimi (月之暗面)' },
  { value: 'kimi-coding', label: 'Kimi Coding Plan' },
  { value: 'minimax', label: 'MiniMax' },
  { value: 'minimax-coding', label: 'MiniMax Coding Plan' },
  { value: 'ollama', label: 'Ollama（本地）' },
  { value: 'lmstudio', label: 'LM Studio（本地）' },
  { value: 'llamacpp', label: 'llama.cpp（本地）' },
];

const PROVIDER_HINTS = {
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
  qwen: {
    links: [
      { label: '打开阿里云百炼控制台', url: 'https://bailian.console.aliyun.com/' },
      { label: '查看 OpenAI 兼容文档', url: 'https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope' },
    ],
  },
  xiaomi: {
    summary: '小米 MiMo 官方接口按 OpenAI 兼容方式接入；接口地址留空即用官方地址。',
    links: [
      { label: '查看 MiMo 接口文档', url: 'https://mimo.mi.com/docs/en-US/api/chat/openai-api' },
    ],
  },
  'xiaomi-coding': {
    summary: '小米 MiMo Token Plan 的 Key 以 tp- 开头，与按量付费的 Key 不通用。接口地址按订阅地区填写：国内 token-plan-cn、新加坡 token-plan-sgp、欧洲 token-plan-ams（如 https://token-plan-sgp.xiaomimimo.com/v1）；留空即用国内地址。',
    links: [
      { label: '打开 Token Plan 控制台', url: 'https://platform.xiaomimimo.com/token-plan' },
      { label: '查看 MiMo 接口文档', url: 'https://mimo.mi.com/docs/en-US/api/chat/openai-api' },
    ],
  },
};

export const NAV_KEY = {
  LLM: 'llm',
  FEATURES: 'features',
  PROMPT: 'prompt',
  THEME: 'theme',
  CSS: 'css',
  REGEX: 'regex',
  IMPORT_EXPORT: 'import_export',
  PROVIDER_SAFETY: 'provider_safety',
  ABOUT: 'about',
};

export const NAV_SECTIONS = [
  { key: NAV_KEY.LLM, label: '模型' },
  { key: NAV_KEY.FEATURES, label: '功能配置' },
  { key: NAV_KEY.PROMPT, label: '全局提示词' },
  { key: NAV_KEY.THEME, label: '主题' },
  { key: NAV_KEY.CSS, label: '自定义 CSS' },
  { key: NAV_KEY.REGEX, label: '正则规则' },
  { key: NAV_KEY.IMPORT_EXPORT, label: '导入导出' },
  { key: NAV_KEY.PROVIDER_SAFETY, label: '服务商安全信号' },
  { key: NAV_KEY.ABOUT, label: '关于' },
];

export const LOCAL_PROVIDERS = ['ollama', 'lmstudio', 'llamacpp'];
const NEEDS_BASE_URL_PROVIDERS = new Set([...LOCAL_PROVIDERS, 'openai_compatible', 'xiaomi', 'xiaomi-coding']);

export const DEFAULT_BASE_URLS = {
  ollama: OLLAMA_DEFAULT_BASE_URL,
  lmstudio: LMSTUDIO_DEFAULT_BASE_URL,
  llamacpp: LLAMACPP_DEFAULT_BASE_URL,
  xiaomi: 'https://api.xiaomimimo.com/v1',
  'xiaomi-coding': 'https://token-plan-cn.xiaomimimo.com/v1',
};

export const SETTINGS_MODE = { CHAT: 'chat', WRITING: 'writing' };

export const DIARY_DATE_MODE = { VIRTUAL: 'virtual', REAL: 'real' };

export function getProviderDisplaySettings(provider, onThinkingLevelChange) {
  const isLocal = provider && LOCAL_PROVIDERS.includes(provider);
  const needsBaseUrl = provider && NEEDS_BASE_URL_PROVIDERS.has(provider);
  const providerHint = provider ? (PROVIDER_HINTS[provider] || null) : null;
  // 思考强度档位的单一来源见 shared/thinking-levels.mjs，后端按同一张表校验与拼请求体
  const thinkingOptions = onThinkingLevelChange ? (PROVIDER_THINKING_LEVELS[provider] ?? []) : [];

  return { isLocal, needsBaseUrl, providerHint, thinkingOptions };
}
