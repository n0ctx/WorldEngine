// Provider 默认 base URL 与归类（chat/completions 请求路径用）。
// 注意：config.js 的模型列表拉取另有一份 OPENAI_COMPATIBLE_BASE_URLS（部分 provider 的 /models 端点路径与 /chat 不同，如 kimi-coding 的 /coding vs /coding/v1），二者各自独立。
export const DEFAULT_BASE_URLS = {
  openai:          'https://api.openai.com/v1',
  openrouter:      'https://openrouter.ai/api/v1',
  glm:             'https://api.z.ai/api/paas/v4',
  'glm-coding':    'https://api.z.ai/api/coding/paas/v4',
  kimi:            'https://api.moonshot.cn/v1',
  'kimi-coding':   'https://api.kimi.com/coding',
  minimax:         'https://api.minimax.chat/v1',
  'minimax-coding':'https://api.minimax.io/anthropic',
  deepseek:        'https://api.deepseek.com',
  grok:            'https://api.x.ai/v1',
  siliconflow:     'https://api.siliconflow.cn/v1',
  qwen:            'https://dashscope.aliyuncs.com/compatible-mode/v1',
  anthropic:       'https://api.anthropic.com',
  gemini:          'https://generativelanguage.googleapis.com',
};

export const OPENAI_COMPATIBLE = new Set([
  'openai', 'openrouter', 'glm', 'glm-coding', 'kimi', 'kimi-coding', 'minimax', 'deepseek', 'grok', 'siliconflow', 'qwen', 'xiaomi',
]);

export function getBaseUrl(config) {
  return (config.base_url || DEFAULT_BASE_URLS[config.provider] || '').replace(/\/+$/, '');
}
