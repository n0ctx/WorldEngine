import js from '@eslint/js';
import globals from 'globals';
import noBackendConsole from '../eslint-rules/no-backend-console.js';

// recommended 已接入。历史中曾有 ~100 处 unused-var / empty-block / control-regex，已统一清理；
// 现行策略：
//   - no-empty 允许 catch {}（迁移/兜底清理常态）
//   - no-unused-vars 默认豁免 _ 前缀（参数/解构/catch 显式占位）
//   - utils/logger.js 文件级豁免 no-control-regex（解析 ANSI 转义）
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
  js.configs.recommended,
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
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
    },
  },
  // utils/logger.js 解析 ANSI 转义需要匹配控制字符，必须豁免 no-control-regex
  {
    files: ['utils/logger.js'],
    rules: {
      'no-control-regex': 'off',
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
