# Repo Tooling And Hooks

仓库级脚本、用户 hook 入口与自定义 ESLint 规则。

## 什么时候读

- 改根目录 `scripts/`
- 改根目录 `hooks/` 用户扩展入口
- 改 `eslint-rules/` 自定义规则

## 当前分工

- `scripts/check-docs-harness.mjs`：文档链路校验
- `scripts/check-assistant-syntax.mjs`：assistant 相关语法检查
- `scripts/check-git-health.sh`：合并冲突 / git hygiene 检查
- `scripts/sync-version.mjs`：从根 `package.json` 同步版本号到子包
- `hooks/README.md`：用户 DIY hook 入口说明
- `hooks/examples/`：可复制的 hook 示例
- `eslint-rules/`：仓库自定义 lint 规则，如 backend 禁止直接 `console`、组件禁止直接引 toast

## 高频任务快速分流

- 改文档守卫：看 `scripts/check-docs-harness.mjs`
- 改版本同步：看 `scripts/sync-version.mjs`
- 改用户 hook 使用方式：看 `hooks/README.md`
- 改 lint 硬约束：看 `eslint-rules/no-backend-console.js` 与 `no-direct-toast-import.js`

## 相关代码文件

- `scripts/check-docs-harness.mjs`
- `scripts/check-assistant-syntax.mjs`
- `scripts/check-git-health.sh`
- `scripts/sync-version.mjs`
- `hooks/README.md`
- `eslint-rules/no-backend-console.js`
