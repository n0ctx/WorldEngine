# 写卡助手 Harness 专项审计报告

> 审计范围：`assistant/` 全目录（server + client + prompts + tests）
> 审计日期：2026-04-25
> 审计维度：Agent 智能度、任务完成度、边缘情况处理能力
> 测试状态：38/38 通过 ✅

---

## 一、执行摘要

写卡助手采用**主代理 + 6 个执行子代理**的 tool-use 架构，通过 `resolveToolContext` 实现研究阶段、通过 `completeWithTools` 实现执行阶段。整体架构设计成熟，职责分离清晰，服务端归一化器（`normalizeProposal`）构成了强力的安全边界。但在**错误静默丢弃、上下文截断、子代理创造性不足、复杂多域请求拆分**等维度存在可改进空间。

| 维度 | 评分 | 说明 |
|------|------|------|
| Agent 智能度 | 7.5/10 | 三步工作流清晰，但主代理无多轮研究能力，子代理 temperature=0 过于僵硬 |
| 任务完成度 | 8.0/10 | 端到端链路完整，但存在静默过滤、UNIQUE 错误静默忽略等问题 |
| 边缘情况处理 | 7.0/10 | JSON 重试、条件歧义检测优秀；但空 proposal、过期 token、字段冲突处理有漏洞 |
| **综合** | **7.5/10** | 生产可用，但需修复 3 个高优先级问题 |

---

## 二、架构速览

```
用户消息
    ↓
[main-agent.js] runAgent()
    ├── system prompt (main.md + buildContextString)
    ├── history (最近16轮，每轮最多2000字符)
    └── 阶段1: resolveToolContext(tools, temperature=0)  ← 研究+分发
              ├── preview_card / read_file (读取类工具，触发 SSE tool_call)
              └── world_card_agent / character_card_agent / ... (执行子代理)
                    ├── buildAgentMessages() → system + user 分离
                    ├── completeWithTools(tools=[read_file, preview_card], temperature=0)
                    ├── extractJson() ← 剥离 think 块、代码块、多候选扫描
                    ├── 失败时 1 次重试
                    ├── normalizeProposal() ← 强守卫归一化
                    └── SSE: routing → thinking(5s心跳) → proposal/error
    └── 阶段2: llm.chat(temperature=0.8) ← 流式总结回复
```

---

## 三、Agent 智能度审计

### 3.1 主代理的调度智能

**优势：**
- `main.md` 设计了清晰的三步工作流：**研究 → 计划 → 分发**
- 严格禁止直接生成卡片内容、跳过研究、直接转述用户原话
- 通过 `preview_card` 预研后再分发，避免子代理在盲飞状态下生成
- 子代理工具定义中的 `description` 非常详细，包含操作类型、预研要求、职责边界

**不足：**

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| M1 | **单轮研究限制**：`resolveToolContext` 只执行一轮工具调用，主代理无法基于第一次 `preview_card` 的结果再次调用 `read_file` 深入研究 | `main-agent.js:76` | 复杂修改场景下研究深度受限 |
| M2 | **历史截断过于激进**：只保留最近 16 轮，每轮最多 2000 字符 | `main-agent.js:49-50` | 长对话中易丢失早期上下文，导致重复修改或矛盾 |
| M3 | **无自我纠错机制**：若主代理错误分发（如把角色修改请求发给 world_card_agent），没有检测和回滚机制 | 架构层面 | 可能生成无效提案，浪费 token |
| M4 | **多域请求拆分依赖 LLM 自觉**：提示词要求"拆分成多次调用"，但没有强制约束 | `main.md:139` | 弱模型可能一次只调用一个子代理，遗漏部分需求 |

### 3.2 子代理的执行智能

**优势：**
- 每个子代理的 prompt 都包含：职责边界、分层判断表、硬规则、正例/反例
- `buildAgentMessages()` 将 prompt 分离为 `system` + `user`，提升指令遵循率
- 子代理拥有 `read_file` 和 `preview_card` 工具，可自主补充缺失数据

**不足：**

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| S1 | **子代理温度过低**：`temperature: 0` 用于子代理的 completeWithTools | `agent-factory.js:92` | JSON 输出稳定，但写卡任务需要一定创造性（如文案润色），temperature=0 导致输出僵硬、模板化 |
| S2 | **单轮工具限制**：子代理也只执行一轮 `completeWithTools`，无法链式调用 | `agent-factory.js:92` | 若 `preview_card` 返回数据后还需进一步读取文件，子代理做不到 |
| S3 | **JSON 重试只有一次**：首次解析失败后追加纠错指令重试一次，若仍失败则直接抛错 | `agent-factory.js:96-106` | 对输出格式不稳定的模型容错不足 |

### 3.3 Prompt 工程质量

**优秀实践：**
- `world-card.md` 的分层判断表非常清晰（世界简介→description，世界背景→always 条目，动态值→stateFieldOps）
- `global-prompt.md` 的"跨世界通用"自检问题设计巧妙
- `regex-rule.md` 的 scope 决策矩阵（display_only/ai_output/user_input/prompt_only）实用

**风险点：**

| # | 问题 | 位置 |
|---|------|------|
| P1 | `character-card.md` 输出 Schema 模板包含 `position` 字段的反面教材，但无 `post_prompt` 的示例值 | `character-card.md:128-143` |
| P2 | `css-snippet.md` 和 `regex-rule.md` 的输出 Schema 不含 `type`/`operation`，与子代理实际接收的 locked 参数不一致，可能导致混淆 | `css-snippet.md:86-120` |
| P3 | `world-card.md` 的 `default_value` 示例使用了转义引号 `"\"序章\""`，实际子代理常输出不带转义的 `"序章"`，normalizeProposal 不做校验 | `world-card.md:195-201` |

---

## 四、任务完成度审计

### 4.1 端到端链路完整性

```
用户输入 → 主代理研究 → 子代理生成 → extractJson → normalizeProposal → SSE proposal → 前端预览 → 用户编辑(可选) → /execute → applyProposal → 数据库写入
```

整条链路完整，每个环节都有对应的守卫机制。

### 4.2 关键守卫机制评估

| 守卫层 | 机制 | 强度 | 备注 |
|--------|------|------|------|
| **LLM 层** | System prompt 约束 + 正例/反例 | 中 | 依赖模型遵循能力 |
| **JSON 层** | `extractJson`：think剥离、代码块提取、顶层对象扫描 | 强 | 处理了常见格式错误 |
| **重试层** | 1次 JSON 解析重试 | 中 | 对不稳定模型可能不够 |
| **归一化层** | `normalizeProposal`：类型锁定、operation校验、字段白名单、条件字段智能解析 | **强** | 核心安全边界 |
| **执行层** | `applyProposal`：敏感字段过滤（api_key）、UNIQUE错误捕获 | 中 | 存在静默忽略问题 |
| **前端层** | `editedProposal` 只覆盖内容，元信息锁定 | 强 | 防止用户篡改 type/entityId |

### 4.3 任务完成度缺陷

| # | 问题 | 位置 | 严重程度 |
|---|------|------|----------|
| T1 | **world-card changes 静默过滤**：`normalizeWorldChanges` 只 pick `name/description/temperature/max_tokens`，如果子代理错误输出 `system_prompt`/`post_prompt`，会被静默丢弃，用户和子代理都得不到反馈 | `routes.js:499-506` | 🔴 高 |
| T2 | **stateField UNIQUE 错误静默忽略**：`applyStateFieldCreate` 捕获 `UNIQUE constraint failed` 后 `throw` 被吞掉，子代理以为创建成功，实际未写入 | `routes.js:391-402` | 🔴 高 |
| T3 | **persona-card create 强制覆盖 target**：即使子代理输出 `target: "world"`，也会被强制改为 `persona` | `routes.js:318` | 🟡 中 |
| T4 | **空 proposal 可通过验证**：如果子代理返回无任何 changes/entryOps/stateFieldOps 的 proposal，`normalizeProposal` 不会拒绝 | `routes.js:429-496` | 🟡 中 |
| T5 | **character-card create 的 worldId 来源混乱**：优先使用 `worldRefId`（前序世界卡创建的分辨结果），其次使用 `entityId`。如果用户直接创建角色卡，entityId 必须包含 worldId，但主代理可能未正确传递 | `routes.js:267` | 🟡 中 |

---

## 五、边缘情况处理能力审计

### 5.1 优秀处理

| 场景 | 处理方式 | 位置 |
|------|----------|------|
| JSON 前带 think 块 | `stripLeadingThinkBlocks` 智能剥离，保留 JSON 字符串值内的 think | `extract-json.js:31-46` |
| 多个顶层 JSON 对象 | `collectTopLevelObjectSlices` 扫描所有候选，默认选 last | `extract-json.js:80-123` |
| state 条件字段歧义 | 同名 field_key/label 存在多个时抛出明确错误 | `routes.js:651-662` |
| state 条件字段模糊匹配 | 支持裸 field_key/label 自动归一到 `世界.xxx`/`玩家.xxx`/`角色.xxx` | `routes.js:628-665` |
| 过期 token | 返回 400 "提案已过期"，并从 store 删除 | `routes.js:161-167` |
| 缺失 world/character 上下文 | `preview_card` 返回用户友好错误 "请先选择一个世界" | `card-preview.js:99-101` |
| 子代理执行失败 | 返回 error SSE 事件，同时主代理继续流式回复 | `routes-integration.test.js:123-142` |
| 前端编辑越权 | `editedProposal` 的 type/operation/entityId 以 token 锚定为准 | `routes.js:170-182` |

### 5.2 边缘情况漏洞

| # | 场景 | 当前行为 | 期望行为 | 严重程度 |
|---|------|----------|----------|----------|
| E1 | **子代理连续两次 JSON 解析失败** | 抛错，返回 "执行失败" | 应降级为文本输出或更多重试 | 🟡 中 |
| E2 | **子代理输出数组顶层而非对象** | `extractJson` 抛出 "找不到 JSON 对象" | 正确行为，但可检测并给出更友好提示 | 🟢 低 |
| E3 | **proposalStore 内存泄漏（极端情况）** | 每 10 分钟 GC，但高频使用下 Map 可能膨胀 | 增加最大容量限制或 LRU | 🟢 低 |
| E4 | **用户编辑 proposal 后超过 30 分钟才点击应用** | token 过期，返回 400 | 应在前端显示倒计时或应用前刷新 token | 🟡 中 |
| E5 | **preview_card 返回巨大数据** | 直接 JSON.stringify，无截断 | 应限制返回数据大小，防止 context overflow | 🟡 中 |
| E6 | **read_file 超大文件** | 50KB 截断 | ✅ 已处理 | - |
| E7 | **同时修改 world-card 和 character-card** | 依赖主代理自觉拆分 | 如果主代理只调用了其中一个，需求被部分遗漏 | 🟡 中 |
| E8 | **state 条件引用了不存在的字段** | `resolveConditionField` 返回裸 input，无报错 | 应在运行时或验证时提示字段不存在 | 🟡 中 |
| E9 | **entryOps update 缺少 id** | `normalizeEntryOps` 抛出 "id 缺失" | ✅ 已处理 | - |
| E10 | **子代理输出非法 type（如 "string"）** | `normalizeStateFieldOps` 抛出 "type 非法" | ✅ 已处理 | - |
| E11 | **read_file 目录遍历攻击** | `path.resolve` + `startsWith` 检查 | ✅ 已处理（但 Windows 路径分隔符有隐患） | 🟢 低 |

---

## 六、测试覆盖度评估

### 6.1 现有测试（38 个，全部通过）

| 文件 | 测试数 | 覆盖范围 |
|------|--------|----------|
| `main-agent.test.js` | 6 | buildContextString、buildHistory、runAgent 流式、工具预检失败 |
| `agent-factory.test.js` | 4 | buildAgentMessages、JSON 重试、错误处理 |
| `routes.test.js` | 11 | normalizeProposal 各类型、字段过滤、条件归一、歧义检测 |
| `routes-integration.test.js` | 10 | /chat SSE、/execute 全类型、token 过期、editedProposal 锁定 |
| `card-preview.test.js` | 4 | 各 target 类型数据加载、条件返回、错误场景 |
| `extract-json.test.js` | 4 | think 剥离、多对象选择、边界错误 |

### 6.2 测试缺口

| 缺口 | 说明 | 建议优先级 |
|------|------|------------|
| **主代理的多轮 history 压力测试** | 16轮截断是否导致上下文丢失 | 🟡 中 |
| **子代理的温度敏感性测试** | temperature=0  vs 0.7 的输出质量对比 | 🟡 中 |
| **normalizeProposal 的空 proposal 测试** | 无任何 changes/ops 的输入应如何处理 | 🔴 高 |
| **applyProposal 的 UNIQUE 错误测试** | 验证重复 field_key 时是否应报错而非静默 | 🔴 高 |
| **端到端多域请求测试** | "改世界+改角色"的拆分执行 | 🟡 中 |
| **preview_card 大数据量测试** | 1000+ 条目/字段时的性能 | 🟢 低 |
| **前端 ChangeProposalCard 交互测试** | 编辑、条件添加、字段选择 | 🟡 中 |

---

## 七、修复建议（按优先级排序）

### 🔴 高优先级

1. **修复 stateField UNIQUE 错误静默忽略**
   - 位置：`routes.js:399-401`
   - 建议：捕获后记录 warn 日志并抛错，让子代理感知失败，或返回给前端提示

2. **修复 world-card changes 静默过滤**
   - 位置：`routes.js:499-506`
   - 建议：若子代理输出了 `system_prompt`/`post_prompt`，在 `normalizeWorldChanges` 中记录 warn，并在 explanation 中追加提示

3. **补充空 proposal 拒绝机制**
   - 位置：`routes.js:429-496`
   - 建议：`normalizeProposal` 完成后检查 `changes`/`entryOps`/`stateFieldOps` 全为空时抛错 "提案内容为空"

### 🟡 中优先级

4. **子代理 temperature 策略优化**
   - 位置：`agent-factory.js:92`
   - 建议：研究阶段（调用 preview_card/read_file）保持 `temperature: 0`，生成阶段（输出 JSON）提升至 `temperature: 0.3-0.5`，平衡稳定性与创造性

5. **主代理 history 截断优化**
   - 位置：`main-agent.js:49-50`
   - 建议：保留最近 16 轮，但优先保留包含 proposal/工具调用的关键轮次；或提升上限至 24 轮

6. **前端 token 过期预警**
   - 位置：`ChangeProposalCard.jsx`
   - 建议：显示提案剩余有效时间倒计时（如 "29 分钟后过期"）

7. **preview_card 大数据截断**
   - 位置：`card-preview.js`
   - 建议：条目/字段数量超过阈值时只返回摘要（如 "共 150 条，显示前 50 条"）

### 🟢 低优先级

8. **read_file Windows 路径安全**
   - 位置：`project-reader.js:24`
   - 建议：统一使用 `path.normalize` + `startsWith` 处理不同平台分隔符

9. **子代理 JSON 重试次数可配置**
   - 位置：`agent-factory.js:96-106`
   - 建议：提取为常量 `MAX_JSON_RETRY=2`

---

## 八、结论

写卡助手的 harness 设计整体上是**生产可用**的，架构清晰、守卫完善、测试覆盖良好。核心优势在于：

1. **强归一化层**：`normalizeProposal` 是整套系统的安全基石，处理了大量子代理的格式错误
2. **清晰的职责分离**：主代理只调度不执行，子代理只执行不越权
3. **完善的前端编辑能力**：用户可在应用前审查和修改提案

但存在**3个高优先级问题**需要修复（UNIQUE静默忽略、changes静默过滤、空proposal通过），以及若干中低优先级优化点。修复后系统健壮性可提升至 **8.5/10** 以上。

---

*报告生成时间：2026-04-25 02:08+08:00*
*审计者：Kimi Code CLI*
