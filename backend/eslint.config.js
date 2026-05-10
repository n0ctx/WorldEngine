import globals from 'globals';
import noBackendConsole from '../eslint-rules/no-backend-console.js';

// 后端 lint 范围有限：当前只强制 no-backend-console，避免引入大量历史问题。
// 未来若想接入 js.configs.recommended，需要先批量清理 ~100 处 unused-var / empty-block / no-control-regex。
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
    },
  },
];
