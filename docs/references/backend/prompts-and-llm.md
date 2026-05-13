# Backend Prompts And LLM

prompt 组装顺序、provider 分工与模型调用边界。

## 真源文件

- `backend/prompts/assembler.js`：chat / writing prompt 顺序权威来源
- `backend/prompts/entry-matcher.js`：Prompt 条目命中逻辑
- `backend/prompts/templates/`：后处理与子任务模板
- `backend/llm/index.js`：统一 `chat()` / `complete()` 出口
- `backend/llm/providers/*`：provider 私有实现

## 调用边界

- 对话与写作主生成走流式 `llm.chat()`
- 摘要、状态更新、章节标题、日记、memory 压缩等后处理走非流式 `llm.complete()`
- 两类调用不可混用；新增能力时先判断它属于“主输出”还是“后处理”

## Prompt 层级

- 全局 → 世界 → 角色 / persona → 会话
- 下层不能覆盖上层语义，只能追加或在允许的覆盖字段上回退
- 世界级生成参数优先于全局；字段为 `NULL` 时回退全局

## Provider 约束

- 新增 provider 时，上层只感知统一 `chat/complete`
- provider 私有逻辑放 `backend/llm/providers/`
- 公共缓存、重试、thinking 兼容层放 `backend/llm/providers/_shared/` 或 provider 自身目录
- 对兼容 OpenAI 的 provider，不要把 provider 私有参数泄漏到上层业务代码

## 相关代码文件

- `backend/prompts/assembler.js`
- `backend/prompts/entry-matcher.js`
- `backend/llm/index.js`
- `backend/llm/providers/openai-compatible/`
