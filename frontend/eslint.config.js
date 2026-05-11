import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import reactPlugin from 'eslint-plugin-react'
import { defineConfig, globalIgnores } from 'eslint/config'
import noDirectToastImport from '../eslint-rules/no-direct-toast-import.js'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: {
      react: reactPlugin,
      'we-local': { rules: { 'no-direct-toast-import': noDirectToastImport } },
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, __APP_VERSION__: 'readonly' },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'react/jsx-uses-vars': 'error',
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      'we-local/no-direct-toast-import': 'error',
      'no-restricted-syntax': [
        'warn',
        // 禁止内联 style 设置视觉属性
        {
          selector: "JSXAttribute[name.name='style'] > JSXExpressionContainer > ObjectExpression > Property[key.name=/^(color|background|backgroundColor|border|borderColor|fontFamily|fontSize|fontWeight|letterSpacing|lineHeight|padding|paddingTop|paddingLeft|paddingRight|paddingBottom|margin|marginTop|marginLeft|marginRight|marginBottom|boxShadow|textShadow|opacity|fill|stroke|outline|zIndex|backdropFilter|WebkitBackdropFilter)$/]",
          message: '禁止内联 style 设置视觉属性，请使用 CSS 类或 CSS 变量。豁免：animationDelay、transform、transition。',
        },
        // 禁止重复硬编码已有单一来源的字面量；常量定义在 shared/runtime-constants.mjs，通过 src/utils/constants.js re-export
        { selector: "Literal[value='http://localhost:11434']", message: "用 OLLAMA_DEFAULT_BASE_URL（src/utils/constants.js）替代字面量。" },
        { selector: "Literal[value='http://localhost:1234']",  message: "用 LMSTUDIO_DEFAULT_BASE_URL（src/utils/constants.js）替代字面量。" },
      ],
    },
  },
  {
    files: ['vite.config.js', 'vitest.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['tests/**/*.{js,jsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.vitest,
        global: 'readonly',
      },
    },
  },
  // CustomCssManager 展示 CSS 示例文本，豁免 no-restricted-syntax 规则
  {
    files: ['**/CustomCssManager*'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
])
