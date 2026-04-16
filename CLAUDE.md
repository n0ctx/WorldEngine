# WorldEngine — Claude Code 工作手册

## 行动原则（最高优先级）

- **先读后写**：修改任何文件前，必须先阅读该文件现有内容，以及CHANGELOG.md
- **强制规划**：3 个步骤以上的任务，必须先列出计划并等待确认，再动手
- **强制验证**：完成任务后必须能说明如何验证，不能仅凭"看起来对"交差
- **范围克制**：每次任务只修改任务指令明确要求的文件，禁止"顺手重构"
- **及时止损**：多次尝试失败或上下文逼近极限时，主动停止并告知用户

---

## 项目概览

架构层级：`全局 → 世界 → 角色 → 会话`，每层有独立的提示词、配置和记忆，下层不可覆盖上层。详细架构见 `ARCHITECTURE.md`。

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
    writing.js                  # T34
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
    cleanup-registrations.js    # T30：副作用钩子注册
    writing-sessions.js         # T34
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
      writing-sessions.js       # T34
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

每次任务完成后，阅读 CHANGELOG.md，在最上方追加一条记录；并且git commit。修改了架构相关功能时，同步覆盖更新 `ARCHITECTURE.md` 对应节。

---

## 不可随意修改的文件

以下文件一旦完成即锁定，未经明确要求禁止改动：

| 文件 | 原因 |
|---|---|
| `SCHEMA.md` | 数据库字段权威来源，改字段必须同步更新此文件；**允许的例外**：T30 为 personas 表增加 `avatar_path TEXT` 字段；T32 为 messages/sessions/world_timeline 表增加压缩相关字段 |
| `/backend/db/schema.js` | 实际建表文件，结构以 SCHEMA.md 为准；**允许的例外**：T30 为 personas 表增加 `avatar_path TEXT` 字段并加 ALTER TABLE 迁移；T31 为 worlds/characters 表增加 `post_prompt TEXT` 字段并加 ALTER TABLE 迁移；T32 为 messages 加 `is_compressed`、world_timeline 加 `session_id`/`updated_at`，sessions DDL 加 `compressed_context`，并加 ALTER TABLE 迁移和索引 |
| `/backend/utils/constants.js` | 所有硬性数值常量的唯一来源；**允许的例外**：T32 将 `WORLD_TIMELINE_RECENT_LIMIT` 从 20 改为 5 |
| `/backend/prompt/assembler.js` | 提示词组装顺序硬编码，**允许的例外**：T21 填入 [6] 位置；T24B 在 [7] 历史消息位置对 `prompt_only` scope 调用 regex-runner；T28 签名改为 `buildPrompt(sessionId, options?)` 加 onRecallEvent 回调，[6] 末尾追加展开原文段；T31 调整 [2][3] 顺序（世界提前于 Persona），[8] 后追加后置提示词 user 消息；T32 在 [6] 之前注入 `compressed_context`，[7] 改用 `getUncompressedMessagesBySessionId` |
| `/frontend/src/store/index.js` | 全局状态定义 |
| `server.js` | 入口文件；**允许的例外**：T30（副作用生命周期）新增一行 `import './services/cleanup-registrations.js';`，触发钩子注册副作用 |

> 例外登记机制：上述锁定不是"永不改动"，而是"非例外不改动"。当某任务明确需要变更锁定文件时，必须在本表对应行用加粗 `**允许的例外**` 字样列出任务号与改动点（如 `assembler.js` 一行所示）。已存在例外：`SCHEMA.md` 与 `schema.js` 在 T19A / T26C 中扩展了状态系统三张表，`assembler.js` 的 [6] 位置在 T21 / T26C / T27 / T28 中追加了 recall 段和展开原文段。

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
- 1: `maybeCompress(sessionId)`（T32 起替换原 summary 生成；内部按阈值决定是否生成 summary + 压缩 + 时间线 upsert + embed）
- 2: 角色状态栏更新 / 玩家状态栏更新 / title 生成（title 仅当 session.title 为 NULL 时入队）
- 3: 世界状态栏更新
- ~~4: 世界时间线~~（T32 起已移入 maybeCompress 内部，不再独立入队）
- ~~5: Prompt 条目向量化~~（T32 起已移入 maybeCompress 内部，不再独立入队）
- 编辑消息或重新生成时，清空该 sessionId 队列中优先级 4/5 的未开始任务

**副作用资源扩展规则**（T30 起执行）
- 新增任何带磁盘文件或向量的子资源时，**只在 `/backend/services/cleanup-registrations.js` 注册钩子**，不改 `deleteWorld` / `deleteCharacter` / `deleteSession` 等核心 delete 函数
- 钩子通过 `registerOnDelete(entity, async id => {...})` 注册，entity 为 `'world' | 'character' | 'session' | 'message'`
- 钩子失败只 warn，不影响 DB DELETE；runOnDelete 在 DB DELETE 之前调用

**提示词组装顺序**（硬编码在 assembler.js，顺序不得改变）
```
[1] 全局 System Prompt
[2] 世界 System Prompt
[3] 用户 Persona（均为空则整段跳过）
[4] 角色 System Prompt
[5] Prompt 条目（命中→注入 content，未命中→注入 summary；全局→世界→角色顺序）
[6] 状态与记忆注入（玩家状态 + 角色状态 + 世界状态 + 世界时间线 + 历史摘要召回 + 原文展开，由 recall.js 渲染；见 ARCHITECTURE.md §6）
[7] 历史消息（轮次压缩后，最少保留 CONTEXT_MIN_HISTORY_ROUNDS 轮；prompt_only scope 正则在此处理）
[8] 用户当前消息（已包含在历史记录中）+ 后置提示词（全局 global_post_prompt → 世界 post_prompt → 角色 post_prompt，非空部分合并为单条 role:user 消息追加）
```

**生成参数覆盖层级**：`世界级 > 全局`，worlds 表字段为 NULL 时回退全局配置

**前端**
- 所有 fetch 调用封装在 `/frontend/src/api/`，组件内禁止直接调用
- 样式只用 TailwindCSS 工具类，不写内联 style，颜色/字体/圆角/阴影统一走 CSS 变量（T29A 后全部以 `--we-*` 前缀命名），禁止硬编码色值
- 整体 Claude 风格（参考 `DESIGN.md`）：羊皮纸底色 + 陶土强调 + 暖色中性；衬线做标题、无衬线做 UI；环形阴影（`0 0 0 1px`）代替传统投影；单主题不做深浅色切换（用户如需暗色通过 T24A 自定义 CSS 片段覆盖 `--we-*` 变量即可）
- 语言：简体中文

---

## 关键设计速查

详细架构见 `ARCHITECTURE.md`：
- 提示词组装 → §4，记忆召回 → §6，SSE 事件 → §7
- 异步任务链 → §5，状态系统 → §8，正则替换管线 → §9
- 写作空间 → §11，副作用清理钩子 → §10

**上下文截断优先级**（绝不截断 → 最后截断）：`[1-4] System` > `[6] 状态与记忆` > `[8] 当前消息` > `[5] Prompt条目` > `[7] 历史消息`

**图片附件**：base64 随消息发送（不单独上传接口），后端解码存 `/data/uploads/attachments/`，路径写入 `messages.attachments`（JSON 字符串）。单条最多 3 张、单张不超过 5MB，前端校验。

**角色卡/世界卡格式**：`.wechar.json`（format: worldengine-character-v1）/ `.weworld.json`（format: worldengine-world-v1），不兼容 SillyTavern 格式。导出包含状态字段定义和状态值。

**persona 无 Prompt 条目**：persona 只有 name 和 system_prompt，与角色不同，没有 Prompt 条目。

**自定义 CSS**：前端拼接所有 `enabled=1` 条目后注入 `<style id="we-custom-css">`，全部为全局作用。

---

## 不做的功能

多用户系统、云端同步、图片生成、TTS、Visual Novel、多角色群聊、插件市场、ST 格式兼容、ST Regex 扩展格式兼容、深浅色主题切换、Prompt 顺序自定义、消息分支(Swipe)、Author's Note、会话内搜索、自动备份。
