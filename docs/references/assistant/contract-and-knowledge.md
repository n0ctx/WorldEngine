# Assistant Contract And Knowledge

CONTRACT 注入、知识文件路由与 `read_file` 工具定位。

## 当前知识文件

- `assistant/knowledge/CONTRACT.md`：父代理每轮自动注入
- `assistant/knowledge/WORLDCARD.md`
- `assistant/knowledge/CHARCARD.md`
- `assistant/knowledge/USERCARD.md`
- `assistant/knowledge/GLOBALPROMPT.md`
- `assistant/knowledge/CSSSNIPPET.md`
- `assistant/knowledge/REGEXRULE.md`
- `assistant/knowledge/THEME.md`（写卡助手写主题包：`/data/themes/<id>/theme.json + theme.css`，内置主题 update 时自动 fork 到 user 层）

## 使用规则

- 子代理按 `task.targetType` 注入对应知识文件
- CONTRACT 与知识文件描述的是行为边界，不替代代码层校验
- `read_file` 是兜底查询工具，只在知识文件与 preview 不足以确认事实时使用

## 相关真源

- 父代理 prompt：`assistant/prompts/parent-agent.md`
- 子代理 prompt：`assistant/prompts/sub-agent.md`
- read_file 工具：`assistant/server/tools/project-reader.js`

## 相关代码文件

- `assistant/knowledge/CONTRACT.md`
- `assistant/prompts/parent-agent.md`
- `assistant/prompts/sub-agent.md`
- `assistant/server/tools/project-reader.js`
