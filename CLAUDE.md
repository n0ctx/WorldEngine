# WorldEngine — Claude Code 工作手册

## 行动原则（最高优先级）

- **先读后写**：修改任何文件前，必须先阅读该文件现有内容，以及CHANGELOG.md
- **强制规划**：3 个步骤以上的任务，必须先列出计划并等待确认，再动手
- **强制验证**：完成任务后必须能说明如何验证，不能仅凭"看起来对"交差
- **范围克制**：每次任务只修改任务指令明确要求的文件，禁止"顺手重构"
- **及时止损**：多次尝试失败或上下文逼近极限时，主动停止并告知用户

---

## 项目概览

**WorldEngine** — 面向创意写作/角色扮演的本地 LLM 前端。核心特点：在角色之上增加"世界"层，记忆系统包含 session summary、角色状态栏、世界状态栏、世界时间线四部分，并支持按世界前端配置状态字段模板；提示词采用渐进式披露。
架构层级：`全局 → 世界 → 角色 → 会话`，每层有独立的提示词、配置和记忆，下层不可覆盖上层。

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + Vite + TailwindCSS + Zustand |
| 后端 | Node.js + Express + ES Modules |
| 数据库 | SQLite（better-sqlite3） |
| 向量 | OpenAI embeddings 或 Ollama embeddings（可选） |

---

## 目录结构

```
/frontend/src/
  /components/{chat,characters,worlds,settings,memory,prompt,ui}
  /pages        # 页面级组件
  /hooks        # 自定义 hooks
  /store        # Zustand 全局状态
  /api          # 所有 fetch 封装，禁止在组件内直接调用
  /utils        # 工具函数

/backend/
  /routes       # HTTP 路由，只做参数校验和调用 service
    config.js
    worlds.js
    characters.js
    sessions.js
    chat.js
    prompt-entries.js
    state-fields.js             # T19B（世界/角色状态字段统一路由）
    world-state-values.js       # T22
    character-state-values.js   # T22
    world-timeline.js           # T22
    import-export.js            # T23
    custom-css-snippets.js      # T24A
    regex-rules.js              # T24B
    personas.js                 # T26C
    persona-state-fields.js     # T26C
    persona-state-values.js     # T26C
  /services     # 业务逻辑
    config.js
    worlds.js
    characters.js
    sessions.js
    chat.js
    prompt-entries.js
    world-state-fields.js       # T19B
    character-state-fields.js   # T19B
    import-export.js            # T23
    custom-css-snippets.js      # T24A
    regex-rules.js              # T24B
    personas.js                 # T26C
    persona-state-fields.js     # T26C
  /db           # 数据库：schema.js + /queries/*.js
    index.js
    schema.js
    /queries/
      worlds.js
      characters.js
      sessions.js
      messages.js
      session-summaries.js
      prompt-entries.js
      world-state-fields.js     # T19A
      character-state-fields.js # T19A
      world-state-values.js     # T19A
      character-state-values.js # T19A
      custom-css-snippets.js    # T24A
      regex-rules.js            # T24B
      personas.js               # T26C
      persona-state-fields.js   # T26C
      persona-state-values.js   # T26C
  /memory       # 记忆系统
    summarizer.js               # T18: session summary + title 生成
    character-state-updater.js  # T19D: 对话后异步更新角色状态
    world-state-updater.js      # T19D: 对话后异步更新世界状态
    persona-state-updater.js    # T26C: 对话后异步更新玩家状态
    world-timeline.js           # T20: 对话后异步追加世界时间线
    recall.js                   # T21: 渲染玩家状态/角色状态/世界状态/时间线为可读文本，注入 [6]
  /prompt       # 提示词：assembler.js + entry-matcher.js
  /llm          # LLM 接入层：index.js + embedding.js + /providers/
  /utils        # 工具：constants.js / async-queue.js / token-counter.js / vector-store.js / regex-runner.js（T24B）
  server.js     # 入口
```

---

## 常用命令

```bash
cd frontend && npm run dev     # 前端 http://localhost:5173
cd backend  && npm run dev     # 后端 http://localhost:3000
cd frontend && npm run build   # 构建前端
cd backend  && npm run db:reset  # 重置数据库（开发用）
```

每次任务完成后，阅读 CHANGELOG.md，在最上方追加一条记录；并且git commit。

---

## 不可随意修改的文件

以下文件一旦完成即锁定，未经明确要求禁止改动：

| 文件 | 原因 |
|---|---|
| `SCHEMA.md` | 数据库字段权威来源，改字段必须同步更新此文件 |
| `/backend/db/schema.js` | 实际建表文件，结构以 SCHEMA.md 为准 |
| `/backend/utils/constants.js` | 所有硬性数值常量的唯一来源 |
| `/backend/prompt/assembler.js` | 提示词组装顺序硬编码，**允许的例外**：T21 填入 [6] 位置；T24B 在 [7] 历史消息位置对 `prompt_only` scope 调用 regex-runner |
| `/frontend/src/store/index.js` | 全局状态定义 |
| `server.js` | 入口文件 |

> 例外登记机制：上述锁定不是"永不改动"，而是"非例外不改动"。当某任务明确需要变更锁定文件时，必须在本表对应行用加粗 `**允许的例外**` 字样列出任务号与改动点（如 `assembler.js` 一行所示）。已存在例外：`SCHEMA.md` 与 `schema.js` 在 T19A / T26C 中扩展了状态系统三张表，`assembler.js` 的 [6] 位置在 T21 / T26C / T27 中追加了 recall 段。

---

## 核心约束（执行任务时必须遵守）

**数据库**
- 所有表名、字段名以 `SCHEMA.md` 为准，禁止自行发明
- 数据库操作只能写在 `/backend/db/queries/` 里，路由层禁止直接查询
- 每次获取连接后立即执行 `PRAGMA foreign_keys = ON`
- 主键全部用 `crypto.randomUUID()`，时间戳用 `Date.now()`（毫秒）

**数值常量**
- 所有魔法数字必须引用 `/backend/utils/constants.js` 中的常量名，禁止硬编码

**LLM 调用分工**
- 对话生成 → 流式调用（`llm.chat()`）
- 记忆写操作（summary、状态栏、时间线）→ 非流式调用（`llm.complete()`）
- 两类调用严格分开，不得混用

**异步队列优先级**（数字越小越高，1/2/3 不可丢弃，4/5 可丢弃）
- 1: summary 生成
- 2: 角色状态栏更新 / 玩家状态栏更新 / title 生成（title 仅当 session.title 为 NULL 时入队）
- 3: 世界状态栏更新
- 4: 世界时间线
- 5: Prompt 条目向量化
- 编辑消息或重新生成时，清空该 sessionId 队列中优先级 4/5 的未开始任务

**提示词组装顺序**（硬编码在 assembler.js，顺序不得改变）
```
[1] 全局 System Prompt
[2] 用户 Persona（均为空则整段跳过）
[3] 世界 System Prompt
[4] 角色 System Prompt
[5] Prompt 条目（命中→注入 content，未命中→注入 summary；全局→世界→角色顺序）
[6] 状态与记忆注入（玩家状态 + 角色状态 + 世界状态 + 世界时间线，由 recall.js 渲染为可读文本；未来扩展：embedding 搜索历史 session summary 的渐进式展开）
[7] 历史消息（轮次压缩后，最少保留 CONTEXT_MIN_HISTORY_ROUNDS 轮）
[8] 用户当前消息（调用方传入）
```

**生成参数覆盖层级**：`世界级 > 全局`，worlds 表字段为 NULL 时回退全局配置

**前端**
- 所有 fetch 调用封装在 `/frontend/src/api/`，组件内禁止直接调用
- 样式只用 TailwindCSS 工具类，不写内联 style，颜色用 CSS 变量不硬编码
- 整体Claude风格，文学舒适
- 语言：简体中文

---

## 关键设计速查

**Session Summary 触发条件**：对话流正常结束（done）**且**该 session 至少有 1 条 user 消息。aborted 或仅有 first_message 时不触发。

**对话结束后异步任务链**（均在 done 且有 user 消息时触发）：
1. summary 生成（优先级 1）
2. title 生成（优先级 2，仅 title 为 NULL 时）
3. 角色状态栏更新（优先级 2，T19D 实现）
4. 玩家状态栏更新（优先级 2，T26C 实现）
5. 世界状态栏更新（优先级 3，T19D 实现）
6. 世界时间线追加（优先级 4，可丢弃，T20 实现）

**角色头像 Fallback**：`avatar_path` 为 NULL 时，显示基于角色 id hash 的纯色圆形 + 名字首字。封装在 `/frontend/src/utils/avatar.js` 的 `getAvatarColor(id)`。

**SSE 事件类型**：
- 已实现：`delta` / `done` / `aborted` / `type:error` / `type:title_updated`（T09 / T11）
- 已约定待实现：`type:memory_recall_start` / `type:memory_recall_done`（前端 api/chat.js 已监听，后端 chat.js 尚为 TODO，计划在 T27 随 recall 能力一起落地）
- 规划中：`type:memory_expand_start` / `type:memory_expand_done`（T28 渐进式展开原文）

详细规范见 ROADMAP.md T09 / T11 / T27 / T28 任务说明。

**图片附件**：base64 随消息发送（不单独上传接口），后端解码存 `/data/uploads/attachments/`，路径写入 `messages.attachments`（JSON 字符串）。单条最多 3 张、单张不超过 5MB，前端校验。

**角色卡/世界卡格式**：`.wechar.json`（format: worldengine-character-v1）/ `.weworld.json`（format: worldengine-world-v1），不兼容 SillyTavern 格式。导出包含状态字段定义和状态值。

**上下文截断优先级**（绝不截断 → 最后截断）：`[1-4] System` > `[6] 状态与记忆` > `[8] 当前消息` > `[5] Prompt条目` > `[7] 历史消息`

**状态系统**（T19A/B/C/D + T26C 拆分实现）：
- 每个世界可配置三套状态字段模板：世界状态字段（world_state_fields）、角色状态字段（character_state_fields）、玩家状态字段（persona_state_fields，T26C）
- 世界状态字段作用于 worlds，自身只有一份当前值（world_state_values）
- 角色状态字段作用于该世界下所有角色，每个角色各持有一份当前值（character_state_values）
- 玩家状态字段作用于该世界唯一的 persona 实例（personas 表 `world_id UNIQUE`，每个 world 一对一），自身只有一份当前值（persona_state_values）
- 字段模板在前端世界编辑页配置（T19B / T26C），支持 text/number/boolean/enum 四种类型
- 创建世界/角色时自动按模板初始化状态值（T19C / T26C）；创建世界时一并初始化 persona 行和 persona_state_values
- 对话后按配置异步更新状态值（T19D 角色+世界、T26C 玩家），只处理 update_mode=llm_auto 的字段
- trigger_mode 控制是否参与自动更新：manual_only（跳过）/ every_turn（每轮）/ keyword_based（关键词命中）
- 对 LLM 注入时，recall.js 将结构化状态渲染为可读文本，注入 [6] 位置（T21 + T26C）
- 前端记忆面板只读展示玩家状态、角色状态、世界状态、世界时间线（T22 + T26C）

**玩家（Persona）与世界的关系**（T26C）：
- 每个世界对应一个且仅一个 persona（personas 表 `world_id UNIQUE`）
- 创建世界时由 `services/worlds.createWorld` 自动 upsert persona 行和 persona_state_values 初值
- persona 只有 name 和 system_prompt 两个基础字段；**没有 Prompt 条目**（和角色不同）
- persona 的 name 和 system_prompt 注入到 assembler.js 的 [2] 位置（替换原 worlds.persona_name / persona_prompt）
- persona 的状态值渲染为可读文本注入 [6] 位置（顺序在最前，优先于角色状态）

**recall.js 职责**（T21 / T26C）：
- `renderPersonaState(worldId)` → 渲染玩家状态为可读文本（T26C 新增）
- `renderCharacterState(characterId)` → 渲染角色状态为可读文本
- `renderWorldState(worldId)` → 渲染世界状态为可读文本
- `renderTimeline(worldId, limit)` → 渲染世界时间线为可读文本
- 四段文本按「玩家 → 角色 → 世界 → 时间线」顺序拼接注入 assembler.js 的 [6] 位置，全部为空则 [6] 为空字符串
- 未来扩展：embedding 搜索历史 session summary，渐进式展开原文

**自定义样式与正则替换**（T24A/B）：
- 自定义 CSS：多条片段独立启用/禁用，全部为全局作用；前端拼接所有 `enabled=1` 条目后注入 `<style id="we-custom-css">`
- 正则替换：按 `scope` 分四种作用时机，同 scope 内按 `sort_order ASC` 链式套用，前一条结果作为后一条输入
  - `user_input` → 前端发送前处理（影响存库 + 显示 + prompt）
  - `ai_output` → 后端流式完结后、写 messages 前处理（影响存库 + 显示 + prompt）
  - `display_only` → 前端渲染时处理（仅视觉，不改存库）
  - `prompt_only` → 后端 assembler.js 组装 [7] 历史消息时处理（仅送入 LLM 的副本，不改存库不改显示）
- `world_id IS NULL` 的规则对所有世界生效；非 NULL 仅该世界会话生效
- 规则编译/执行失败时跳过该条并记日志，不中断管线

---

## 不做的功能

多用户系统、云端同步、图片生成、TTS、Visual Novel、多角色群聊、插件市场、ST 格式兼容、ST Regex 扩展格式兼容、深浅色主题切换、Prompt 顺序自定义、消息分支(Swipe)、Author's Note、会话内搜索、自动备份。
