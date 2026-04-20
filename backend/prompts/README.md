# backend/prompts

这里存放后端内置、由代码直接消费的 LLM prompt 模板。

边界：
- 这里只放仓库内置模板，不放用户可配置 prompt
- 用户配置的全局 / 世界 / 角色 / 玩家 / Prompt 条目仍然存于 `data/config.json` 和 SQLite
- `assembler.js` / `entry-matcher.js` / `prompt-loader.js` 与模板同属 `backend/prompts/`
- 模板统一通过 `backend/prompts/prompt-loader.js` 从 `backend/prompts/templates/` 读取

目录约定：
- 根目录：提示词相关代码
- `templates/memory/`：摘要、标题、记忆展开
- `templates/entries/`：Prompt 条目命中 preflight
- `templates/state/`：状态更新
- `templates/chat/`：聊天空间专用 prompt
- `templates/writing/`：写作空间专用 prompt
- `templates/shared/`：跨模式共享模板

当前映射：
- `templates/memory/turn-summary.md` → `backend/memory/turn-summarizer.js`
- `templates/memory/title-generation.md` → `backend/memory/summarizer.js`
- `templates/memory/retitle-generation.md` → `backend/routes/chat.js`
- `templates/memory/expand/system.md` + `templates/memory/expand/user.md` → `backend/memory/summary-expander.js`
- `templates/entries/preflight-system.md` + `templates/entries/preflight-user.md` → `backend/prompts/entry-matcher.js`
- `templates/state/update.md` → `backend/memory/combined-state-updater.js`
- `templates/chat/impersonate.md` → `backend/routes/chat.js`
- `templates/writing/impersonate.md` → `backend/routes/writing.js`
- `templates/shared/suggestion.md` → `backend/prompts/assembler.js`
