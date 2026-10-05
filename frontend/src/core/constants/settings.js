import { OLLAMA_DEFAULT_BASE_URL, LMSTUDIO_DEFAULT_BASE_URL, LLAMACPP_DEFAULT_BASE_URL } from '../utils/constants.js';

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
    summary: '小米官方模型接口按 OpenAI 兼容方式接入；请填写控制台提供的 Base URL。',
    links: [
      { label: '打开小米开放平台', url: 'https://dev.mi.com/' },
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
const NEEDS_BASE_URL_PROVIDERS = new Set([...LOCAL_PROVIDERS, 'openai_compatible', 'xiaomi']);

export const DEFAULT_BASE_URLS = {
  ollama: OLLAMA_DEFAULT_BASE_URL,
  lmstudio: LMSTUDIO_DEFAULT_BASE_URL,
  llamacpp: LLAMACPP_DEFAULT_BASE_URL,
  xiaomi: 'https://your-xiaomi-api-endpoint/v1',
};

export const SETTINGS_MODE = { CHAT: 'chat', WRITING: 'writing' };

export const DIARY_DATE_MODE = { VIRTUAL: 'virtual', REAL: 'real' };

/**
 * 各 provider 思考链配置选项 — 与后端请求体写入逻辑严格对应
 * （openai-compatible 族见 backend/llm/providers/openai-compatible/thinking.js#applyThinkingToOpenAICompatibleBody，
 *   kimi-coding 走 anthropic 适配器，见 backend/llm/providers/anthropic/index.js#resolveKimiCodingEffort）
 *
 * 编码命名空间：
 *   effort_*           → reasoning_effort 或 reasoning.effort（OpenAI o-series / OpenRouter / Grok / Xiaomi / kimi-coding）
 *   budget_*           → thinking.budget_tokens / thinkingConfig.thinkingBudget（Anthropic / Gemini / minimax-coding）
 *   thinking_enabled/disabled → thinking: { type } 或 reasoning: { enabled } 或 enable_thinking 开关
 *   qwen_*             → enable_thinking=true + thinking_budget 数值（Qwen / SiliconFlow）
 */
function getProviderThinkingOptions(provider) {
  switch (provider) {
    case 'anthropic':
    case 'gemini':
    case 'minimax-coding':
      return [
        { value: 'budget_low', label: '少（最多 1024 Token）' },
        { value: 'budget_medium', label: '中（最多 8192 Token）' },
        { value: 'budget_high', label: '多（最多 16384 Token）' },
      ];
    // kimi-coding（K3 / K2.8 Preview）官方档位为 low/high/max
    case 'kimi-coding':
      return [
        { value: 'effort_low', label: '低' },
        { value: 'effort_high', label: '高' },
        { value: 'effort_max', label: '最高' },
      ];
    case 'openai':
    case 'xiaomi':
    case 'openai_compatible':
      return [
        { value: 'effort_low', label: '低' },
        { value: 'effort_medium', label: '中' },
        { value: 'effort_high', label: '高' },
      ];
    case 'openrouter':
      return [
        { value: 'effort_low', label: '低' },
        { value: 'effort_medium', label: '中' },
        { value: 'effort_high', label: '高' },
        { value: 'thinking_enabled', label: '开启（强度由模型决定）' },
        { value: 'thinking_disabled', label: '关闭' },
      ];
    case 'llamacpp':
      // 服务端 Qwen3 模板只认 low|medium|xhigh，effort_high 在后端映射为 xhigh
      return [
        { value: 'thinking_disabled', label: '关闭' },
        { value: 'effort_low', label: '低' },
        { value: 'effort_medium', label: '中' },
        { value: 'effort_high', label: '高' },
      ];
    case 'grok':
      return [
        { value: 'effort_low', label: '低（仅 grok-3-mini）' },
        { value: 'effort_high', label: '高（仅 grok-3-mini）' },
      ];
    case 'glm':
    case 'glm-coding':
      return [
        { value: 'thinking_enabled', label: '开启' },
        { value: 'thinking_disabled', label: '关闭' },
      ];
    case 'deepseek':
      return [
        { value: 'thinking_enabled', label: '开启（仅 v3.1 及以上）' },
        { value: 'thinking_disabled', label: '关闭（仅 v3.1 及以上）' },
      ];
    case 'qwen':
    case 'siliconflow':
      return [
        { value: 'thinking_disabled', label: '关闭' },
        { value: 'thinking_enabled', label: '开启（强度由模型决定）' },
        { value: 'qwen_low', label: '少（最多 1024 Token）' },
        { value: 'qwen_medium', label: '中（最多 8192 Token）' },
        { value: 'qwen_high', label: '多（最多 16384 Token）' },
      ];
    // kimi / minimax：模型驱动（kimi-k2-thinking / minimax-m2 等模型自动思考），不暴露开关
    default:
      return [];
  }
}

export function getProviderDisplaySettings(provider, onThinkingLevelChange) {
  const isLocal = provider && LOCAL_PROVIDERS.includes(provider);
  const needsBaseUrl = provider && NEEDS_BASE_URL_PROVIDERS.has(provider);
  const providerHint = provider ? (PROVIDER_HINTS[provider] || null) : null;
  const thinkingOptions = onThinkingLevelChange ? getProviderThinkingOptions(provider) : [];
  const isModelDrivenThinking = onThinkingLevelChange && thinkingOptions.length === 0
    && (provider === 'kimi' || provider === 'minimax');

  return { isLocal, needsBaseUrl, providerHint, thinkingOptions, isModelDrivenThinking };
}
