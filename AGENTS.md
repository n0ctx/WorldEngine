# WorldEngine — Claude Code 工作手册

## 行动原则（最高优先级）

- **先读后写**：执行任何任务前，必须先阅读 `SCHEMA.md` `ARCHITECTURE.md` `CHANGELOG.md`；修改任何文件前，必须先阅读该文件现有内容；如需要其他信息，查询git commit，claude mem skill。
- **强制规划**：3 个步骤以上的任务，必须先列出计划并等待确认，再动手
- **强制验证**：完成任务后必须能说明如何验证，不能仅凭"看起来对"交差
- **范围克制**：每次任务只修改任务指令明确要求的文件，禁止"顺手重构"
- **及时止损**：多次尝试失败或上下文逼近极限时，主动停止并告知用户
- **及时留痕**：完成一个任务并验收后，CHANGELOG.md 追加一条记录。
- **及时更新**：执行任何任务后，必须及时更新 `CLAUDE.md` `SCHEMA.md` `ARCHITECTURE.md` `CHANGELOG.md` (如果涉及)；
- **测试/临时文件归档**：所有测试文件、测试目录、临时文件、临时目录统一放在项目根目录 `/.temp/`；仓库其他位置禁止新增或保留此类内容

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

## 关键路径（约束导航用）

```
/frontend/src/api/              # 所有 fetch 封装，禁止在组件内直接调用
/frontend/src/styles/           # CSS 变量与全局样式（tokens.css 定义所有 --we-* 变量）
/frontend/src/components/book/  # 书卷风 UI 组件（QuillCursor、SealStampAnimation、CharacterSeal）
/backend/routes/                # HTTP 路由，只做参数校验，不含业务逻辑
/backend/services/              # 业务逻辑层
/backend/db/queries/            # 所有 DB 操作，路由层禁止直接查询
/backend/memory/recall.js       # 状态/时间线/摘要渲染，注入 [3][5][7][11][12][13]
/backend/prompt/assembler.js    # 锁定文件：提示词组装顺序
/backend/utils/constants.js     # 锁定文件：所有硬性数值常量
/frontend/src/store/index.js    # 锁定文件：全局状态
/backend/server.js              # 锁定文件：入口
```

完整目录结构见 `ARCHITECTURE.md §2`。

---

## 常用命令

```bash
cd frontend && npm run dev     # 前端 http://localhost:5173
cd backend  && npm run dev     # 后端 http://localhost:3000
cd frontend && npm run build   # 构建前端
cd backend  && npm run db:reset  # 重置数据库（开发用）
```

每次任务完成后git commit（每次commit前必须更新`CHANGELOG.md`）。修改了架构相关功能时，同步覆盖更新 `ARCHITECTURE.md` 对应节。

---

## 不可随意修改的文件

以下文件一旦完成即锁定，未经明确要求禁止改动：

| 文件 | 说明 |
|---|---|
| `SCHEMA.md` | 数据库字段权威来源，改字段/加表必须同步更新此文件 |
| `/backend/db/schema.js` | 实际建表文件，结构以 SCHEMA.md 为准；新增表/字段时用 `CREATE TABLE IF NOT EXISTS` 或 `ALTER TABLE IF NOT EXISTS` 追加，不重建已有表 |
| `/backend/utils/constants.js` | 所有硬性数值常量的唯一来源；新增常量需说明用途和来源 |
| `/backend/prompt/assembler.js` | 提示词组装顺序硬编码（16 段，见"提示词组装顺序"速查），顺序不得改变；需修改时明确指出改动的段号 |
| `/frontend/src/store/index.js` | 全局状态定义 |
| `server.js` | 入口文件；已含 `import './services/cleanup-registrations.js'` 副作用 import |

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

**异步队列优先级**（数字越小越高，2/3 不可丢弃，4/5 可丢弃；优先级 1 预留未用）
- 2: 角色状态栏更新 / 玩家状态栏更新 / title 生成（title 仅当 session.title 为 NULL 时入队）
- 3: 世界状态栏更新 / `createTurnRecord(sessionId)`（per-turn 摘要，在世界状态更新之后入队，捕获本轮结果状态）
- 编辑消息或重新生成时，清空该 sessionId 队列中优先级 4/5 的未开始任务

**副作用资源扩展规则**
- 新增任何带磁盘文件或向量的子资源时，**只在 `/backend/services/cleanup-registrations.js` 注册钩子**，不改 `deleteWorld` / `deleteCharacter` / `deleteSession` 等核心 delete 函数
- 钩子通过 `registerOnDelete(entity, async id => {...})` 注册，entity 为 `'world' | 'character' | 'session' | 'message'`
- 钩子失败只 warn，不影响 DB DELETE；runOnDelete 在 DB DELETE 之前调用

**提示词组装顺序**（硬编码在 assembler.js，顺序不得改变）
```
[system 消息，[1]–[13] 合并为单个 role:system]
[1]  全局 System Prompt
[2]  世界 System Prompt
[3]  世界状态              renderWorldState(world.id)
[4]  玩家 System Prompt    [用户人设] name + system_prompt（均为空则跳过）
[5]  玩家状态              renderPersonaState(world.id)
[6]  角色 System Prompt
[7]  角色状态              renderCharacterState(character.id)
[8]  全局 Prompt 条目      命中→content，未命中→summary
[9]  世界 Prompt 条目
[10] 角色 Prompt 条目
[11] 世界时间线            renderTimeline(world.id)
[12] 召回摘要              searchRecalledSummaries → renderRecalledSummaries（turn_summaries 向量库）
[13] 展开原文              decideExpansion → renderExpandedTurnRecords

[历史消息：role:user/assistant 交替]
[14] 历史消息（turn records 新路径，最近 context_history_rounds 轮；
              无 turn records 时降级为 getUncompressedMessagesBySessionId；
              prompt_only scope 正则在此处理）

[尾部 user 消息]
[15] 后置提示词（全局 global_post_prompt → 世界 post_prompt → 角色 post_prompt，
               均空则跳过；合并为单条 role:user 消息）
[16] 当前用户消息          role:user（DB 中最新的 user 消息）
```

**生成参数覆盖层级**：`世界级 > 全局`，worlds 表字段为 NULL 时回退全局配置

**前端**
- 所有 fetch 调用封装在 `/frontend/src/api/`，组件内禁止直接调用
- 样式只用 TailwindCSS 工具类，不写内联 style，颜色/字体/圆角/阴影统一走 CSS 变量（`--we-*` 前缀，定义于 `frontend/src/styles/tokens.css`），禁止硬编码色值
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


<claude-mem-context>
# Memory Context

# $CMEM WorldEngine 2026-04-18 11:47pm GMT+8

No previous sessions found.
</claude-mem-context>
