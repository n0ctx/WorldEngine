# WorldEngine 项目结构分析报告
> 生成时间：2026-04-20

---

## A 项目结构总结

**定位**：本地 LLM 前端，面向创意写作/角色扮演，具备多层级记忆系统。

**架构层级**：全局 → 世界 → 角色 → 会话，下层不可覆盖上层。

**入口**：`backend/server.js`（161 行）+ `frontend/src/App.jsx`（10 个懒加载页面）

**技术栈**

| 层 | 技术 |
|---|---|
| 前端 | React 18 + Vite + TailwindCSS + Zustand + Framer Motion |
| 后端 | Node.js + Express + ES Modules |
| 数据库 | SQLite（better-sqlite3） |
| 向量搜索 | OpenAI embeddings 或 Ollama embeddings（可选，静默降级） |
| LLM 适配 | OpenAI / OpenRouter / Anthropic / Gemini / GLM / Kimi / MiniMax / DeepSeek / Grok / SiliconFlow / Ollama |

**代码行数分布**

```
总计 ~28,400 行

backend/      11,898 行 (41.9%)
  routes/      2,702   # 参数校验
  db/queries/  2,167   # SQL 访问层
  services/    2,042   # 业务逻辑
  llm/         1,551   # LLM 适配
  utils/       1,135
  memory/      1,027   # 记忆系统
  prompt/        592   # 16段组装器
  db/schema.js   508

frontend/src/ 13,054 行 (46.0%)
  components/  6,839
  pages/       4,506
  api/         1,408
  store/          30

assistant/     2,187 行 (7.7%)
```

---

## B 复杂度热点

### Top 20 最大文件

| # | 文件路径 | 行数 |
|---|---|---|
| 1 | `frontend/src/pages/SettingsPage.jsx` | 1298 |
| 2 | `backend/llm/providers/openai.js` | 913 |
| 3 | `frontend/src/pages/ChatPage.jsx` | 738 |
| 4 | `backend/services/import-export.js` | 675 |
| 5 | `assistant/server/routes.js` | 593 |
| 6 | `backend/routes/chat.js` | 523 |
| 7 | `backend/db/schema.js` | 508 |
| 8 | `frontend/src/components/chat/MessageItem.jsx` | 484 |
| 9 | `frontend/src/components/chat/InputBox.jsx` | 445 |
| 10 | `backend/prompt/assembler.js` | 466 |
| 11 | `backend/routes/writing.js` | 449 |
| 12 | `backend/routes/config.js` | 348 |
| 13 | `backend/utils/logger.js` | 337 |
| 14 | `backend/llm/index.js` | 334 |
| 15 | `backend/memory/combined-state-updater.js` | 323 |
| 16 | `backend/memory/recall.js` | 318 |
| 17 | `backend/db/queries/prompt-entries.js` | 253 |
| 18 | `backend/db/queries/messages.js` | 224 |
| 19 | `backend/services/config.js` | 219 |
| 20 | `backend/services/state-values.js` | 202 |

### Top 20 最长函数

| # | 位置 | 估计行数 |
|---|---|---|
| 1 | `prompt/assembler.js:buildPrompt` | ~300 |
| 2 | `import-export.js:importWorld` | 221 |
| 3 | `routes/chat.js:runStream` | 134 |
| 4 | `import-export.js:exportWorld` | 101 |
| 5 | `memory/combined-state-updater.js:updateAllStates` | ~100 |
| 6 | `memory/recall.js:searchRecalledSummaries` | ~80 |
| 7 | `memory/summary-expander.js:decideExpansion` | ~80 |
| 8 | `llm/providers/openai.js:convertToGeminiContents` | 64 |
| 9 | `import-export.js:exportGlobalSettings` | 52 |
| 10 | `llm/providers/openai.js:convertToAnthropicMessages` | 48 |
| 11-20 | `openai.js` 各 provider complete 函数 | 38–41 各 |

### 依赖最多模块 Top 10

| 模块 | 引用次数 |
|---|---|
| `node:crypto` | 24 |
| `express` | 18 |
| `node:path` | 13 |
| `utils/constants.js` | 11 |
| `node:fs` | 8 |
| `llm/index.js` | 7 |
| `db/queries/messages.js` | 6+ |
| `db/queries/characters.js` | 6+ |
| `db/queries/sessions.js` | 6+ |
| `db/queries/turn-records.js` | 5+ |

---

## C 架构风险

**风险 1：`openai.js` 913 行，8+ Provider 混在一个文件**
同时支持 OpenAI/Anthropic/Gemini 等，格式转换函数、Tool Use 逻辑各自重复 3 套，修改一个 provider 容易影响其他。

**风险 2：`import-export.js` 职责混乱，importWorld 占 221 行**
一个函数内混合了 DB 事务、文件 I/O、字段验证、数据转换。新增字段需同步改 5+ 处。

**风险 3：记忆系统模块依赖链过深**
一次对话可触发 3-4 次 LLM 调用（chat + generateTitle + createTurnRecord + updateAllStates），任一失败会影响后续。向量索引为内存加载，重启风险存在。

**风险 4：DB 查询层 30-40% 重复代码**
`character-state-fields` / `world-state-fields` / `persona-state-fields` 三个文件结构完全相同，UPSERT 逻辑多处散落，新增字段需多文件同步修改。

**风险 5：前端大页面缺乏拆分**
`SettingsPage.jsx` 1298 行包含 CSS/正则/状态字段三大功能；`ChatPage.jsx` 738 行混合 SSE 处理与 UI 渲染，难以独立测试，重渲染范围过大。

**额外风险**：快速切换会话时 SSE 连接可能连到错误会话；Turn Record 摘要生成失败时无重试机制，向量召回静默失效。

---

# WorldEngine 架构审查报告：长期维护能力分析
> 生成时间：2026-04-20

---

## 问题 #1：超大单文件

**问题类型**: 超大文件

**出现文件**: `frontend/src/pages/SettingsPage.jsx` — **1298 行**

**严重度**: P1

**问题描述**:
包含 8 个独立函数组件：`LlmSection`（~250 行）、`PromptSection`（~250 行）、`ImportExportSection`（~90 行）、`AboutSection`（~40 行）、主组件（~300 行），混合了 LLM 配置、Embedding 配置、全局 Prompt 编辑、导入导出、关于页五大职责。

**长期风险**: 新增功能时文件继续膨胀；修改某功能无法定位影响范围；测试成本指数级增长。

**修改建议**:
```
frontend/src/pages/settings/
  LlmConfigPanel.jsx       # 当前 LlmSection
  PromptEntriesPanel.jsx   # 当前 PromptSection
  ImportExportPanel.jsx    # 当前 ImportExportSection
  AboutPanel.jsx
SettingsPage.jsx           # 仅保留路由与 navigation
```

---

## 问题 #2：函数参数过多

**问题类型**: 参数过多

**出现文件**: `frontend/src/pages/SettingsPage.jsx` — `LlmSection` 组件

**严重度**: P1

**问题描述**:
`LlmSection` 有 **14 个 props**（远超 5 个阈值），混合数据字段、回调函数、UI 状态三类参数：
```javascript
function LlmSection({
  llm, embedding, onLlmChange, onEmbeddingChange,
  settingsMode, writingLlm, onWritingLlmChange, onModeChange,
  proxyUrl, onProxyUrlSave,
  showThinking, onToggleShowThinking,
  autoCollapseThinking, onToggleAutoCollapseThinking
})
```
`PromptSection`（~8-10 props）、`ProviderBlock`（~7-8 props）同样超标。

**长期风险**: 新增配置自动追加 prop，调用方需记住所有 prop 名称，组件复用性差。

**修改建议**: 引入专项 Zustand store（`useLlmConfigStore`），组件内部直接取用，props 降至 0。

---

## 问题 #3：超长函数

**问题类型**: 超长函数

**出现文件**:
- `backend/routes/chat.js:runStream` — **135 行**（第 57-191 行）
- `backend/memory/combined-state-updater.js:updateAllStates` — **~180 行**
- `backend/prompt/assembler.js:buildPrompt` — **~270 行**

**严重度**: P1

**问题描述**:
`runStream` 在 135 行内混合了 HTTP 协议处理、上下文构建、流式读取、错误处理、消息保存、异步任务入队六个职责，应只负责 HTTP 响应流程。`updateAllStates` 包含三重嵌套条件逻辑（世界/角色/玩家状态）。

**长期风险**: 修改任何部分需理解全部上下文；并发 bug（abort 逻辑错误）难以定位；测试需 mock 5+ 个依赖。

**修改建议**:
```javascript
// 拆分 runStream 为三个函数：
handleStreamLifecycle()    // HTTP 层：状态跟踪、event 发送、连接关闭
processStreamContent()     // 业务层：applyRules、createMessage、options 提取
enqueuePostStreamTasks()   // 队列层：title、state 更新、turn-record 入队
```

---

## 问题 #4：重复模块（三件套）

**问题类型**: 重复模块

**出现文件**:
- `backend/db/queries/character-state-fields.js` — 124 行
- `backend/db/queries/world-state-fields.js` — 123 行
- `backend/db/queries/persona-state-fields.js` — 122 行
- `backend/db/queries/character-state-values.js`、`world-state-values.js`、`persona-state-values.js`（各 125-130 行，同样重复）

**严重度**: P2

**问题描述**:
六个文件代码结构完全相同，仅表名与类型名不同（`s/character/world/g`）。`parseRow`、UPSERT 逻辑、reorder 逻辑各自重复三份。

**长期风险**: 修复 `parseRow` bug 需改三个文件；新增 SQL 字段需同步六处，遗漏必出 bug。

**修改建议**:
```javascript
// db/queries/_state-fields-factory.js
export function createStateFieldsQueries(tableName) {
  return { create, getById, getByWorldId, update, delete, reorder };
}
// 各文件简化为 5 行，仅做导出重命名
```

---

## 问题 #5：分层破坏 — 路由直接写 SQL

**问题类型**: 分层破坏

**出现文件**: `backend/routes/session-state-values.js` — 第 27-120 行

**严重度**: P1

**问题描述**:
路由层直接包含三段复杂 SQL（世界状态、玩家状态、角色状态），其中角色状态在循环内查询（**N+1 问题**，10 个角色 = 10 次查询）。违反"routes 仅做参数校验"的核心约束。

**长期风险**: 性能优化无法进行（需改 routes）；queries 层与 routes 层出现两套 SQL，最终不一致。

**修改建议**:
1. 新建 `db/queries/session-state-values.js`，将三段 SQL 封装为 `getSessionStateValuesWithEffective(sessionId, worldId, characterIds)`，用 `IN` 子句替代循环
2. routes 层简化为参数提取 + 一次函数调用

---

## 良好的架构实践（值得保持）

- **LLM 层完全隔离**：services/routes 零感知具体 provider，全部通过 `llm/index.js` 统一入口
- **前端 API 层严格隔离**：组件内无直接 `fetch()`，全部经由 `api/` 目录
- **无循环依赖**：routes → services → db/queries 单向依赖，未检测到任何循环
- **数据库查询层独立**：JSON parse/stringify 自动化，上层无感知（session-state-values 例外）

---

## 总体维护评分

**6.5 / 10**

| 维度 | 评分 | 备注 |
|---|---|---|
| 分层架构 | 8/10 | 结构清晰，外部 SDK 隔离完美；session-state-values 为单一破坏点 |
| 代码模块化 | 5.5/10 | 前端大页面 + 后端长函数 + 重复三件套 |
| 参数设计 | 5/10 | LlmSection 14 参数，prop 钻探严重 |
| 无循环依赖 | 9/10 | 完美 |
| 测试可维护性 | 6/10 | 大函数多职责混合，mocking 困难 |
| 文档 | 7/10 | ARCHITECTURE.md 详细，锁定文件标注明确 |

---

## Top 5 优先处理顺序

| 优先级 | 问题 | 文件 | 工作量 |
|---|---|---|---|
| 1 | 超大单文件 | `SettingsPage.jsx` | 2-3 天 |
| 2 | 函数参数过多 | `SettingsPage.jsx::LlmSection` | 1 天 |
| 3 | 超长函数 | `routes/chat.js::runStream` | 3-4 天 |
| 4 | 分层破坏 SQL | `routes/session-state-values.js` | 1 天 |
| 5 | 重复三件套 | `db/queries/*-state-{fields,values}.js` | 2-3 天 |

**审查结论**：架构骨架良好（分层清晰、无循环依赖、SDK 隔离完美），需对代码粒度精细化。当前可顺利开发，6-12 个月后若不处理 Top 5，维护成本将显著上升。

---

# WorldEngine 可维护性审查报告：团队协作维护成本
> 生成时间：2026-04-20

---

## 问题 #M1：错误处理缺少 return，响应重复发送

- **问题类型**: 错误处理不统一
- **位置**: `backend/routes/character-state-values.js:34-40`、`persona-state-values.js:34-40`、`world-state-values.js`（同样模式）
- **严重度**: P1
- **问题描述**: catch 块中 `res.status(404).json(...)` 没有 return，代码继续执行到下一行 `res.status(400).json(...)`，触发「Cannot set headers after they are sent」错误。
- **团队协作影响**: 这三个错误路径完全失效；新成员复制这段代码时延续 bug。
- **修改建议**: 所有 `res.status(...).json(...)` 前加 `return`；ESLint 添加 `no-unreachable` 规则。

---

## 问题 #M2：成功响应格式混用

- **问题类型**: 错误处理不统一
- **位置**:
  - `routes/prompt-entries.js:79` — `{ ok: true }`
  - `routes/character-state-values.js:32`、`routes/sessions.js:151` — `{ success: true }`
  - `routes/config.js:329` — `{ success: true, dimensions: vector.length }`
- **严重度**: P1
- **问题描述**: 成功响应存在三种格式（`{ ok: true }` / `{ success: true }` / 直接返回数据），前端需要针对不同端点写不同的判断逻辑。
- **团队协作影响**: 新成员开发新端点时无明确约定；重构时无法批量替换。
- **修改建议**: 统一规范——无数据体操作返回 `{ success: true }`，失败返回 `{ error: "..." }`；在 ARCHITECTURE.md 记录 API 响应规范。

---

## 问题 #M3：魔法数字散落业务代码

- **问题类型**: 魔法数字
- **位置**:
  - `backend/memory/summarizer.js:82` — `maxTokens: 30`（标题生成）
  - `backend/memory/turn-summarizer.js:64` — `maxTokens: 500`
  - `backend/memory/combined-state-updater.js:197` — `maxTokens: 1000`
  - `backend/llm/providers/ollama.js:156` — `max_tokens: 200, temperature: 0`
  - `backend/routes/writing.js:392` — `Math.min(maxTokens ?? 300, 300)`
  - `backend/routes/chat.js:503` — `temperature: 0.3`
  - `backend/llm/providers/openai.js:356` — `{ budget_low: 1024, budget_medium: 8192, budget_high: 16384 }`
- **严重度**: P1
- **问题描述**: `constants.js` 仅定义高层常数，细粒度的 token 预算和 temperature 散落在 6+ 个业务文件中。
- **团队协作影响**: 调优模型参数时无法全局搜索；模型升级需手工遍历代码；新成员不知道这些数字的来源和含义。
- **修改建议**: 在 `constants.js` 新增 `LLM_GENERATION_BUDGETS` 对象，涵盖所有生成场景的 token/temperature 配置；Claude thinking budget 值也统一为具名常量。

---

## 问题 #M4：日志系统与 console 混用

- **问题类型**: 日志不规范
- **位置**:
  - `backend/server.js:158,160` — `console.log()` 启动信息
  - `backend/utils/proxy.js:16,19` — `console.log()` 代理配置
  - `backend/memory/summary-embedder.js:40` — `console.warn()`
  - `backend/memory/summary-expander.js:89` — `console.warn()` 降级日志
- **严重度**: P1
- **问题描述**: `logger.js` 已存在但多个模块仍直接使用 `console.*`，导致启动日志无法被文件系统捕获，也无法通过 LOG_LEVEL 控制。
- **团队协作影响**: 监控系统无法收集完整日志；开发者无法通过 LOG_LEVEL 过滤调试信息；线上问题追踪日志链条不完整。
- **修改建议**: (1) 统一要求所有日志经过 logger；(2) proxy.js 改为延迟初始化或懒加载 logger；(3) server.js 启动信息改用 `logger.info()`。

---

## 问题 #M5：隐式全局状态 activeStreams 无清理机制

- **问题类型**: 隐式状态
- **位置**:
  - `backend/services/chat.js:16` — `export const activeStreams = new Map()`
  - `backend/routes/chat.js:3`、`backend/routes/writing.js:4` — 直接导入使用
  - `backend/routes/stream-helpers.js:12-38` — 修改这个全局 Map
- **严重度**: P1
- **问题描述**: `activeStreams` 是模块级可变全局状态，无超时清理策略（流意外中断后永久残留），水平扩展时无法跨进程共享。
- **团队协作影响**: 调试并发问题时难以追踪流状态；添加超时/重试功能需深入理解 stream-helpers；集群部署时功能失效。
- **修改建议**: 创建 `services/stream-manager.js` 统一管理流生命周期，封装清理、超时（建议 5 分钟无活动自动清理）、查询接口；对外只暴露方法，不暴露 Map 本身。

---

## 问题 #M6：硬编码 localhost 地址重复定义

- **问题类型**: 硬编码
- **位置**:
  - `backend/llm/providers/ollama.js:8-9` — `http://localhost:11434`、`http://localhost:1234`
  - `backend/llm/embedding.js:23` — `http://localhost:11434`
  - `backend/routes/config.js:195,241` — 相同两个地址
  - `frontend/vite.config.js:25` — `http://localhost:3000`
- **严重度**: P2
- **问题描述**: Ollama/LMStudio 默认地址在三处独立定义；前端后端地址在 vite.config 硬编码。Docker/远程部署需改代码而非配置。
- **团队协作影响**: 容器化部署困难；多个开发环境变更时需同步改多处代码。
- **修改建议**: 将 ollama/lmstudio 默认地址移入 `data/config.json` 默认值；前端改为读取 `.env.local`；禁止在业务代码中重复定义这些地址。

---

## 问题 #M7：文件命名规范混乱（前端 api/ 目录）

- **问题类型**: 命名不一致
- **位置**: `frontend/src/api/` 目录
  - camelCase：`characterStateFields.js`、`customCssSnippets.js`、`importExport.js`、`writingSessions.js`
  - kebab-case：`prompt-entries.js`、`regex-rules.js`、`world-state-fields.js`、`session-timeline.js`
- **严重度**: P2
- **问题描述**: 同一目录下两种命名风格并存，无明确约定。
- **团队协作影响**: 创建新文件时不知道选哪种风格；IDE 自动完成不可靠；代码审查时难以发现不一致。
- **修改建议**: 统一为 kebab-case；在 CLAUDE.md 明确文件命名约定；可用 pre-commit hook 检查。

---

## 问题 #M8：配置读取边界不清

- **问题类型**: 配置分散
- **位置**:
  - `backend/utils/proxy.js:14` — 初始化时独立读取环境变量或文件
  - `backend/llm/providers/ollama.js:8-9` — 使用硬编码默认值而非 `getConfig()`
- **严重度**: P2
- **问题描述**: 大部分代码正确通过 `services/config.js` 的 `getConfig()` 读取配置，但工具模块有独立读取路径，配置来源一致性无法保证。
- **团队协作影响**: 修改 `data/config.json` 后某些模块可能不生效；新增配置项时无法确认所有读取点都更新。
- **修改建议**: proxy 和 providers 的默认值改为从 `getConfig()` 读取；在代码评审 checklist 中加入「配置只从 getConfig() 读取」。

---

## 维护成本最高问题 Top 10（排除已知问题）

| 优先级 | 问题 | 文件 | 严重度 |
|---|---|---|---|
| 1 | 错误处理缺 return，响应重复发送 | `routes/*-state-values.js` | P1 |
| 2 | 成功响应格式混用（ok vs success） | `routes/` 多处 | P1 |
| 3 | 魔法数字散落业务代码（token 预算） | `memory/`、`routes/`、`llm/` | P1 |
| 4 | 日志系统与 console 混用 | `server.js`、`proxy.js`、`memory/` | P1 |
| 5 | activeStreams 全局状态无清理机制 | `services/chat.js`、`stream-helpers.js` | P1 |
| 6 | 硬编码 localhost 地址三处重复定义 | `ollama.js`、`embedding.js`、`config.js` | P2 |
| 7 | 前端 api/ 文件命名规范混乱 | `frontend/src/api/` | P2 |
| 8 | 配置读取边界不清（proxy/providers 独立读取） | `proxy.js`、`ollama.js` | P2 |

---

# WorldEngine 代码异味报告（Code Smells）
> 生成时间：2026-04-20

---

## [CS-1] Provider 路由中的重复条件分支

- **异味类型**: 条件分支过多
- **代码位置**: `backend/llm/providers/openai.js` 第 583-913 行
- **具体表现**: `streamChat()` / `complete()` / `completeWithTools()` / `resolveToolContext()` 各自包含相同的三路 if-else-if 路由，合计 **8 处**完全相同的分支结构：
  ```javascript
  if (config.provider === 'anthropic') { return completeAnthropic(...); }
  else if (config.provider === 'gemini') { return completeGemini(...); }
  else if (OPENAI_COMPATIBLE.has(config.provider)) { return completeOpenAICompatible(...); }
  ```
- **长期风险**: 每次新增 provider 需同步修改 8 处；横切关注点（限流、重试、日志）无法统一添加；某处漏改会导致部分功能无效。
- **修改建议**: 用策略模式替代 if-else-if——维护 `{ provider → handler }` 映射，路由逻辑集中为一处查表调用。

---

## [CS-2] 深层嵌套：importWorld 五层循环

- **异味类型**: 深层嵌套
- **代码位置**: `backend/services/import-export.js` 第 283-504 行
- **具体表现**: `importWorld()` 函数内最深达 5 层嵌套（遍历世界字段 → 角色字段 → persona 字段 → 角色列表 → 角色 prompt 条目），内层还穿插条件判断 `if (validWorldFieldKeys.has(sv.field_key))`。
- **长期风险**: 修改单个循环体可能影响外层逻辑；事务中途失败难以定位；新增字段类型需继续嵌套。
- **修改建议**: 提取每层循环为独立函数（`insertWorldFields` / `insertCharacterFields` / `insertPersonaFields`），在 `db.transaction()` 内顺序调用，验证逻辑前置于插入逻辑。

---

## [CS-3] 重复逻辑：三个 renderXxxState 函数 95% 相同

- **异味类型**: 重复逻辑
- **代码位置**: `backend/memory/recall.js` 第 53-188 行（`renderPersonaState` / `renderWorldState` / `renderCharacterState`）
- **具体表现**: 三个函数结构完全相同——SQL 组装、COALESCE 优先级、行循环、值解析，仅表名和主键字段名不同。
- **长期风险**: 修改渲染格式需改三处；修复 SQL bug 易遗漏；新增状态类型需复制粘贴全套代码。
- **修改建议**: 创建通用 `renderStateFields(tableConfig, keyId, sessionId)` 函数，三处调用各传入不同的 tableConfig 对象。

---

## [CS-4] 重复逻辑：JSON.parse 的 try-catch 散落多处

- **异味类型**: 重复逻辑
- **代码位置**: `backend/llm/providers/openai.js` 第 109、189、616 行；`backend/llm/providers/ollama.js` 第 142、167 行
- **具体表现**: 相同的 `try { JSON.parse(...) } catch { /* ignore */ }` 模式出现 5 次，部分吞掉异常不记录日志，部分返回错误字符串。
- **长期风险**: 需要统一修改容错策略（如记录日志）时需逐一排查；错误处理不一致可能导致某些异常被静默吞掉。
- **修改建议**: 提取 `safeParseJson(str, fallback = {})` 工具函数，统一所有调用点。

---

## [CS-5] God Object：combined-state-updater.js 承担 8+ 职责

- **异味类型**: God Object
- **代码位置**: `backend/memory/combined-state-updater.js` 全文（324 行）
- **具体表现**: 单个 `updateAllStates()` 函数内内嵌了 `filterActive()`、`buildFieldsDesc()`、`validateValue()` 等辅助函数，还直接执行：消息过滤、触发条件判断、Prompt 组装、LLM 调用、JSON 解析、值校验、三类状态写库——共 **8 个独立职责**。
- **长期风险**: 测试需 mock 消息/LLM/DB 三类依赖；修改触发规则影响整个函数；新增状态类型需在同一函数内继续扩展。
- **修改建议**: 分解为 `FieldFilterer`（活跃度判断）、`StatePromptBuilder`（字段描述生成）、`StateResponseParser`（结果解析与校验）三个独立模块；`updateAllStates` 仅做编排调用。

---

## [CS-6] Feature Envy：runStream 访问 7+ 个模块

- **异味类型**: Feature Envy
- **代码位置**: `backend/routes/chat.js` 第 57-191 行（`runStream()`）
- **具体表现**: `runStream()` 直接依赖并调用 14 个外部模块（`buildContext`、`llm.chat`、`stripAsstContext`、`extractNextPromptOptions`、`applyRules`、`createMessage`、`getSessionById`、`getCharacterById`、`getWorldById`、`generateTitle`、`updateAllStates`、`createTurnRecord`、`enqueue`、`getMessagesBySessionId`），自身没有独立的核心职责。
- **长期风险**: 任一外部模块 API 变更都需修改此函数；单元测试需 mock 14 个依赖；新增流程步骤只能继续塞入函数内部；职责混乱导致 bug 定位困难。
- **修改建议**: 创建 `ChatFlow` 编排类，将流程分为三个阶段——`generateStream()`（LLM 调用）→ `processOutput()`（输出处理）→ `scheduleBackgroundTasks()`（后台入队）；runStream 仅负责 HTTP 响应绑定。

---

## [CS-7] 条件分支过多：entry-matcher.js 关键词匹配

- **异味类型**: 条件分支过多 + 深层嵌套
- **代码位置**: `backend/prompt/entry-matcher.js` 第 29-126 行
- **具体表现**: `matchEntries()` 函数包含 6 层条件分支：LLM 预检通路 → try-catch → JSON 解析 → 结果校验 → 关键词兜底循环 → scope 判断 → 关键词匹配。LLM 降级逻辑与关键词主流程混合在同一函数内。
- **长期风险**: 新增 scope 类型需修改嵌套条件；LLM 降级逻辑与关键词逻辑难以独立测试；边界情况（空关键词、null scope）易引入 bug。
- **修改建议**: 拆分为三个独立函数——`tryLlmMatch()`（LLM 预检）、`parseKeywordScope(rawScope)`（scope 解析）、`matchByKeywords(entries, userText, asstText)`（关键词匹配）；主函数仅做顺序调用。

---

## 代码异味汇总表

| 异味类型 | 位置 | 严重度 | 一句话描述 |
|---|---|---|---|
| 条件分支过多 | `openai.js:583-913` | 高 | 8处相同的provider路由if-else-if，每增加provider需改8处 |
| 深层嵌套 | `import-export.js:283-504` | 高 | importWorld 5层循环嵌套，事务失败难定位 |
| 重复逻辑 | `recall.js:53-188` | 中 | 三个renderXxxState函数95%代码相同 |
| 重复逻辑 | `openai.js` / `ollama.js` 多处 | 低 | safeParseJson模式散落5处 |
| God Object | `combined-state-updater.js` 全文 | 高 | updateAllStates承担8+职责，无法独立测试 |
| Feature Envy | `routes/chat.js:57-191` | 高 | runStream访问14个外部模块，是流程粘合剂而非功能实现 |
| 条件分支+深层嵌套 | `entry-matcher.js:29-126` | 中 | LLM降级与关键词主流程混合，6层条件分支 |

---

# WorldEngine 测试工程审查报告：可测性评估
> 生成时间：2026-04-20

---

## 测试现状

**项目完全无单元测试覆盖**

- `backend/package.json` 定义了 `"test": "node --test tests/*.test.js"` 但 `tests/` 目录不存在
- 后端 84 个 `.js` 文件，0% 测试覆盖率
- 无 Mock 库依赖（无 sinon、nock、jest-mock）
- 无测试框架配置（无 Jest、Vitest、Mocha）

---

## 测试薄弱模块

### [T-1] Prompt 组装（assembler.js）

**可测性**：🟡 黄（中等耦合）

`buildPrompt(sessionId)` 的 85% 代码涉及 DB/LLM 调用，可单测的纯逻辑仅占 15%：
- `formatMessageForLLM(msg)` — 消息格式转换（8行纯函数）
- `omitLatestUserMessage()` — 消息过滤（纯函数）
- `applyTemplateVars(t, ctx)` — 模板替换（内联，未导出）

整体 `buildPrompt()` 无法单测，需要集成测试 + fixture 数据库。

**建议补充测试**：`formatMessageForLLM` 无附件/有图片、`omitLatestUserMessage` 空历史边界。

---

### [T-2] 条目匹配（entry-matcher.js）

**可测性**：🔴 红（LLM 依赖强）

关键词匹配本身（第 99-123 行）是纯逻辑，完全可单测。但 `matchEntries()` 混合了 DB 读取和 `llm.complete()` 调用。**LLM 失败后的关键词降级路径完全无测试保护**，是高风险点。

**建议补充测试**：关键词 scope 过滤、大小写不敏感、`llmFailure_fallbackToKeywords`（需 mock LLM 抛错）、JSON 解析失败降级。

---

### [T-3] 记忆召回（recall.js）

**可测性**：🔴 红（DB + 向量双重耦合）

`parseValueForDisplay(valueJson)`（第 30-43 行）是完全可单测的纯函数。`renderXxxState()` 三函数各含 2-3 个 SQL 查询，无法脱离 DB 测试。`searchRecalledSummaries()` 需要 LLM 嵌入 + 文件系统向量存储 + DB，是项目中**最难测试的路径**。

**建议补充测试**：`parseValueForDisplay` 的 null/空数组/无效 JSON 边界用例；`searchRecalledSummaries` 需集成测试 + 向量库 mock。

---

### [T-4] 状态更新（combined-state-updater.js）

**可测性**：🔴 红（LLM + 多表无事务）

`filterActive()` 和 `validateValue()` 是纯逻辑，可单测。但 `updateAllStates()` 整体无法脱离 LLM 和 DB。**关键问题**：LLM 失败后 `return` 但已入库的数据无回滚机制，多字段更新没有事务保护。

**建议补充测试**：`filterActive` 的四种 trigger_mode、`validateValue` 的全类型（text/number/enum/list）、`updateAllStates_llmFailure_noPersistence`（需 mock LLM）。

---

### [T-5] LLM 接入层（llm/index.js）

**可测性**：🟡 黄（有良好接口，但无 mock 模式）

`buildLLMConfig()`、`getProvider()`、`splitTools()` 均为纯逻辑，可单测。但无内置 mock provider，无 `MOCK_LLM=true` 环境变量开关，测试时必须连接真实 API。

**建议**：创建 `llm/mock-provider.js`，支持通过环境变量切换 mock 响应。

---

### [T-6] 正则规则执行（regex-runner.js）

**可测性**：🟢 绿（良好纯逻辑设计）

仅有 1 个 DB 调用（获取规则列表），规则应用本身无副作用，异常处理完善（逐条 try/catch）。mock `getEnabledRulesForRuntime()` 返回值后可完整单测。

**建议补充测试**：单条/多条规则链式、flags 大小写不敏感、非法正则跳过、DB 查询失败返回原文。

---

## 高风险路径

| 路径 | 风险类型 | 无测试时的后果 | 建议测试类型 |
|---|---|---|---|
| `assembler.js:buildPrompt` | 流程复杂度 + IO 耦合 | 提示词组装错误导致 LLM 回复离题 | 集成测试 + fixture DB |
| `entry-matcher.js:matchEntries` 降级路径 | LLM 失败无保护 | 关键词兜底行为未验证，条目注入失效 | 单元测试（关键词部分） + mock LLM |
| `recall.js:searchRecalledSummaries` | 向量化 + 文件IO | 向量文件损坏时无通知，上文丢失 | 集成测试 + 向量库 mock |
| `combined-state-updater.js:updateAllStates` | 多表无事务 | LLM 失败时状态部分更新，数据一致性破坏 | 单元测试（validateValue）+ 集成测试（事务） |
| `routes/chat.js:runStream` | 并发 + 资源泄漏 | 重新生成竞态导致 activeStreams 泄漏、消息重复 | 集成测试 + 并发测试 |
| `utils/async-queue.js` | 竞态条件 | 快速重复生成时旧任务未清理，队列死锁 | 单元测试（clearPending + 并发） |
| `entry-matcher.js` JSON 解析 | 格式脆性 | LLM 返回非法 JSON 时降级无感知 | 单元测试（边界用例） |

---

## 建议补充测试（优先级顺序）

### Phase 1：基础设施 + 纯函数单测（1-2 周）

```
backend/tests/
├── utils/
│   ├── parseValueForDisplay.test.js     # null/空数组/无效JSON边界
│   ├── filterActive.test.js             # 四种trigger_mode
│   ├── validateValue.test.js            # text/number/enum/list全类型
│   └── regex-runner.test.js             # 规则链式/异常跳过
├── prompt/
│   ├── formatMessageForLLM.test.js      # 无附件/有图片
│   ├── omitLatestUserMessage.test.js    # 空历史边界
│   └── matchEntries-keyword.test.js    # 关键词scope/大小写/降级
└── llm/
    ├── buildLLMConfig.test.js           # options覆盖优先级
    ├── getProvider.test.js              # provider路由
    └── async-queue.test.js             # FIFO/优先级/clearPending/并发
```

**测试框架建议**：`node:test`（内置，零依赖）或 Vitest；Mock 用 Sinon。

### Phase 2：集成测试（4-6 周）

```
backend/tests/integration/
├── chat-flow.test.js              # POST /chat → LLM → 消息保存 → 队列入队
├── state-update-flow.test.js      # updateAllStates + LLM失败降级 + 事务
├── memory-recall-flow.test.js     # searchRecalledSummaries + 向量mock
└── async-queue-concurrency.test.js # 竞态条件/clearPending

backend/tests/mocks/
├── llm-mock.js          # mock provider，支持 MOCK_LLM=true
├── db-fixtures.js       # 内存SQLite + fixture数据
└── vector-store-mock.js # 向量库mock
```

better-sqlite3 支持 `:memory:` 内存数据库，DB 可完全隔离。

### Phase 3：e2e 测试（3-4 周）

使用已有的 Playwright 依赖，覆盖：新建会话→输入→生成回复、编辑消息→重新生成竞态、中断流式→activeStreams 清理。

---

## 测试现状总结

**当前评级：🔴 临界**

| 维度 | 状态 |
|---|---|
| 单元测试覆盖率 | 0% |
| 关键路径保护 | 无 |
| Mock 基础设施 | 无 |
| 纯逻辑可测性 | 中等（散落在大函数中，需先重构） |
| 集成测试可行性 | 可行（Express/SQLite 结构支持） |

**立即可行动**：创建 `backend/tests/` 目录，安装 Sinon，编写 `validateValue` 和 `filterActive` 的单元测试——这两个函数是项目中**最易测试、回报最高**的纯逻辑入口。

---

# WorldEngine 陈旧代码识别报告
> 生成时间：2026-04-20

---

## 核心发现：Session Summary 子系统整体废弃

旧的「会话级摘要 + 向量检索」系统已被新的「turn-records + turn-summary-vector-store」系统替代，但旧代码未清理，形成一个完整的死代码集群。

---

## [D-1] generateSummary() — 无调用方的导出函数

- **代码位置**: `backend/memory/summarizer.js:23-58`（36 行）
- **类型**: 无引用函数
- **删除置信度**: 高
- **删除风险**: 低。确认无调用方（grep 全库零结果）。`generateTitle()` 在同文件（第 60 行）仍被 chat.js 和 writing.js 调用，保留即可。
- **建议处理方式**: 删除 `generateSummary` 函数体及其依赖的 `import { upsertSummary } from '../db/queries/session-summaries.js'`（第 9 行）。

---

## [D-2] summary-embedder.js — 整个模块无调用方

- **代码位置**: `backend/memory/summary-embedder.js`（全文 42 行）
- **类型**: 无引用模块
- **删除置信度**: 高
- **删除风险**: 低。`embedSessionSummary` 在整个项目中零调用；`cleanup-registrations.js:73` 仅有注释提到此模块，实际清理通过 `session-summary-vector-store.deleteBySessionId()` 完成，不依赖本文件。
- **建议处理方式**: 直接删除整个文件；同步删除 `cleanup-registrations.js:73` 的注释行。

---

## [D-3] session-summaries.js — 查询函数的写路径完全废弃

- **代码位置**: `backend/db/queries/session-summaries.js`
- **类型**: 被新实现替代的旧逻辑
- **删除置信度**: 中
- **删除风险**: 中。`upsertSummary` 只被已废弃的 `generateSummary()` 调用；`getSummaryBySessionId` 只被已废弃的 `summary-embedder.js` 调用。但 `session_summaries` 表仍在 schema 中，删前需确认旧数据库用户无数据依赖。
- **建议处理方式**: 在删除 D-1、D-2 后确认 session-summaries.js 零引用，再整体删除；`db/schema.js` 中 `session_summaries` 表的 DDL 可保留（已有数据不影响）或标注废弃。

---

## [D-4] session-summary-vector-store.js — 写路径死代码

- **代码位置**: `backend/utils/session-summary-vector-store.js:upsertEntry`（第 46-62 行）
- **类型**: 无引用函数（局部）
- **删除置信度**: 高
- **删除风险**: 低。`upsertEntry` 仅被已废弃的 `summary-embedder.js` 调用。文件其余函数（`deleteBySessionId`、`deleteByWorldId`、`search`）仍被 `cleanup-registrations.js` 和其他模块使用，**不可删除**。
- **建议处理方式**: 仅删除 `upsertEntry` 函数；保留文件其余部分。

---

## [D-5] 消息压缩系统残留函数

- **代码位置**:
  - `backend/db/queries/messages.js:countUncompressedRounds`（第 198-203 行）
  - `backend/db/queries/messages.js:markMessagesAsCompressed`（第 207-211 行）
  - `backend/db/queries/sessions.js:setCompressedContext`（第 63-67 行）
- **类型**: 被新实现替代的旧逻辑（旧压缩系统 → turn-records 系统）
- **删除置信度**: 高
- **删除风险**: 低。三个函数在整个项目中零调用（grep 确认）。`clearCompressedContext` 仍被 chat.js:427 和 writing.js:103 调用，**保留**。`getUncompressedMessagesBySessionId` 仍是 assembler.js 的降级路径，**保留**。
- **建议处理方式**: 删除上述三个函数；`is_compressed` 字段和相关索引保留（`getUncompressedMessagesBySessionId` 仍依赖该字段）。

---

## [D-6] resolveAnthropicThinking — @deprecated 别名

- **代码位置**: `backend/llm/providers/openai.js:360-362`
- **类型**: 旧 API adapter（同文件兼容别名）
- **删除置信度**: 高
- **删除风险**: 极低，仅同文件内部调用。
- **具体表现**:
  ```javascript
  /** @deprecated 兼容别名 */
  function resolveAnthropicThinking(thinking_level) {
    return resolveThinkingBudget(thinking_level);  // 直接转发
  }
  // 被 streamAnthropic (第370行) 和 completeAnthropic (第443行) 调用
  ```
- **建议处理方式**: 将第 370、443 行的 `resolveAnthropicThinking(...)` 替换为 `resolveThinkingBudget(...)`，删除第 360-362 行的别名函数。

---

## [D-7] validateStateValue — 错误导出的内部函数

- **代码位置**: `backend/services/state-values.js:33`
- **类型**: 无引用函数（export 可见性过高）
- **删除置信度**: 高
- **删除风险**: 极低。函数只在同文件第 73 行被 `normalizeStateValueJson` 内部调用，无外部 import。
- **建议处理方式**: 删除 `export` 关键字，改为模块内私有函数。

---

## [D-8] config.js 旧字段名迁移代码

- **代码位置**: `backend/services/config.js:124-127`
- **类型**: 旧 API adapter（字段名迁移，`context_compress_rounds` → `context_history_rounds`）
- **删除置信度**: 低
- **删除风险**: 高。用户从旧版本升级时依赖此迁移路径；过早删除会导致旧配置用户的历史轮次设置丢失。
- **建议处理方式**: 保留；待版本稳定后（至少 2 个主版本后）再移除。

---

## 陈旧代码汇总表

| 位置 | 类型 | 置信度 | 处理状态 |
|---|---|---|---|
| `memory/summarizer.js:generateSummary` | 无引用函数 | 高 | 可直接删除 |
| `memory/summary-embedder.js` 全文 | 无引用模块 | 高 | 可直接删除 |
| `db/queries/session-summaries.js` | 旧逻辑（写路径） | 中 | 删 D-1/D-2 后验证删除 |
| `utils/session-summary-vector-store.js:upsertEntry` | 无引用函数（局部） | 高 | 仅删此函数，保留文件 |
| `db/queries/messages.js:countUncompressedRounds` | 旧压缩系统残留 | 高 | 可直接删除 |
| `db/queries/messages.js:markMessagesAsCompressed` | 旧压缩系统残留 | 高 | 可直接删除 |
| `db/queries/sessions.js:setCompressedContext` | 旧压缩系统残留 | 高 | 可直接删除 |
| `llm/providers/openai.js:resolveAnthropicThinking` | 旧 API 别名 | 高 | 内联替换后删除 |
| `services/state-values.js:validateStateValue` export | 错误导出 | 高 | 删除 export 关键字 |
| `services/config.js:124-127` | 版本迁移代码 | 低 | 保留，未来版本清理 |

**核心结论**：陈旧代码主要集中在一个完整的「session summary」死代码集群（D-1 至 D-4），这是旧摘要系统向 turn-records 迁移后未清理的遗留物。建议按 D-1 → D-2 → D-3 → D-4 顺序逐步删除，每步确认零引用后再推进。

---

# WorldEngine 调用链执行路径分析报告
> 生成时间：2026-04-20

---

## 主执行路径

### A. 对话生成路径

```
POST /api/sessions/:sessionId/chat
  → routes/chat.js:runStream()
    → buildContext()
      → prompt/assembler.js:buildPrompt()
          [1-7]  system/world/persona/character prompt + TV替换
          [3/5/7] renderWorldState / renderPersonaState / renderCharacterState()
          [8-10] matchEntries() → llm.complete()（条目预检）+ 关键词兜底
          [11]   renderTimeline()
          [12]   searchRecalledSummaries() → embed() → turn-summary-vector-store.search()
          [13]   decideExpansion() → renderExpandedTurnRecords()
          [14]   getTurnRecordsBySessionId()（新路径）
                 ↘ 降级：getUncompressedMessagesBySessionId()（仅零 turn records 时）
          [15-16] 后置提示词 + 当前 user 消息
    → llm/index.js:chat()
        → openai.js:streamChat()
            ├─ streamAnthropic()
            ├─ streamGemini()
            └─ streamOpenAICompatible()
    → 后处理：stripAsstContext() → extractNextPromptOptions() → applyRules() → createMessage()
    → 异步队列：
        Priority 2: updateAllStates()（状态更新）
        Priority 2: generateTitle()（仅 title=NULL 时）
        Priority 3: createTurnRecord()（turn 摘要 + 向量）
```

### B. 记忆更新异步链

```
createTurnRecord(sessionId)  [turn-summarizer.js]
  → llm.complete()（生成 summary + user/asst context）
  → upsertTurnRecord()  [turn_records 表]
  → embedTurnRecord() → embed() → turn-summary-vector-store.upsertEntry()

updateAllStates(worldId, characterIds, sessionId)  [combined-state-updater.js]
  → 字段过滤 + Prompt 组装
  → llm.complete()（单次调用合并三类状态）
  → 写入 session_*_state_values
```

---

## 旧路径识别

### [P-1] Session Summary 路径：前端调用后端无实现

- **旧路径**: `frontend/src/api/chat.js:triggerSummary()` → `POST /api/sessions/:id/summary`
- **触发位置**: `frontend/src/pages/ChatPage.jsx:567`（转换结束后调用）
- **后端状态**: `routes/chat.js` 中**无任何 `/summary` 端点**，调用直接失败（404）
- **新路径**: `createTurnRecord()` 在异步队列中自动触发，完全替代
- **可否删除**: 确认可删除
- **删除建议**:
  1. 删除 `frontend/src/api/chat.js:triggerSummary()`（约第 253-263 行）
  2. 删除 `frontend/src/pages/ChatPage.jsx` 中的调用点（约第 567 行）

---

### [P-2] 未压缩消息降级路径

- **旧路径**: `assembler.js:buildPrompt/buildWritingPrompt` 中的 `else` 分支 → `getUncompressedMessagesBySessionId()`
- **触发条件**: session 零 turn records（新会话前 1-3 轮）
- **新路径**: `getTurnRecordsBySessionId()` 有记录时优先使用
- **可否删除**: **否，需保留**。turn records 异步生成（Priority 3），新会话前几轮必然触发降级路径。
- **优化建议**: 考虑在首轮消息保存后同步生成第一条 turn record，消除降级窗口。

---

### [P-3] compressed_context 字段：只清理不写入

- **旧路径**: `setCompressedContext()` 写入 sessions.compressed_context → `getUncompressedMessagesBySessionId()` 读取
- **现状**: `setCompressedContext` 零调用（无写入），但 `clearCompressedContext` 仍在 `DELETE /messages` 路由中调用（防御性清理）
- **新路径**: turn_records 存储 user_context + asst_context，完全替代
- **可否删除**: compressed_context 字段本身可废弃；`clearCompressedContext` 作为防御性清理可保留。

---

### [P-4] POST /api/sessions/:id/timeline 端点

- **后端实现**: `backend/routes/session-timeline.js`（有完整实现）
- **前端状态**: `frontend/src/api/` 目录中无任何文件调用此端点
- **用途推测**: 可能为管理/调试工具，或计划中未完成的功能
- **可否删除**: 需验证。若无外部调用者，可删除；若用于调试目的，可保留并注释说明。

---

## 冗余 Adapter

| 位置 | 冗余类型 | 影响 | 建议 |
|---|---|---|---|
| `openai.js` streamChat/complete 三路 if-else-if | Provider 路由 8 处重复（已记录 CS-1）| 每增一 provider 改 8 处 | 策略模式映射表 |
| `openai.js` completeOpenAICompatibleWithTools / completeAnthropicWithTools / completeGeminiWithTools | 三套几乎相同的工具调用循环 | 修复循环 bug 需改三处 | 提取 `toolLoopExecutor(callFn, messages, tools)` |
| `assembler.js` [14] 历史消息块 | buildPrompt + buildWritingPrompt 各自重复一遍相同的降级判断逻辑 | 逻辑修改需同步两处 | 提取 `buildHistoryMessages(sessionId, turnRecords)` |
| `recall.js` renderPersonaState / renderWorldState / renderCharacterState | 三套相同 SQL+渲染（已记录 CS-3）| 修复渲染需改三处 | 提取 `renderStateFields(tableConfig, id, sessionId)` |

---

## 端点状态对比

| 端点 | 前端调用 | 后端实现 | 状态 |
|---|---|---|---|
| POST `/api/sessions/:id/chat` | ✓ | ✓ | 正常 |
| POST `/api/sessions/:id/stop` | ✓ | ✓ | 正常 |
| POST `/api/sessions/:id/regenerate` | ✓ | ✓ | 正常 |
| POST `/api/sessions/:id/continue` | ✓ | ✓ | 正常 |
| POST `/api/sessions/:id/impersonate` | ✓ | ✓ | 正常 |
| POST `/api/sessions/:id/edit-assistant` | ✓ | ✓ | 正常 |
| POST `/api/sessions/:id/retitle` | ✓ | ✓ | 正常 |
| DELETE `/api/sessions/:id/messages` | ✓ | ✓ | 正常 |
| **POST `/api/sessions/:id/summary`** | **✓（ChatPage.jsx:567）** | **❌ 无实现** | **死调用，应删除前端代码** |
| **POST `/api/sessions/:id/timeline`** | **❌ 前端未调用** | **✓ session-timeline.js** | **孤立端点，待确认用途** |
| POST `/api/assistant/chat` | ✓ | ✓ | 正常 |
| POST `/api/assistant/execute` | ✓ | ✓ | 正常 |

---

## 清理顺序

**第 1 阶段（零风险，立即可执行）**

```
1. frontend/src/api/chat.js:triggerSummary()       删除函数
2. frontend/src/pages/ChatPage.jsx:~567            删除调用点
3. openai.js:resolveAnthropicThinking()            内联替换为 resolveThinkingBudget()，删除别名
4. services/state-values.js:validateStateValue     去掉 export 关键字
```

**第 2 阶段（后端死代码清理）**

```
5. memory/summarizer.js:generateSummary()          删除函数（保留 generateTitle）
6. memory/summary-embedder.js                      删除整个文件
7. db/queries/messages.js:markMessagesAsCompressed 删除函数（零调用）
8. db/queries/sessions.js:setCompressedContext     删除函数（零调用）
```

**第 3 阶段（验证后清理）**

```
9.  db/queries/session-summaries.js                确认零引用后删除
10. utils/session-summary-vector-store.js:upsertEntry 确认零引用后删除
11. routes/session-timeline.js                     确认无外部调用后删除或保留说明
```

**第 4 阶段（重构优化）**

```
12. 提取 toolLoopExecutor() 合并三套工具调用循环
13. 提取 buildHistoryMessages() 复用 assembler 降级逻辑
14. Provider 路由改为策略模式（消除 8 处 if-else-if）
```

---

# WorldEngine Copy-Paste 重复代码扫描报告
> 生成时间：2026-04-20

---

## [CP-1] 前端 API 层：request() 包装函数在 5 个文件中完全相同

- **类型**: copy-paste 代码块
- **出现位置**:
  - `frontend/src/api/characters.js:3-14`
  - `frontend/src/api/worlds.js:3-14`
  - `frontend/src/api/prompt-entries.js:3-14`
  - `frontend/src/api/config.js:3-14`
  - `frontend/src/api/importExport.js:3-13`
- **重复程度**: 100% 完全相同
- **重复行数**: 11-12 行 × 5 = ~55 行冗余
- **问题描述**: 每个文件都独立定义了相同的 `async function request(url, options)` fetch 包装，包含相同的错误处理、JSON 解析、204 处理逻辑。
- **建议抽象模块**:
  ```javascript
  // frontend/src/api/request.js
  export async function request(url, options = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `请求失败：${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }
  ```
  各 API 文件改为 `import { request } from './request.js'`。

---

## [CP-2] 前端 API 层：State Fields 三套 CRUD 完全相同

- **类型**: 相似模块
- **出现位置**:
  - `frontend/src/api/worldStateFields.js`（约 45 行）
  - `frontend/src/api/characterStateFields.js`（约 45 行）
  - `frontend/src/api/personaStateFields.js`（约 42 行）
- **重复程度**: 95%，仅 URL 前缀不同
- **重复行数**: ~130 行冗余（每套 5 个函数：list/create/update/delete/reorder）
- **问题描述**: 三个文件是前端对后端三件套的镜像，CRUD 函数结构和错误处理完全相同。
- **建议抽象模块**:
  ```javascript
  // frontend/src/api/stateFieldsFactory.js
  export function createStateFieldsApi(scope) { // 'worlds'|'characters'|'personas'
    const base = `/api/${scope}`;
    return {
      list:    (worldId)     => request(`${base}/${worldId}/state-fields`),
      create:  (worldId, d)  => request(`${base}/${worldId}/state-fields`, { method:'POST', body:JSON.stringify(d) }),
      update:  (id, patch)   => request(`${base}/state-fields/${id}`, { method:'PUT', body:JSON.stringify(patch) }),
      delete:  (id)          => request(`${base}/state-fields/${id}`, { method:'DELETE' }),
      reorder: (worldId, ids)=> request(`${base}/${worldId}/state-fields/reorder`, { method:'PUT', body:JSON.stringify({ ids }) }),
    };
  }
  ```

---

## [CP-3] 前端 API 层：正则规则与自定义 CSS 的 CRUD 95% 相同

- **类型**: 相似模块
- **出现位置**:
  - `frontend/src/api/regex-rules.js`（约 47 行）
  - `frontend/src/api/customCssSnippets.js`（约 45 行）
- **重复程度**: 95%，5 个函数（list/create/update/delete/reorder）结构完全相同
- **重复行数**: ~90 行冗余
- **问题描述**: 两个文件均实现了相同的带排序 CRUD 集合，仅 base URL 不同（`/api/regex-rules` vs `/api/custom-css`）。
- **建议抽象模块**:
  ```javascript
  // frontend/src/api/crudFactory.js
  export function createCrudApi(baseUrl) {
    return {
      list:    (query = '') => request(`${baseUrl}${query}`),
      create:  (data)       => request(baseUrl, { method: 'POST', body: JSON.stringify(data) }),
      update:  (id, patch)  => request(`${baseUrl}/${id}`, { method: 'PUT', body: JSON.stringify(patch) }),
      delete:  (id)         => request(`${baseUrl}/${id}`, { method: 'DELETE' }),
      reorder: (ids)        => request(`${baseUrl}/reorder`, { method: 'PUT', body: JSON.stringify({ ids }) }),
    };
  }
  // 使用方：
  export const regexRulesApi   = createCrudApi('/api/regex-rules');
  export const customCssApi    = createCrudApi('/api/custom-css');
  ```

---

## [CP-4] 前端组件层：StateValueField 组件在两个页面完全重复

- **类型**: copy-paste React 组件
- **出现位置**:
  - `frontend/src/pages/WorldEditPage.jsx:27-92`（66 行）
  - `frontend/src/pages/CharacterEditPage.jsx:15-80`（66 行）
- **重复程度**: 100% 完全相同
- **重复行数**: 66 行 × 2 = 132 行冗余
- **问题描述**: 处理 boolean/number/enum/list/text 五种状态字段类型的编辑组件，在两个页面文件中完全相同，是典型的 copy-paste 组件内联。
- **建议抽象模块**:
  ```javascript
  // frontend/src/components/state/StateValueField.jsx
  export default function StateValueField({ field, value, onSave }) {
    // 统一实现，两个 page 直接 import 使用
  }
  ```

---

## [CP-5] 后端 DB 层：parseRow / parseAll 在三件套中 100% 相同

- **类型**: copy-paste 辅助函数
- **出现位置**:
  - `backend/db/queries/world-state-fields.js:7-18`
  - `backend/db/queries/character-state-fields.js:7-18`
  - `backend/db/queries/persona-state-fields.js:6-17`
- **重复程度**: 100%
- **重复行数**: 12 行 × 3 = 36 行冗余
- **问题描述**: `parseRow()` 和 `parseAll()` 负责将 `trigger_keywords` / `enum_options` 从 JSON 字符串解析为数组，逻辑完全相同。这是三件套问题（已记录）的具体函数级细节，作为抽象切入点。
- **建议抽象模块**:
  ```javascript
  // backend/db/queries/_state-fields-base.js
  export function parseRow(row) {
    if (!row) return row;
    return {
      ...row,
      trigger_keywords: row.trigger_keywords ? JSON.parse(row.trigger_keywords) : null,
      enum_options:     row.enum_options     ? JSON.parse(row.enum_options)     : null,
    };
  }
  export const parseAll = (rows) => rows.map(parseRow);
  ```

---

## [CP-6] 后端路由层：404 检查模式在 8+ 文件中重复

- **类型**: 重复代码块
- **出现位置**: `backend/routes/chat.js`（7 处）、`backend/routes/writing.js`、`backend/routes/sessions.js`、`backend/routes/prompt-entries.js`、`backend/routes/regex-rules.js`、`backend/routes/state-fields.js`、`backend/routes/custom-css-snippets.js` 等合计 **20+ 处**
- **重复程度**: 95%，模式：`if (!resource) return res.status(404).json({ error: 'xxx不存在' })`
- **重复行数**: 1-2 行 × 20+ = ~30 行散落
- **问题描述**: 资源查找失败的 404 处理在每个路由函数中单独写，无统一工具。
- **建议抽象模块**:
  ```javascript
  // backend/utils/route-helpers.js
  export function assertExists(res, resource, message = '资源不存在') {
    if (!resource) { res.status(404).json({ error: message }); return false; }
    return true;
  }
  // 路由中使用：
  if (!assertExists(res, session, '会话不存在')) return;
  ```

---

## [CP-7] 后端服务层：getInitialValueJson 在三个 service 文件完全相同

- **类型**: 相同辅助函数
- **出现位置**:
  - `backend/services/world-state-fields.js:11-13`
  - `backend/services/character-state-fields.js:12-14`
  - `backend/services/persona-state-fields.js:11-13`
- **重复程度**: 100%
- **重复行数**: 3 行 × 3 = 9 行冗余
- **建议抽象模块**: 移入 `backend/services/_state-field-helpers.js`，三个文件共同 import。

---

## Copy-Paste 汇总表

| # | 类型 | 位置 | 冗余行数 | 优先级 | 建议抽象 |
|---|---|---|---|---|---|
| CP-1 | fetch request 包装 | 5 个 api/ 文件 | ~55 行 | 高 | `api/request.js` |
| CP-2 | State Fields API | 3 个 api/ 文件 | ~130 行 | 高 | `api/stateFieldsFactory.js` |
| CP-3 | CRUD API（正则/CSS）| 2 个 api/ 文件 | ~90 行 | 高 | `api/crudFactory.js` |
| CP-4 | StateValueField 组件 | 2 个 page/ 文件 | 132 行 | 高 | `components/state/StateValueField.jsx` |
| CP-5 | parseRow / parseAll | 3 个 db/queries/ | 36 行 | 中 | `db/queries/_state-fields-base.js` |
| CP-6 | 404 检查模式 | 8+ routes/ 文件 | ~30 行 | 中 | `utils/route-helpers.js:assertExists` |
| CP-7 | getInitialValueJson | 3 个 services/ | 9 行 | 低 | `services/_state-field-helpers.js` |

**本轮关键新发现**：
- CP-1 的 `request()` 函数是最高价值的抽取点，5 个文件共 55 行完全相同代码，一次改动消除所有重复
- CP-4 的 `StateValueField` 组件是前端最大的 copy-paste 块（132 行），两个页面完全同步维护
- CP-3 的 `regexRules` vs `customCssSnippets` 是最典型的功能复制，提取工厂函数后两文件可缩减至 3 行

---

# WorldEngine 大文件拆分分析报告（>800 行）
> 生成时间：2026-04-20

超过 800 行的文件共 2 个：`SettingsPage.jsx`（1298 行）、`openai.js`（913 行）。

---

## 文件一：`frontend/src/pages/SettingsPage.jsx`（1298 行）

### 当前职责

文件内混合了 **12 个组件/函数**，承担 6 类完全独立的职责：

| 行范围 | 组件/函数 | 职责 | 行数 |
|---|---|---|---|
| 21-74 | 常量定义 | LLM_PROVIDERS、EMBEDDING_PROVIDERS、NAV_SECTIONS 等 | 54 |
| 47-65 | `getProviderThinkingOptions()` | 工具函数：Provider thinking 选项 | 19 |
| 76-106 | `ModeSwitch` / `FieldLabel` | 通用 UI 小组件 | 31 |
| 108-152 | `ModelSelector` | 模型列表拉取 + 下拉选择 | 45 |
| 154-244 | `ProviderBlock` | Provider 配置块（8 props） | 91 |
| 246-297 | `WritingLlmBlock` | 写作空间 LLM 覆盖配置 | 52 |
| 299-568 | `LlmSection` | LLM + Embedding + 代理 + 思考链（**14 props**）| 270 |
| 570-820 | `PromptSection` | 全局 Prompt + 条目 + 开关（13 props）| 251 |
| 822-912 | `ImportExportSection` | 导入导出逻辑 | 91 |
| 914-952 | `AboutSection` | 关于页 | 39 |
| 954-1298 | `SettingsPage`（主） | 状态初始化 + 所有 handler + 页面骨架 | 345 |

**额外发现**：内联的 Toggle Switch 按钮代码（`role="switch"`）在文件中出现 **4 次**（第 492-521、533-562、644-673、736-765、779-808 行），每次约 30 行，完全相同，共约 120 行重复 UI 代码。

### 建议拆分结构

```
frontend/src/
├── pages/
│   └── SettingsPage.jsx                    ← 精简到 ~100 行
│       职责：路由 hash → 面板映射 + overlay 骨架 + 顶层状态加载
│
├── hooks/
│   └── useSettingsConfig.js                ← ~160 行（新建）
│       职责：getConfig 加载、所有 handleXxxChange、patchConfig 封装
│       导出：{ llm, embedding, writingLlm, handlers... }
│
└── components/
    ├── ui/
    │   └── ToggleSwitch.jsx                ← ~35 行（提取 4 处重复的内联 switch）
    │       props: { checked, onChange, label, description }
    │
    └── settings/
        ├── LlmConfigPanel.jsx              ← ~200 行
        │   职责：LLM + Embedding + 代理 + 思考链配置
        │   deps: ProviderBlock, ModelSelector, WritingLlmBlock（均在此目录）
        │
        ├── ProviderBlock.jsx               ← ~95 行（从 LlmSection 提取，已是独立组件）
        ├── ModelSelector.jsx               ← ~48 行（从 LlmSection 提取）
        ├── WritingLlmBlock.jsx             ← ~52 行（从 LlmSection 提取）
        │
        ├── PromptConfigPanel.jsx           ← ~210 行
        │   职责：全局 System/Post Prompt + 条目 + 记忆展开 + 对话选项开关
        │
        ├── ImportExportPanel.jsx           ← ~92 行（直接搬移 ImportExportSection）
        └── AboutPanel.jsx                  ← ~40 行（直接搬移 AboutSection）
```

**拆分后行数估算**：

| 文件 | 拆分后行数 | 减幅 |
|---|---|---|
| `SettingsPage.jsx` | ~100 行 | -92% |
| `LlmConfigPanel.jsx` | ~200 行 | 新建 |
| `PromptConfigPanel.jsx` | ~210 行 | 新建 |
| 其余 5 个文件 | 35~95 行各 | 新建 |
| `useSettingsConfig.js` | ~160 行 | 新建 |

**拆分关键点**：
1. `useSettingsConfig` hook 将 `SettingsPage` 中 18 个 `useState` + 8 个 `handleXxx` 函数提取到 hook，主组件降为纯 JSX 路由
2. `ToggleSwitch.jsx` 消除 4 处重复的内联开关代码（120 行 → 1 个 35 行组件）
3. `LlmSection` 的 14 props 随拆分自然消除——各子组件直接从 `useSettingsConfig` hook 取值

---

## 文件二：`backend/llm/providers/openai.js`（913 行）

### 当前职责

文件命名为 `openai.js` 但实际承担 **3 个 Provider + 4 个功能层** 的全部实现：

| 行范围 | 模块 | 职责 | 行数 |
|---|---|---|---|
| 14-79 | 工具层 | getBaseUrl、parseDataUrl、apiError、parseSSE | 66 |
| 85-236 | 消息转换层 | convertToAnthropicMessages、convertToGeminiContents 及其辅助函数 | 152 |
| 242-345 | OpenAI-compatible | streamOpenAICompatible + completeOpenAICompatible | 104 |
| 351-479 | Anthropic 原生 | streamAnthropic + completeAnthropic + resolveThinkingBudget | 129 |
| 485-577 | Gemini 原生 | streamGemini + completeGemini | 93 |
| 583-605 | 路由导出 | streamChat + complete（if-else-if） | 23 |
| 611-635 | Tool-use 工具 | executeToolCall、toAnthropicTools、toGeminiTools | 25 |
| 641-773 | Tool loop × 3 | completeOpenAICompatibleWithTools / AnthropicWithTools / GeminiWithTools | 133 |
| 779-887 | resolveToolContext × 3 | resolveToolContextOpenAI / Anthropic / Gemini | 109 |
| 893-913 | 路由导出 | completeWithTools + resolveToolContext（if-else-if） | 21 |

**核心问题**：三个 Provider 的 tool loop 结构完全相同（各约 45 行），resolveToolContext 三版本结构完全相同（各约 36 行），合计约 240 行可提取的重复逻辑。

### 建议拆分结构

```
backend/llm/providers/
│
├── _utils.js                               ← ~70 行（工具函数层）
│   导出: getBaseUrl, parseDataUrl, apiError, parseSSE
│
├── _converters.js                          ← ~160 行（消息格式转换层）
│   导出: convertToAnthropicMessages, convertContentToAnthropic
│         convertToGeminiContents, convertContentToGemini
│
├── _tool-loop.js                           ← ~90 行（工具调用循环共享逻辑）
│   导出: createToolLoop(callFn, parseResponse, toMessages)
│         ← 消除三套 for(let i=0;i<5;i++) 的重复循环逻辑
│
├── openai-compatible.js                    ← ~115 行
│   职责: streamOpenAICompatible, completeOpenAICompatible
│         completeWithTools（调用 _tool-loop）
│         resolveToolContext（调用 _tool-loop）
│         resolveReasoningEffort
│
├── anthropic.js                            ← ~145 行
│   职责: streamAnthropic, completeAnthropic
│         resolveThinkingBudget
│         completeWithTools（调用 _tool-loop）
│         resolveToolContext（调用 _tool-loop）
│         toAnthropicTools
│
├── gemini.js                               ← ~110 行
│   职责: streamGemini, completeGemini
│         completeWithTools（调用 _tool-loop）
│         resolveToolContext（调用 _tool-loop）
│         toGeminiTools
│
└── index.js                                ← ~55 行（路由层，原 openai.js 的统一导出）
    职责: streamChat, complete, completeWithTools, resolveToolContext
          OPENAI_COMPATIBLE Set、provider 路由 if-else-if（保持现有结构）
    ← 此文件即为 llm/index.js 当前的 import 对象
```

**拆分后行数估算**：

| 文件 | 拆分后行数 | 说明 |
|---|---|---|
| `_utils.js` | ~70 行 | 纯工具，无依赖 |
| `_converters.js` | ~160 行 | 消息格式转换，仅依赖 _utils |
| `_tool-loop.js` | ~90 行 | 消除 240 行三套重复循环 |
| `openai-compatible.js` | ~115 行 | 依赖 _utils、_tool-loop |
| `anthropic.js` | ~145 行 | 依赖 _utils、_converters、_tool-loop |
| `gemini.js` | ~110 行 | 依赖 _utils、_converters、_tool-loop |
| `index.js`（路由层）| ~55 行 | 依赖以上所有 |

**拆分关键点**：
1. `_tool-loop.js` 是最高价值的提取——三套工具循环（completeXxxWithTools + resolveToolContextXxx）结构完全相同，提取后消除约 240 行重复代码
2. `_converters.js` 将消息格式转换与 API 调用解耦，便于独立测试
3. 对外接口（`llm/index.js` 的 import）无需改动——`providers/index.js` 保持相同的 export 签名
4. `resolveAnthropicThinking` @deprecated 别名在拆分时顺便删除

---

## 拆分优先级

| 优先级 | 文件 | 预计工作量 | 核心收益 |
|---|---|---|---|
| 1 | `SettingsPage.jsx` → 提取 `ToggleSwitch` + `useSettingsConfig` | 0.5 天 | 消除 120 行重复 UI + 14 props 问题 |
| 2 | `SettingsPage.jsx` → 拆分 5 个 Panel 组件 | 1.5 天 | 文件从 1298 行降至 ~100 行 |
| 3 | `openai.js` → 提取 `_tool-loop.js` | 1 天 | 消除 240 行三套重复循环 |
| 4 | `openai.js` → 完整拆分为 6 个文件 | 2 天 | 文件从 913 行降至最大 160 行 |

---

# WorldEngine 技术债地图
> 生成时间：2026-04-20
> 本节为合并前 9 轮审查结果并新增发现后的最终综合视图。已记录问题不重复展开，仅汇总计数并标注位置。

---

## 一、模块风险热力图

每列含义：**设**=设计债 / **代**=代码债 / **测**=测试债 / **运**=运营债（并发/恢复/可观测）。● 有明确问题，◐ 局部问题，○ 无明显问题。

| 模块 | 行数 | 设 | 代 | 测 | 运 | 风险层级 | 已记录问题数 |
|---|---|---|---|---|---|---|---|
| `backend/llm/providers/openai.js` | 913 | ● | ● | ● | ◐ | 🔴 极高 | 8 |
| `backend/routes/chat.js` | 523 | ● | ● | ● | ● | 🔴 极高 | 6 |
| `backend/memory/combined-state-updater.js` | 323 | ● | ● | ● | ● | 🔴 极高 | 5 |
| Dead code cluster（summarizer+embedder+session-summaries）| ~280 | ● | ● | ○ | ● | 🔴 极高 | 4 |
| `backend/services/import-export.js` | 675 | ● | ● | ● | ◐ | 🟠 高 | 4 |
| `backend/llm/index.js` | 334 | ◐ | ● | ● | ◐ | 🟠 高 | **3（新）** |
| `frontend/src/pages/SettingsPage.jsx` | 1298 | ● | ● | ● | ○ | 🟠 高 | 5 |
| `backend/prompt/assembler.js` | 466 | ◐ | ● | ● | ○ | 🟠 高 | 3 |
| `backend/memory/recall.js` | 318 | ◐ | ● | ● | ○ | 🟡 中 | 3 |
| `backend/routes/session-state-values.js` | ~200 | ● | ● | ◐ | ● | 🟡 中 | **3（新）** |
| `backend/services/state-values.js` | 202 | ◐ | ◐ | ◐ | ● | 🟡 中 | **2（新）** |
| `backend/services/cleanup-registrations.js` | ~100 | ○ | ○ | ○ | ● | 🟡 中 | **2（新）** |
| `backend/utils/async-queue.js` | 109 | ○ | ○ | ◐ | ● | 🟡 中 | 1 |

---

## 二、新增发现（前 9 轮未记录）

### [TD-1] llm/index.js：三套重试循环结构完全相同

- **位置**: `backend/llm/index.js`：`chat()`（第 118-163 行）、`completeWithTools()`（第 208-235 行）、`complete()`（第 301-330 行）
- **问题**: 三个函数各自包含约 50 行几乎相同的 `for (attempt <= LLM_RETRY_MAX)` 重试模板——错误分类（AbortError / 4xx / 429）、sleep 间隔、warn 日志格式完全相同。修改重试策略（如改为指数退避）需同步改三处。
- **额外不一致**: `resolveToolContext()`（第 258-271 行）**无重试循环**，静默降级返回原始 messages；与其他三个函数行为不一致，调用方无感知。
- **建议**: 提取 `withRetry(fn, config)` 高阶函数统一重试逻辑；`resolveToolContext` 加 warn 日志标注静默降级行为。

---

### [TD-2] state-values.js：reset 操作的 N+1 + 无事务

- **位置**: `backend/services/state-values.js`：`resetCharacterStateValuesValidated()`（第 100-114 行）、`resetWorldStateValuesValidated()`（第 134-150 行）、`resetPersonaStateValuesValidated()`（第 170-184 行）
- **问题**: 三个 reset 函数均在循环内逐条调用 `upsertXxxStateValue()`，10 个字段 = 10 次 DB 调用（N+1）。且无事务包裹——第 3 条 upsert 若失败，字段 1-2 已重置、4-10 未重置，数据库处于部分状态无法回滚。
- **建议**: 三个函数包裹 `db.transaction()`；用批量 upsert 或 `INSERT INTO ... SELECT` 替代循环。

---

### [TD-3] cleanup-registrations.js：清理钩子无错误隔离

- **位置**: `backend/services/cleanup-registrations.js`，第 35-89 行所有 `registerOnDelete` 回调
- **问题**: 所有清理钩子（删除附件文件、向量条目、session/character 关联数据）均无 try-catch。若 `getSessionIdsByCharacterId()` 抛错或 `deleteBySessionId()` 失败，错误冒泡到 `runOnDelete`，可能中断后续钩子执行，且磁盘/向量残留无法感知。
- **额外问题**: 第 60-63、80-83、86-89 行：按 session 循环调用清理函数（O(n) DB 调用）；关联 100 个 session 的角色删除时产生 100 次独立向量删除调用。
- **建议**: 每个钩子回调内加 `try-catch + log.warn`；向量批量删除接口（`deleteByWorldId` 已有）扩展为支持 session 数组传入。

---

### [TD-4] session-state-values.js：缺少 session 归属校验

- **位置**: `backend/routes/session-state-values.js`，第 28 行（GET）、第 172-174 行（DELETE）
- **问题**: 路由层通过 `sessionId` 直接查询状态值，未验证该 session 是否属于当前请求上下文（无用户认证系统，但 session 隔离应由服务端保证）。任意客户端可构造其他 sessionId 读取/删除任意 session 的状态值。
- **当前影响**: 本地单用户工具，实际暴露面有限；但若未来接入多用户或网络部署，此处为越权读取漏洞入口。
- **建议**: 至少在 GET/DELETE 前验证 session 是否属于已知 worldId 范围；在 ARCHITECTURE.md 标注"当前无跨 session 访问控制"。

---

### [TD-5] async-queue.js：dropped 任务 reject 可能产生 unhandled rejection

- **位置**: `backend/utils/async-queue.js`，第 80-82 行（`dropped.reject(new Error('Queue full'))`)
- **问题**: 队列满时丢弃最低优先级任务并 reject 其 Promise。调用方（`backend/routes/chat.js`、`backend/routes/writing.js`）通过 `enqueue(...)` 触发但不对 Priority 4/5 任务的 reject 做 `.catch()` 处理，可能产生 unhandled promise rejection（Node.js 未捕获的 rejection 会打印警告，高频时影响日志可读性）。
- **建议**: `enqueue` 调用处对非关键任务（priority >= 4）加 `.catch(() => {})`；或在 `drain` 内统一对 reject 加 `process.nextTick` 降级处理。

---

## 三、架构风险区（跨模块）

### 风险区 A：SSE + 全局状态竞态

- **涉及模块**: `services/chat.js`（activeStreams 声明）、`routes/chat.js`（SSE 发起）、`routes/writing.js`（SSE 发起）、`routes/stream-helpers.js`（activeStreams 修改）
- **风险**: 同一 session 快速重复请求时，旧 controller 被新 controller 覆盖但事件处理器可能仍在运行；无超时清理，流中断后条目永久残留；水平扩展时 Map 无法跨进程共享。
- **影响面**: 每次对话生成均经过此路径，是最高频的运营风险区。

### 风险区 B：异步记忆链无降级保护

- **涉及模块**: `async-queue.js` → `turn-summarizer.js` → `turn-summary-vector-store.js` → `combined-state-updater.js`
- **风险**: 一次对话结束后触发 3-4 次 LLM 调用（title + turn-record + state update）。任一 LLM 调用失败无重试（queue 层只重试 LLM 错误，异步任务本身不重试）；turn-record 失败导致向量召回缺口，状态更新失败导致下轮状态错误；无告警，用户无感知。
- **影响面**: 所有对话的记忆质量均依赖此链路可靠性。

### 风险区 C：Provider 路由分散在两层

- **涉及模块**: `llm/index.js`（本地/云端二路分流）、`llm/providers/openai.js`（openai/anthropic/gemini 三路 if-else-if，8 处）
- **风险**: 新增 provider 需改两处（index.js 的 LOCAL_PROVIDERS Set + openai.js 的 8 处 if-else-if），极易漏改；openai.js 中 `completeWithTools`/`resolveToolContext` 未走 index.js 的重试层，provider 级别的错误不被自动重试。
- **影响面**: 未来接入新 provider 时风险最高。

### 风险区 D：状态数据一致性无保证

- **涉及模块**: `combined-state-updater.js`（写入）、`state-values.js`（reset）、`session-state-values.js`（读取，含 N+1）
- **风险**: updateAllStates 内多表写入无事务；reset 操作无事务；N+1 查询在高并发下可能读到部分更新中间态；无乐观锁或版本号机制。
- **影响面**: 角色/世界状态是核心用户数据，一致性破坏直接影响游戏叙事连贯性。

---

## 四、技术债总量估算

| 债务类型 | 累计问题点 | 主要集中模块 |
|---|---|---|
| **设计债** | 14 处 | openai.js、chat.js、combined-state-updater.js、import-export.js |
| **代码债（重复）** | 11 处 | openai.js、recall.js、state-fields三件套、api层5文件 |
| **代码债（大函数）** | 6 处 | buildPrompt、runStream、importWorld、updateAllStates |
| **测试债** | 全部（0% 覆盖）| - |
| **运营债（并发/一致性）** | 8 处 | activeStreams、状态事务、async-queue、清理钩子 |
| **死代码** | 10 处（1 整子系统）| session-summary 集群、消息压缩残留 |
| **安全/隐患** | 2 处 | session 越权读取、ChatPage.jsx 静默 404 |
| **合计** | **~61 处** | - |

**行数维度**：可消除冗余代码约 **800-1000 行**（死代码 ~280 行 + 重复逻辑 ~500 行 + 内联可提取组件 ~120 行）；可合并拆分后净减约 **400 行**。

---

## 五、全项目清理优先级矩阵

综合前 9 轮审查 + 本轮新发现，按**影响 × 实施风险**排序：

| 优先 | 类型 | 位置 | 工作量 | 影响 | 风险 |
|---|---|---|---|---|---|
| **P0** | 删除死代码 | session-summary 集群（D-1→D-4）| 0.5 天 | 消除静默 404 + 280 行冗余 | 极低 |
| **P0** | 删除死调用 | `ChatPage.jsx:567 triggerSummary()` | 1h | 修复生产静默错误 | 极低 |
| **P1** | 事务保护 | `state-values.js` reset + `combined-state-updater.js` | 1 天 | 防止状态数据撕裂 | 低 |
| **P1** | 清理钩子防错 | `cleanup-registrations.js` 全部钩子加 try-catch | 0.5 天 | 防止删除残留 | 极低 |
| **P1** | 错误处理 return | `routes/*-state-values.js:34-40`（M1）| 0.5 天 | 修复双响应 bug | 极低 |
| **P1** | SSE 流管理 | 提取 `services/stream-manager.js`（超时+清理）| 1.5 天 | 消除流泄漏运营风险 | 低 |
| **P2** | 提取重试逻辑 | `llm/index.js` → `withRetry()` 高阶函数（TD-1）| 1 天 | 统一重试策略 | 低 |
| **P2** | Tool loop 合并 | `openai.js` → `_tool-loop.js` 消除 240 行重复 | 1 天 | 降低 provider 改动成本 | 低 |
| **P2** | SQL 下沉 | `routes/session-state-values.js` → `db/queries/` 层 + IN 查询替代循环 | 1 天 | 修复架构违规 + N+1 | 低 |
| **P2** | 提取 request() | `frontend/src/api/request.js`（CP-1）| 0.5 天 | 消除 55 行重复 | 极低 |
| **P3** | SettingsPage 拆分 | ToggleSwitch + useSettingsConfig + 5 Panel 组件 | 2 天 | 降低前端维护成本 | 低 |
| **P3** | Provider 策略化 | `openai.js` 8 处 if-else-if → 策略模式（CS-1）| 1.5 天 | 新 provider 改 1 处 | 中 |
| **P3** | renderState 合并 | `recall.js` 3×renderXxxState → 通用函数（CS-3）| 0.5 天 | 消除 SQL bug 三改 | 低 |
| **P4** | 三件套工厂化 | `db/queries/*-state-fields.js` → factory（问题 #4）| 2 天 | 新字段改 1 处 | 中 |
| **P4** | openai.js 完整拆分 | 拆为 7 个文件（见大文件报告）| 2 天 | 文件 913→160 行 | 中 |
| **P4** | 测试基础设施 | `backend/tests/` + Sinon + 纯函数单测 Phase 1 | 2 周 | 建立 0% → 可观测覆盖率 | 低 |

---

## 六、债务集中度结论

**最高技术债模块（按债务类型数计）**：

1. `backend/llm/providers/openai.js` — 设计/代码/测试 三类债务，8 个已记录问题 + 文件最大，是**单文件风险最高模块**
2. `backend/routes/chat.js` — Feature Envy + 长函数 + SSE 运营风险 + 测试不可达，**运营影响最大**
3. `backend/memory/combined-state-updater.js` — God Object + 无事务 + LLM 耦合，**数据一致性风险最高**
4. Dead code cluster — 静默 404 + 280 行活跃冗余，**最快可消除，ROI 最高**

**全局结论**：项目骨架架构质量良好（无循环依赖、LLM 隔离、路由-服务-查询分层清晰），技术债主要集中在**粒度层面**（大函数未拆、重复逻辑未抽）和**运营层面**（无事务、无流清理、无错误隔离）。P0/P1 项均可在不改核心架构的情况下修复，累计工作量约 4-5 天，可消除最高影响的运营风险和数据一致性隐患。
