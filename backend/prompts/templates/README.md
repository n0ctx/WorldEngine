# templates

后端内置 prompt 模板统一放在这里，由 `../prompt-loader.js` 读取。

这里不再按子目录分组，直接平铺 `.md` 文件。
通过文件名前缀区分用途：
- `memory-*`
- `entry-*`
- `state-*`
- `chat-*`
- `writing-*`
- `shared-*`

文件说明：
- `memory-turn-summary.md`
  生成轮次目录索引行（scene / cast / summary）的模板。
- `memory-middle-summary.md`
  中期剧情摘要整理模板：已整理的事件 + 进行中事件的逐轮记录 → 已经结束的事件，或「未完」。
- `memory-title-generation.md`
  生成会话标题的模板。
- `memory-retitle-generation.md`
  手动重命名标题时使用的标题模板。
- `memory-recall-system.md`
  长期记忆召回的 system 模板：固定说明 + 历史轮次目录。
- `memory-recall-user.md`
  长期记忆召回的 user 模板：近期对话 + 输出要求。
- `entry-preflight-system.md`
  判断 Prompt 条目是否命中的 system 模板。
- `entry-preflight-user.md`
  判断 Prompt 条目是否命中的 user 模板。
- `state-update.md`
  批量更新世界 / 玩家 / 角色状态并写入状态记忆的模板。
- `chat-impersonate.md`
  聊天模式和写作模式共用的代拟用户输入的模板。
- `chat-suggestion.md`
  对话模式生成 `<next_prompt>` 选项块的模板：选项是玩家第一人称的对白和（动作）。
- `writing-suggestion.md`
  写作模式生成 `<next_prompt>` 选项块的模板：选项是不带主语的动作，可带一句台词。
- `shared-suggestion-fallback.md`
  当主回复末尾未正确闭合 `</next_prompt>` 时，用副模型补齐 `<next_prompt>` 选项块的兜底模板。
