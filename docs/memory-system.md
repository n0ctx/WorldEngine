# 记忆系统

本文说明 WorldEngine 如何让 AI 在长期对话中保持对历史剧情的感知，以及记忆数据如何随消息操作同步回滚。

---

## 三个记忆层次

### 1. Turn Record（轮次摘要）

Turn Record 是记忆系统的基础数据单元。每轮 AI 回复完成后，后台异步生成一条 **10–50 字的摘要**，同时建立向量 embedding（文本向量化）。

生成是**异步的**，不阻塞对话流程：

```
AI 回复 → SSE done → 消息写入 DB → 异步队列入队
                                   ├─ 优先级 2：状态栏更新
                                   └─ 优先级 3：turn record 生成（摘要 + embedding）
```

Turn Record 存储在 `turn_records` 表，包含：
- 摘要文本
- 向量 embedding（存入 `turn_summaries.json`，内存索引）
- 关联的 session 和 round（轮次序号）
- 长期记忆快照（用于回滚，见下文）

### 2. 向量召回

每次发送新消息时，系统对当前用户输入做语义搜索，从所有历史 turn record 的 embedding 中找最相近的几条，注入提示词的 [9] 段。

**召回阈值**（余弦相似度）：

| 范围 | 默认阈值 | 默认开启 |
|---|---|---|
| 同 session | 0.72 | 是 |
| 跨 session（同世界内） | 0.84 | 否（可在设置中开启） |

召回结果用于让 AI"想起"当前场景语义相关的历史片段，即使那些片段已经超出了上下文历史窗口。

### 智能展开

召回到摘要后，`decideExpansion` 进一步判断某些摘要是否值得展开成原始对话内容（完整的 AI 回复原文）。判断由副模型完成（二值化 JSON 输出），展开后注入提示词 [10] 段。

这让 AI 在需要时可以"精确回忆"某轮的完整内容，而不是只有摘要的模糊印象。

### 3. 长期记忆

长期记忆是从 turn record 摘要中提炼的持久化文档，存储在磁盘文件 `data/long_term_memory/{sessionId}/memory.md`。

**写入机制**：在 turn record 生成完成后，后台 LLM 判断是否需要把本轮的关键信息追加到 `memory.md`（而非每轮都写入）。文件内容按时间追加，定期压缩精简。

**注入时机**：每次组装提示词时，若 `long_term_memory_enabled` 开启且文件非空，内容注入提示词 [8.5] 段。

---

## 记忆与消息操作的同步

当用户编辑历史消息、删除消息或重新生成（regenerate）时，记忆数据需要同步回滚到截断点之前的状态。

### 回滚机制

**Turn Record 截断**：`deleteTurnRecordsAfterRound` 删除截断轮次之后的所有 turn record，同时对应的 embedding 从内存向量索引中移除。

**长期记忆回滚**：每条 turn record 在创建时会保存一份当时的 `long_term_memory_snapshot`（磁盘文件的完整快照）。回滚时，取截断后剩余的最末 turn record 的快照，覆盖 `memory.md`：

```
编辑消息 / 删除 / regenerate
  └─ waitForQueueIdle()（等待当前异步任务完成）
       └─ 截断消息和 turn record
            └─ restoreLtmFromTurnRecord(sessionId, lastRecord)
                 ├─ lastRecord 有快照 → 覆盖 memory.md
                 ├─ R=0（无任何 turn record）→ 清空 memory.md
                 └─ 快照字段为 NULL（旧数据升级兼容）→ 保持文件不动
```

这确保了记忆文档始终与当前消息历史保持一致，不会出现"消息已撤销但记忆仍然保留该内容"的错位。

### 并发屏障

所有触发记忆写操作的路径（regenerate / 编辑消息 / 删除消息）都先调用 `waitForQueueIdle(sessionId)`，等待同一会话的异步队列全部完成，再执行截断。这避免了"正在生成摘要时消息已被删除"的竞态条件。

---

## 向量索引

Turn record 的 embedding 存储在 `data/vectors/turn_summaries.json`，服务启动时加载到内存。会话删除时，对应的所有 embedding 通过清理钩子从索引中移除。

Embedding 模型可配置：
- OpenAI Embeddings（`text-embedding-3-small` 等，需要 API Key）
- Ollama 本地 Embeddings（无需 API Key，速度取决于本地硬件）
- 未配置时：向量索引功能静默降级，召回不工作，但摘要仍然生成

---

## 日记系统

日记是独立于 turn record 的角色视角记录，由后台 LLM 以角色或玩家的口吻书写。

**触发**：每轮对话后异步生成（优先级 4，可丢弃）。
**注入**：用户在对话页手动选择将某条日记注入当前轮次，内容进入提示词 [11] 段，仅生效一次。

日记支持两种时间模式：
- **真实日期**：使用系统日期
- **虚拟日期**：由用户定义世界内的时间计量

---

## 关键文件

| 文件 | 职责 |
|---|---|
| `backend/memory/recall.js` | 状态/时间线/摘要渲染，向量召回入口 |
| `backend/memory/turn-summarizer.js` | createTurnRecord，摘要生成，长期记忆快照写入 |
| `backend/memory/summarizer.js` | 会话标题生成 |
| `backend/memory/summary-expander.js` | 智能展开决策（decideExpansion） |
| `backend/memory/diary-generator.js` | 日记正文生成 |
| `backend/utils/turn-summary-vector-store.js` | turn record embedding 内存索引，双阈值搜索 |
| `data/long_term_memory/{sessionId}/memory.md` | 长期记忆磁盘文件 |
| `data/vectors/turn_summaries.json` | turn record embedding 持久化索引 |
