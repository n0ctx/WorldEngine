# Backend Prompt Templates

后端 `.md` prompt 模板、命名分组与加载方式。

## 什么时候读

- 改 `backend/prompts/templates/*.md`
- 想知道某类 LLM 后处理到底用的是哪份模板
- 改模板命名或 prompt-loader 读取约定

## 当前约定

- 模板统一平铺在 `backend/prompts/templates/`
- 由 `backend/prompts/prompt-loader.js` 读取
- 文件名前缀按用途分组：`memory-*`、`entry-*`、`state-*`、`chat-*`、`writing-*`、`shared-*`

## 高频任务快速分流

- turn summary / title / expand / compress：看 `memory-*`
- Prompt 条目命中：看 `entry-preflight-*`
- 状态更新与压缩：看 `state-*`
- 模拟用户输入：看 `chat-impersonate.md`
- 写作章节与 nearby：看 `writing-*`
- `<next_prompt>` 建议块：看 `shared-suggestion*.md`

## 相关代码文件

- `backend/prompts/prompt-loader.js`
- `backend/prompts/templates/README.md`
- `backend/prompts/templates/memory-turn-summary.md`
- `backend/prompts/templates/state-update.md`
- `backend/prompts/templates/writing-nearby-card-analyze.md`
