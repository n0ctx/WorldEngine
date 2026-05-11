import globals from 'globals';
import noBackendConsole from '../eslint-rules/no-backend-console.js';

// 后端 lint 范围有限：当前只强制 no-backend-console，避免引入大量历史问题。
// 未来若想接入 js.configs.recommended，需要先批量清理 ~100 处 unused-var / empty-block / no-control-regex。
//
// no-restricted-syntax 兜底：禁止重复硬编码已有单一来源的字面量。豁免文件见末尾 file-level override。
const sharedConstantRestrictions = [
  { selector: "Literal[value='worldengine-character-v1']",        message: "用 EXPORT_FORMAT_CHARACTER（services/import-export-constants.js）替代字面量。" },
  { selector: "Literal[value='worldengine-persona-v1']",          message: "用 EXPORT_FORMAT_PERSONA（services/import-export-constants.js）替代字面量。" },
  { selector: "Literal[value='worldengine-world-v1']",            message: "用 EXPORT_FORMAT_WORLD（services/import-export-constants.js）替代字面量。" },
  { selector: "Literal[value='worldengine-global-settings-v1']",  message: "用 EXPORT_FORMAT_GLOBAL_SETTINGS（services/import-export-constants.js）替代字面量。" },
  { selector: "Literal[value='https://api.openai.com/v1']",       message: "用 DEFAULT_BASE_URLS.openai（llm/providers/_shared/base-urls.js）替代字面量。" },
  { selector: "Literal[value='https://api.anthropic.com']",       message: "用 DEFAULT_BASE_URLS.anthropic（llm/providers/_shared/base-urls.js）替代字面量。" },
  { selector: "Literal[value='2023-06-01']",                      message: "用 ANTHROPIC_API_VERSION（llm/providers/anthropic/constants.js）替代字面量。" },
  { selector: "Literal[value='prompt-caching-2024-07-31']",       message: "用 ANTHROPIC_PROMPT_CACHING_BETA（llm/providers/anthropic/constants.js）替代字面量。" },
  { selector: "Literal[value='http://localhost:11434']",          message: "用 OLLAMA_DEFAULT_BASE_URL（utils/constants.js）替代字面量。" },
  { selector: "Literal[value='http://localhost:1234']",           message: "用 LMSTUDIO_DEFAULT_BASE_URL（utils/constants.js）替代字面量。" },
];

export default [
  {
    ignores: ['node_modules/**', 'tests/**', 'data/**', 'coverage/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    plugins: {
      'we-local': { rules: { 'no-backend-console': noBackendConsole } },
    },
    rules: {
      'we-local/no-backend-console': 'error',
      'no-restricted-syntax': ['error', ...sharedConstantRestrictions],
    },
  },
  // 常量定义文件本身需要写字面量，单独豁免。
  // routes/config.js 内 OPENAI_COMPATIBLE_BASE_URLS 与 _shared/base-urls.js 内 chat 路径副本是有意 drift
  // （kimi-coding 的 /models 端点用 /coding/v1，chat 端点用 /coding），必须独立维护，豁免本规则。
  {
    files: [
      'services/import-export-constants.js',
      'llm/providers/_shared/base-urls.js',
      'llm/providers/anthropic/constants.js',
      'routes/config.js',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
];
