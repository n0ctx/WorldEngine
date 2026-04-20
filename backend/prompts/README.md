# backend/prompts

这里存放后端内置、由代码直接消费的 Prompt 相关代码和模板。

边界：
- 这里只放仓库内置模板，不放用户可配置 prompt
- 用户配置的全局 / 世界 / 角色 / 玩家 / Prompt 条目仍然存于 `data/config.json` 和 SQLite
- `assembler.js` / `entry-matcher.js` / `prompt-loader.js` 与模板同属 `backend/prompts/`
- 模板统一通过 `backend/prompts/prompt-loader.js` 从 `backend/prompts/templates/` 读取

目录约定：
- 根目录：提示词相关代码
- `templates/`：平铺的 `.md` 模板文件，用文件名前缀区分用途

代码文件：
- `assembler.js`
  负责聊天 / 写作 prompt 的 16 段组装顺序，是运行时拼装器，不是模板文件。
- `entry-matcher.js`
  负责 Prompt 条目命中判断，会调用 `entry-preflight-*.md` 做 LLM 预判。
- `prompt-loader.js`
  负责读取 `templates/*.md`，并做 `{{变量}}` 替换。

模板文件：
- `templates/memory-turn-summary.md`
  每轮对话结束后，为 `turn_records.summary` 生成摘要的 prompt。
  调用方：`backend/memory/turn-summarizer.js`
- `templates/memory-title-generation.md`
  根据前几条对话生成会话标题的 prompt。
  调用方：`backend/memory/summarizer.js`
- `templates/memory-retitle-generation.md`
  基于完整上下文重新生成标题的 prompt，用于手动 retitle。
  调用方：`backend/routes/chat.js`
- `templates/memory-expand-system.md`
  记忆展开 preflight 的 system prompt，要求模型只返回 JSON。
  调用方：`backend/memory/summary-expander.js`
- `templates/memory-expand-user.md`
  记忆展开 preflight 的 user prompt，喂给模型“近期对话 + 召回摘要”。
  调用方：`backend/memory/summary-expander.js`
- `templates/entry-preflight-system.md`
  Prompt 条目触发判断的 system prompt，要求模型只返回命中的编号数组。
  调用方：`backend/prompts/entry-matcher.js`
- `templates/entry-preflight-user.md`
  Prompt 条目触发判断的 user prompt，喂给模型“近期对话 + 条目 description 列表”。
  调用方：`backend/prompts/entry-matcher.js`
- `templates/state-update.md`
  会话结束后批量更新世界 / 玩家 / 角色状态的 prompt。
  调用方：`backend/memory/combined-state-updater.js`
- `templates/chat-impersonate.md`
  聊天模式下“代拟用户下一句话”的 prompt。
  调用方：`backend/routes/chat.js`
- `templates/writing-impersonate.md`
  写作模式下“代拟玩家下一句话”的 prompt。
  调用方：`backend/routes/writing.js`
- `templates/shared-suggestion.md`
  选项生成功能的后置 prompt，要求模型在正文末尾输出 `<next_prompt>` 选项块。
  调用方：`backend/prompts/assembler.js`
