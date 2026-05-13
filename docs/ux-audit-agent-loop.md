# 写卡助手 Agent Loop 架构 UX 审计报告

> 审计范围：父代理编排 → 子代理执行 → apply 落库 → SSE 流式 → 前端状态机全链路  
> 审计视角：从用户实际体验出发，关注数据丢失、任务卡死、误导性反馈、交互阻塞等问题  
> 时间：2026-05-13

---

## 一、硬伤（直接影响用户体验，可能导致数据丢失、任务卡死、或误导性反馈）

### 1. 计划文档解析脆弱 — `parsePlanDoc` 依赖严格正则

| 项 | 内容 |
|---|---|
| **位置** | `assistant/server/plan-doc.js:88-123` |
| **问题** | `STEP_RE` 使用全角括号 `（）` 精确匹配步骤行。LLM 在 `edit_plan_doc` 时可能输出半角括号、多余空格或换行不规范，导致解析失败。 |
| **体验影响** | 用户审批计划后，助手报错 "step not found" 或完全卡住不执行，计划文档"有内容但无动作"。 |
| **建议修复** | 解析器增加容错：兼容半角括号、忽略多余空格、对不匹配行降级处理而非整份失效。 |

---

### 2. 计划编辑丢失用户意图 — `replace_steps` 清空 `intent` / `assumptions`

| 项 | 内容 |
|---|---|
| **位置** | `assistant/server/tools/meta/runtime.js:96-103` |
| **问题** | 父代理调用 `edit_plan_doc(replace_steps)` 时，重新渲染的 plan doc 把 `intent` 硬编码为空字符串、`assumptions` 硬编码为空数组。 |
| **体验影响** | 多轮对话中修改计划时，原始需求上下文丢失，父代理后续轮次"忘记"用户最初目标，执行偏离。 |
| **建议修复** | `replace_steps` 时保留原 parsed 的 `intent` 和 `assumptions`，仅替换 steps 部分。 |

---

### 3. "claimed execution" 检测误伤正常解释

| 项 | 内容 |
|---|---|
| **位置** | `assistant/server/parent-agent.js:270-279` |
| **问题** | `ACTION_CLAIM_RE` 匹配 "派发子代理\|dispatch_subagent\|调用子代理\|..." 等关键词。用户正常询问 "什么是子代理" 或 "解释 dispatch 流程" 时，回答中包含这些词即被误判。 |
| **体验影响** | 正常问答/复盘请求被系统强制暂停，用户看到 "没有拿到真实的子代理执行记录"，感到困惑。 |
| **建议修复** | 检测前增加条件：仅当本轮实际存在**未完成的工具调用意图**时才启用，或排除纯解释性场景。 |

---

### 4. 子代理总结硬截断 400 字符，关键错误信息丢失

| 项 | 内容 |
|---|---|
| **位置** | `assistant/server/sub-agent.js:228` |
| **问题** | 子代理返回文本被 `slice(0, 400)` 截断，400 字后的关键错误信息（如 "字段 X 不存在，需先创建"）丢失。 |
| **体验影响** | 父代理在失败场景中基于不完整信息反复做出相同错误决策，用户感觉 "助手听不懂话"。 |
| **建议修复** | 截断改为智能摘要（保留错误类型和修复建议），或提高上限至 1200 字符。 |

---

### 5. 重复创建同类型资源的检测过于粗暴

| 项 | 内容 |
|---|---|
| **位置** | `assistant/server/tools/meta/runtime.js:150-159` |
| **问题** | 同一轮内已 create 过某 `targetType` 后，再次 dispatch 会被拦截，除非父代理显式带 `force:true`。但 `force` 完全由父代理判断，用户无直接控制权。 |
| **体验影响** | 用户明确说 "再创建一个角色" 时，父代理可能漏加 `force:true`，导致助手拒绝执行或谎报完成。 |
| **建议修复** | 拦截提示中附带用户意图判断：若用户消息包含明确的"再/另/还/也+创建"语义，自动放行或提示用户确认。 |

---

### 6. 任务恢复可能"串台" — `getLatestRecoverableTask` 全局取最新

| 项 | 内容 |
|---|---|
| **位置** | `assistant/server/task-store.js:317-330` |
| **问题** | 恢复逻辑按 `updatedAt` 取全局最新可恢复任务，不区分世界/角色上下文。 |
| **体验影响** | 用户在 A 世界开助手后切到 B 世界，B 世界的操作把 A 世界的任务顶掉；A 世界面板恢复时拿到 B 世界的对话和计划，极易误操作。 |
| **建议修复** | 恢复时优先匹配 `context.worldId` / `context.characterId` 与当前前端上下文一致的任务。 |

---

### 7. apply 成功判定过于宽松，存在静默失败风险

| 项 | 内容 |
|---|---|
| **位置** | `assistant/server/tools/adapter.js:62` |
| **问题** | `const success = !(result && result.ok === false);` 意味着只要不是显式 `{ok: false}` 都算成功。apply 工具抛异常后被 catch 返回字符串/非标准对象时，前端显示绿色完成。 |
| **体验影响** | 用户看到 "写入世界卡完成"，刷新主界面发现毫无变化，对助手信任感崩塌。 |
| **建议修复** | apply 工具统一返回 `{success: boolean, error?, ...}` 标准格式，adapter 严格校验 `success === true`。 |

---

### 8. `edit_plan_doc` 的 `replace_steps` 未校验新生成步骤格式

| 项 | 内容 |
|---|---|
| **位置** | `assistant/server/tools/meta/runtime.js:75-103` |
| **问题** | 模型生成的 steps 数组直接拼接渲染，未经过 `validatePlanDoc`。缺少 `targetType` / `operation` 的步骤会污染 plan doc。 |
| **体验影响** | 用户审批后修改计划，计划变得不可执行，后续 `dispatch_subagent` 报错或执行错误步骤。 |
| **建议修复** | `replace_steps` 渲染后调用 `validatePlanDoc()`，校验失败则拒绝替换并返回具体错误。 |

---

## 二、需要优化的功能逻辑问题

### 9. 滚动行为打断用户阅读

| 项 | 内容 |
|---|---|
| **位置** | `assistant/client/MessageList.jsx:397-406` |
| **问题** | `messages.length` 变化即触发 `scrollIntoView({ behavior: 'smooth' })`。用户正在上翻看历史消息或计划文档时，tool_call/step 完成事件强制滚到底部。 |
| **建议** | 检测用户是否手动向上滚动，若滚动位置距底部 > 200px 则显示 "↓ 新消息" 提示，而非强制滚动。 |

---

### 10. 上下文摘要可能丢失关键约束

| 项 | 内容 |
|---|---|
| **位置** | `assistant/server/parent-agent.js:170-221` |
| **问题** | 消息超过 8 条或 24000 字符时触发 LLM 摘要，只保留 "6 行以内" 概括。用户在某一轮确认的特定字段值、ID、命名约定可能被省略。 |
| **建议** | 摘要前先做规则提取：把用户明确确认过的关键决策点（如 "字段名必须用 xxx"、"目标世界 ID 是 yyy"）以结构化片段附加到摘要后。 |

---

### 11. 父代理一轮只能调一个工具，复杂任务步数爆炸

| 项 | 内容 |
|---|---|
| **位置** | `assistant/prompts/parent-agent.md:16-18` |
| **问题** | prompt 要求 "每一轮要么调一个工具往前推一步"。常规 preview → list → apply 至少需要 3 轮（3 次 LLM 调用），延迟线性增长。 |
| **建议** | 考虑允许 "读取类工具" 在同轮内链式调用（如先 preview 再 dispatch），或给父代理一个 `batch_read` 工具减少往返。 |

---

### 12. `awaiting_approval` 阶段前端 `isStreaming` 仍为 true

| 项 | 内容 |
|---|---|
| **位置** | `assistant/client/AssistantPanel.jsx:365` |
| **问题** | 虽然 `pendingAssistant` 条件已限制省略号，但 `isStreaming` 在 awaiting_approval 期间仍为 true（SSE 连接保持），发送按钮一直显示 "停止"。 |
| **建议** | `isStreaming` 应精确反映 "LLM 正在生成 token"，计划审批挂起时立即置为 false。 |

---

### 13. 停止按钮的本地状态与后端可能不一致

| 项 | 内容 |
|---|---|
| **位置** | `assistant/client/AssistantPanel.jsx:329-339` |
| **问题** | `handleStop` 先 abort 本地 SSE，再异步 `cancelTask`，最后本地注入 `TASK_CANCELLED`。若 cancel 请求延迟，后端可能已发送 `TASK_COMPLETED`，但前端已用 `TASK_CANCELLED` 覆盖。 |
| **建议** | 取消操作等待后端确认，或设计为 "请求取消" 状态，以后端最终事件为准。 |

---

### 14. 子代理 `preview` 闸门在跨步骤场景下重复工作

| 项 | 内容 |
|---|---|
| **位置** | `assistant/server/sub-agent.js:145-168` |
| **问题** | 每个子代理实例独立跟踪 `previewedThisRun`。同一实体的多个 update 步骤需重复 preview，增加延迟和 token 消耗。 |
| **建议** | 在父代理级别缓存同一实体的 preview 结果（TTL 30 秒），子代理命中缓存时跳过 preview。 |

---

### 15. `detectPlanFirstPolicy` 对"展示/查看"类词汇误判

| 项 | 内容 |
|---|---|
| **位置** | `assistant/server/parent-agent.js:130-168` |
| **问题** | `COMPREHENSIVE_RE` 包含 "完整\|完善\|优化整体\|整体优化"，用户说 "完整地展示一下我的角色卡" 会被误判为复杂任务。 |
| **建议** | comprehensive 检测前增加排除词："展示\|查看\|显示\|告诉我\|给我看看" 等纯查询动词。 |

---

### 16. `finalize_task` 工具被注册后又过滤，父代理困惑

| 项 | 内容 |
|---|---|
| **位置** | `assistant/server/parent-agent.js:326-327` |
| **问题** | `buildMetaTools` 包含 `finalize_task`，但 `buildToolRegistry` 显式过滤。若 prompt 提到该工具名，父代理调用时报 "工具未定义"。 |
| **建议** | 彻底移除 `finalize_task` 定义，或保留并弃用 `reply_to_user`（二选一）。 |

---

### 17. 多标签页场景下 `pendingUserMessages` 竞态

| 项 | 内容 |
|---|---|
| **位置** | `assistant/server/routes.js:57-133`、`assistant/server/task-store.js:534-550` |
| **问题** | 标签页 A 和 B 同时连接同一任务的 SSE，`queueUserMessage` 会把消息写入共享任务状态，B 页可能意外消费 A 页消息。 |
| **建议** | 任务级消息队列与连接/session 绑定，或前端在恢复时校验消息是否来自当前会话上下文。 |

---

### 18. plan doc 的 `createdAt` 在 edit 时被篡改为当前时间

| 项 | 内容 |
|---|---|
| **位置** | `assistant/server/tools/meta/runtime.js:98-99` |
| **问题** | 每次 `replace_steps` 都把 `createdAt` 设为 `new Date().toISOString()`，plan doc 看起来像是"刚新建"而非"持续编辑"。 |
| **建议** | 保留原始 `createdAt`，新增 `updatedAt` 字段反映编辑时间。 |

---

### 19. 错误恢复消息过于技术化

| 项 | 内容 |
|---|---|
| **位置** | `assistant/server/parent-agent.js:412-432` |
| **问题** | 空回复/声称执行/模型错误时的恢复消息使用"模型调用"、"子代理执行记录"等术语。 |
| **建议** | 改为更友好的文案，如 "刚才处理时出了点问题，但上下文已保留，请继续告诉我你的需求。" |

---

### 20. 缺少"计划步骤执行进度"的可视化

| 项 | 内容 |
|---|---|
| **位置** | `assistant/client/MessageList.jsx` |
| **问题** | plan doc 以静态 Markdown 显示，用户无法直观看到 "第 3 步已完成，第 4 步正在执行"。步骤状态散落在消息流中，需手动对应。 |
| **建议** | `PlanDocViewer` 渲染时把 `[ ]` / `[x]` 动态高亮，或增加微型进度指示器（如 "3/7 已完成"）。 |

---

## 三、优先级总览

| 优先级 | 数量 | 核心场景 |
|--------|------|----------|
| **P0 — 立即修复** | 8 项 | 计划解析、意图丢失、误伤检测、信息截断、创建拦截、任务串台、静默失败、步骤格式未校验 |
| **P1 — 近期优化** | 12 项 | 滚动打断、摘要丢失、高延迟、状态不一致、重复 preview、误判词汇、工具混淆、消息竞态、时间戳混乱、文案技术化、缺少进度可视化 |

---

## 四、总体评估

当前架构在 **单会话、单世界、线性执行** 的场景下运行稳健，SSE 流式渲染、断点续传、工具事件透传等核心链路设计合理。但在以下边缘场景存在明显 UX 裂口：

1. **计划审批流**（问题 1、2、8、18、20）：plan doc 的解析、编辑、展示是用户最直观感知的交互，任何格式脆弱或信息丢失都会直接破坏信任。
2. **多世界/多标签页**（问题 6、17）：任务恢复和消息队列缺少上下文隔离，易造成"串台"。
3. **失败恢复**（问题 3、4、7、19）：检测误伤和信息截断会让用户在已有挫败感时遭遇二次困惑。

建议优先集中修复 P0 项，尤其是计划文档相关的解析与编辑逻辑，因为这是 agent loop 中用户参与度最高的环节。
