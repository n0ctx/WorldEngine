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
  生成每轮 turn summary 的摘要模板。
- `memory-title-generation.md`
  生成会话标题的模板。
- `memory-retitle-generation.md`
  手动重命名标题时使用的标题模板。
- `memory-expand-system.md`
  决定哪些历史记忆需要展开原文的 system 模板。
- `memory-expand-user.md`
  决定哪些历史记忆需要展开原文的 user 模板。
- `entry-preflight-system.md`
  判断 Prompt 条目是否命中的 system 模板。
- `entry-preflight-user.md`
  判断 Prompt 条目是否命中的 user 模板。
- `state-update.md`
  批量更新世界 / 玩家 / 角色状态的模板。
- `chat-impersonate.md`
  聊天模式和写作模式共用的代拟用户输入的模板。
- `shared-suggestion.md`
  生成 `<next_prompt>` 选项块的共享模板。
