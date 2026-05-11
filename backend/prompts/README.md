# backend/prompts

这里存放后端内置、由代码直接消费的 Prompt 相关代码和模板。

边界：
- 这里只放仓库内置模板，不放用户可配置 prompt
- 用户配置的全局 / 世界 / 角色 / 玩家 / Prompt 条目仍然存于 `data/config.json` 和 SQLite
- `assembler.js` / `entry-matcher.js` / `nearby-prompt.js` / `nearby-card-prompt.js` / `prompt-loader.js` 与模板同属 `backend/prompts/`
- 模板统一通过 `backend/prompts/prompt-loader.js` 从 `backend/prompts/templates/` 读取

目录约定：
- 根目录：提示词相关代码
- `templates/`：平铺的 `.md` 模板文件，用文件名前缀区分用途

## 代码文件

- `assembler.js`
  负责聊天 / 写作 prompt 的 14 段组装顺序，是运行时拼装器，不是模板文件。
- `entry-matcher.js`
  负责 Prompt 条目命中判断，会调用 `entry-preflight-*.md` 做 LLM 预判。
- `nearby-prompt.js`
  写作模式下，构建嵌入 `combined-state-updater` 主提示词的 nearby pool 段；chat 模式不参与。
- `nearby-card-prompt.js`
  写作模式"附近"角色制卡时，构建 `analyzeNearbyForCard` 用的 LLM 提示词；调用方：`backend/services/nearby-card-maker.js`。
- `prompt-loader.js`
  负责读取 `templates/*.md`，并做 `{{变量}}` 替换。

## 模板文件

### Prompt 条目命中判断

- `templates/entry-preflight-system.md`
  Prompt 条目触发判断的 system prompt，要求模型只返回命中的编号数组。
  调用方：`backend/prompts/entry-matcher.js`
- `templates/entry-preflight-user.md`
  Prompt 条目触发判断的 user prompt，喂给模型“近期对话 + 条目 description 列表”。
  调用方：`backend/prompts/entry-matcher.js`

### 记忆与摘要

- `templates/memory-turn-summary.md`
  每轮对话结束后，为 `turn_records.summary` 生成摘要的 prompt。
  调用方：`backend/memory/turn-summarizer.js`
- `templates/memory-turn-summary-with-ltm.md`
  长期记忆开启时使用的 turn 摘要 prompt 变体；同时要求模型抽取若干条长期记忆条目。
  调用方：`backend/memory/turn-summarizer.js`
- `templates/memory-long-term-compress.md`
  长期记忆条目超出阈值后，将多条记忆合并/压缩的 prompt。
  调用方：`backend/services/long-term-memory.js`
- `templates/memory-expand-system.md`
  记忆展开 preflight 的 system prompt，要求模型只返回 JSON。
  调用方：`backend/memory/summary-expander.js`
- `templates/memory-expand-user.md`
  记忆展开 preflight 的 user prompt，喂给模型“近期对话 + 召回摘要”。
  调用方：`backend/memory/summary-expander.js`

### 标题生成

- `templates/memory-title-generation.md`
  根据前几条对话生成会话标题的 prompt。
  调用方：`backend/memory/summarizer.js`
- `templates/memory-title-generation-retry.md`
  生成会话标题失败时的重试 prompt。
  调用方：`backend/memory/summarizer.js`
- `templates/memory-retitle-generation.md`
  基于完整上下文重新生成标题的 prompt，用于手动 retitle。
  调用方：`backend/routes/chat.js`
- `templates/writing-chapter-title-generation.md`
  写作模式按章节分组后生成章节标题的 prompt。
  调用方：`backend/memory/chapter-title-generator.js`
- `templates/writing-chapter-title-generation-retry.md`
  写作章节标题生成失败时的重试 prompt。
  调用方：`backend/memory/chapter-title-generator.js`
- `templates/writing-nearby-card-analyze.md`
  写作模式"附近"角色制卡的 LLM 提示词模板，输出 `{ system_prompt, description, first_message }` JSON。
  调用方：`backend/prompts/nearby-card-prompt.js`（被 `backend/services/nearby-card-maker.js` 使用）

### 状态更新与压缩

- `templates/state-update.md`
  会话结束后批量更新世界 / 玩家 / 角色状态的 prompt。
  调用方：`backend/memory/combined-state-updater.js`
- `templates/state-compress.md`
  状态字段（text / list 等）超出 token 阈值时的压缩 prompt。
  调用方：`backend/memory/combined-state-updater.js`

### 用户操作辅助

- `templates/chat-impersonate.md`
  “代拟用户下一句话”的 prompt，聊天与写作模式共用此模板。
  调用方：`backend/routes/chat.js`、`backend/routes/writing.js`
- `templates/continue-user-instruction.md`
  续写（continue）操作时附加给模型的指令片段，提示模型按既有语气延续而非重起一段。
  调用方：`backend/routes/stream-helpers.js`
- `templates/shared-suggestion.md`
  选项生成功能的后置 prompt，要求模型在正文末尾输出 `<next_prompt>` 选项块。
  调用方：`backend/prompts/assembler.js`
- `templates/shared-suggestion-fallback.md`
  当主回复未以 `</next_prompt>` 结尾时，交给副模型补齐 `<next_prompt>` 选项块的兜底 prompt。
  调用方：`backend/services/chat.js`

### 其他

- `templates/diary-generation.md`
  生成角色日记的 prompt。
  调用方：`backend/memory/diary-generator.js`
