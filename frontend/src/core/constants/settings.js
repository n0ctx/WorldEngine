import { OLLAMA_DEFAULT_BASE_URL, LMSTUDIO_DEFAULT_BASE_URL } from '../utils/constants.js';

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

export const EMBEDDING_PROVIDERS = [
  { value: '', label: '不启用' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'openai_compatible', label: 'OpenAI Compatible' },
  { value: 'ollama', label: 'Ollama（本地）' },
];

// 表格记忆的 5 张固定表（key + 中文名）。与后端 TABLE_SCHEMAS 一一对应，
// 仅用于设置页渲染每表行数上限输入；若后端增删表需同步此处。
export const TABLE_MEMORY_TABLES = [
  { key: 'relations', name: '关系表' },
  { key: 'items', name: '物品表' },
  { key: 'places', name: '地点表' },
  { key: 'plotlines', name: '剧情线表' },
  { key: 'world', name: '世界状态表' },
];

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
  { key: NAV_KEY.LLM, label: 'LLM 配置' },
  { key: NAV_KEY.FEATURES, label: '功能配置' },
  { key: NAV_KEY.PROMPT, label: '全局提示词' },
  { key: NAV_KEY.THEME, label: '主题' },
  { key: NAV_KEY.CSS, label: '自定义 CSS' },
  { key: NAV_KEY.REGEX, label: '正则规则' },
  { key: NAV_KEY.IMPORT_EXPORT, label: '导入导出' },
  { key: NAV_KEY.PROVIDER_SAFETY, label: 'Provider 安全信号' },
  { key: NAV_KEY.ABOUT, label: '关于' },
];

export const LOCAL_PROVIDERS = ['ollama', 'lmstudio'];
export const NEEDS_BASE_URL_PROVIDERS = new Set([...LOCAL_PROVIDERS, 'openai_compatible', 'xiaomi']);

export const DEFAULT_BASE_URLS = {
  ollama: OLLAMA_DEFAULT_BASE_URL,
  lmstudio: LMSTUDIO_DEFAULT_BASE_URL,
  xiaomi: 'https://your-xiaomi-api-endpoint/v1',
};

export const SETTINGS_MODE = { CHAT: 'chat', WRITING: 'writing' };

export const DIARY_DATE_MODE = { VIRTUAL: 'virtual', REAL: 'real' };

/**
 * 各 provider 思考链配置选项 — 与 backend/llm/providers/openai-compatible/thinking.js#applyThinkingToOpenAICompatibleBody 严格对应
 *
 * 编码命名空间：
 *   effort_*           → reasoning_effort 或 reasoning.effort（OpenAI o-series / OpenRouter / Grok / Xiaomi）
 *   budget_*           → thinking.budget_tokens / thinkingConfig.thinkingBudget（Anthropic / Gemini / kimi-coding / minimax-coding）
 *   thinking_enabled/disabled → thinking: { type } 或 reasoning: { enabled } 或 enable_thinking 开关
 *   qwen_*             → enable_thinking=true + thinking_budget 数值（Qwen / SiliconFlow）
 */
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
    case 'xiaomi':
    case 'openai_compatible':
      return [
        { value: 'effort_low', label: '推理：低（reasoning_effort=low）' },
        { value: 'effort_medium', label: '推理：中（reasoning_effort=medium）' },
        { value: 'effort_high', label: '推理：高（reasoning_effort=high）' },
      ];
    case 'openrouter':
      return [
        { value: 'effort_low', label: '推理：低（reasoning.effort=low）' },
        { value: 'effort_medium', label: '推理：中（reasoning.effort=medium）' },
        { value: 'effort_high', label: '推理：高（reasoning.effort=high）' },
        { value: 'thinking_enabled', label: '思考：开启（reasoning.enabled=true）' },
        { value: 'thinking_disabled', label: '思考：关闭（reasoning.enabled=false）' },
      ];
    case 'grok':
      return [
        { value: 'effort_low', label: '推理：低（仅 grok-3-mini）' },
        { value: 'effort_high', label: '推理：高（仅 grok-3-mini）' },
      ];
    case 'glm':
    case 'glm-coding':
      return [
        { value: 'thinking_enabled', label: '思考：开启（thinking.type=enabled）' },
        { value: 'thinking_disabled', label: '思考：关闭（thinking.type=disabled）' },
      ];
    case 'deepseek':
      return [
        { value: 'thinking_enabled', label: '思考：开启（thinking.type=enabled，仅 v3.1+）' },
        { value: 'thinking_disabled', label: '思考：关闭（thinking.type=disabled，仅 v3.1+）' },
      ];
    case 'qwen':
    case 'siliconflow':
      return [
        { value: 'thinking_disabled', label: '思考：关闭（enable_thinking=false）' },
        { value: 'thinking_enabled', label: '思考：开启（enable_thinking=true）' },
        { value: 'qwen_low', label: '思考：低（thinking_budget=1024）' },
        { value: 'qwen_medium', label: '思考：中（thinking_budget=8192）' },
        { value: 'qwen_high', label: '思考：高（thinking_budget=16384）' },
      ];
    // kimi / minimax：模型驱动（kimi-k2-thinking / minimax-m2 等模型自动思考），不暴露开关
    default:
      return [];
  }
}
