import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // 禁止内联 style 设置视觉属性，新代码守卫规则（warn 不阻断 CI）
      'no-restricted-syntax': [
        'warn',
        {
          selector: "JSXAttribute[name.name='style'] > JSXExpressionContainer > ObjectExpression > Property[key.name=/^(color|background|backgroundColor|border|borderColor|fontFamily|fontSize|fontWeight|letterSpacing|lineHeight|padding|paddingTop|paddingLeft|paddingRight|paddingBottom|margin|marginTop|marginLeft|marginRight|marginBottom|boxShadow|textShadow|opacity|fill|stroke|outline|zIndex|backdropFilter|WebkitBackdropFilter)$/]",
          message: '禁止内联 style 设置视觉属性，请使用 CSS 类或 CSS 变量。豁免：animationDelay、transform、transition。',
        },
      ],
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
