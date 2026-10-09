// 各服务商「思考强度」可选档位的单一来源：前端设置页的选项、后端的配置校验与请求体拼装都以此为准。
// 档位依据 2026-10 各家官方接口文档；档位如何写进请求体见
// backend/llm/providers/openai-compatible/thinking.js、anthropic/index.js、gemini/index.js、ollama/native.js。
// 标签括号里写的是只对部分模型有效的档位的适用范围。

export const THINKING_BUDGET_LOW = 1024;
export const THINKING_BUDGET_MEDIUM = 8192;
export const THINKING_BUDGET_HIGH = 16384;

const EFFORT_LABELS = { low: '低', medium: '中', high: '高', xhigh: '超高', max: '最高' };

function efforts(names, note) {
  return names.map((name) => ({
    value: `effort_${name}`,
    label: note ? `${EFFORT_LABELS[name]}（${note}）` : EFFORT_LABELS[name],
  }));
}

function budgets(prefix, note) {
  return [
    ['low', '少', THINKING_BUDGET_LOW],
    ['medium', '中', THINKING_BUDGET_MEDIUM],
    ['high', '多', THINKING_BUDGET_HIGH],
  ].map(([name, label, tokens]) => ({
    value: `${prefix}_${name}`,
    label: `${label}（最多 ${tokens} Token${note ? `，${note}` : ''}）`,
  }));
}

function off(note) {
  return { value: 'thinking_disabled', label: note ? `关闭（${note}）` : '关闭' };
}

function on(note) {
  return { value: 'thinking_enabled', label: note ? `开启（${note}）` : '开启' };
}

const GLM_LEVELS = [off(), on(), ...efforts(['low', 'high', 'max'], 'GLM-5.2 及以上')];
const MINIMAX_LEVELS = [off('M3'), on()];
const QWEN_LEVELS = [off(), on('强度由模型决定'), ...budgets('qwen')];
const LOCAL_EFFORT_LEVELS = [off(), ...efforts(['low', 'medium', 'high'])];

export const PROVIDER_THINKING_LEVELS = Object.freeze({
  openai: [off(), ...efforts(['low', 'medium', 'high', 'xhigh', 'max'])],
  anthropic: [
    ...efforts(['low', 'medium', 'high'], 'Claude 4.6 及以上'),
    ...efforts(['xhigh'], 'Claude 4.7 及以上'),
    ...efforts(['max'], 'Claude 4.6 及以上'),
    ...budgets('budget', 'Claude 4.5 及更早'),
  ],
  gemini: [
    ...efforts(['low', 'medium', 'high'], 'Gemini 3 及以上'),
    ...budgets('budget', 'Gemini 2.5'),
  ],
  openrouter: [off(), on('强度由模型决定'), ...efforts(['low', 'medium', 'high', 'xhigh', 'max'])],
  deepseek: [off(), ...efforts(['low', 'high', 'max'])],
  grok: [...efforts(['low', 'medium', 'high']), ...efforts(['xhigh'], 'grok-4.6 及以上')],
  siliconflow: QWEN_LEVELS,
  qwen: QWEN_LEVELS,
  xiaomi: [off(), on()],
  'xiaomi-coding': [off(), on()],
  glm: GLM_LEVELS,
  'glm-coding': GLM_LEVELS,
  kimi: [off('K2.6'), ...efforts(['low', 'high', 'max'], 'K3')],
  'kimi-coding': [off('改由 K2.8 Preview 不思考作答'), ...efforts(['low', 'high', 'max'])],
  minimax: MINIMAX_LEVELS,
  'minimax-coding': MINIMAX_LEVELS,
  ollama: LOCAL_EFFORT_LEVELS,
  llamacpp: LOCAL_EFFORT_LEVELS,
});

export function isThinkingLevelSupported(provider, level) {
  return PROVIDER_THINKING_LEVELS[provider]?.some((option) => option.value === level) ?? false;
}
