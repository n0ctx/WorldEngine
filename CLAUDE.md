# WorldEngine — Claude Code 工作手册

> 本文件是仓库根目录文档系统的唯一入口正文。
> `AGENTS.md` 仅为镜像入口，出现冲突时一律以 `CLAUDE.md` 为准。

## 行动原则（最高优先级）

- **先读后写**：执行任何任务前，必须先阅读 `SCHEMA.md` `ARCHITECTURE.md` `CHANGELOG.md`；修改任何文件前，必须先阅读该文件现有内容；如需要其他信息，查询git commit，claude mem skill。
- **强制规划**：3 个步骤以上的任务，必须先列出计划并等待确认，再动手
- **强制验证**：完成任务后必须能说明如何验证，不能仅凭"看起来对"交差
- **范围克制**：每次任务只修改任务指令明确要求的文件，禁止"顺手重构"
- **清理历史遗留**：改功能时，必须同步清除该功能相关的历史废代码、死路径、过时注释；本项目不是发布版，无需保留向后兼容层
- **链路完整性**：改任何模块前，先梳理该模块的上下游调用方；改完后确认所有调用链路（路由→服务→查询、组件→API→后端）仍然正确联通，不可只验证改动点本身
- **及时止损**：多次尝试失败或上下文逼近极限时，主动停止并告知用户
- **及时留痕**：完成一个任务并验收后，CHANGELOG.md 追加一条记录。
- **及时更新**：执行任何任务后，必须及时更新相关文件 `CLAUDE.md` `SCHEMA.md` `ARCHITECTURE.md` `CHANGELOG.md`；`CLAUDE.md` 是唯一入口正文，`AGENTS.md` 仅保留镜像说明。
- **测试/临时文件归档**：所有测试文件、测试目录、临时文件、临时目录统一放在项目根目录 `/.temp/`；仓库其他位置禁止新增或保留此类内容

---

## 项目概览

架构层级：`全局 → 世界 → 角色 → 会话`，每层有独立的提示词、配置和记忆，下层不可覆盖上层。详细架构见 `ARCHITECTURE.md`。

---

## 文档分工

| 文件 | 唯一职责 |
|---|---|
| `CLAUDE.md` | 入口规范：AI agent 行动规则、文档导航、执行约束 |
| `AGENTS.md` | 镜像入口：只负责把通用 agent 导向 `CLAUDE.md` |
| `SCHEMA.md` | 数据结构权威来源：表、字段、配置格式、导入导出格式 |
| `ARCHITECTURE.md` | 当前运行时行为：模块职责、数据流、异步链路、接口拼装 |
| `CHANGELOG.md` | 历史决策与隐性坑点：未来 agent 需要知道但其他文档找不到的内容 |
| `DESIGN.md` | 视觉设计规范：调色板、字体、阴影、组件风格参考 |

判定规则：
- 查字段、表、JSON 格式：只看 `SCHEMA.md`
- 查“系统现在怎么工作”：只看 `ARCHITECTURE.md`
- 查工程规范和执行边界：只看 `CLAUDE.md`
- 查历史背景、兼容约束、已踩过的坑：只看 `CHANGELOG.md`
- `CHANGELOG.md` 不是当前行为权威来源；若与 `SCHEMA.md` / `ARCHITECTURE.md` 冲突，以权威文档为准

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
/backend/memory/recall.js       # 状态/时间线/摘要渲染，注入 [2][4][6][9][10]
/backend/prompts/assembler.js   # 锁定文件：提示词组装顺序
/backend/utils/constants.js     # 锁定文件：所有硬性数值常量
/frontend/src/store/index.js    # 锁定文件：全局状态
/backend/server.js              # 锁定文件：入口
/assistant/CONTRACT.md          # 写卡助手接口契约（单代理 + Agent Skill / proposal schema / SSE 事件）
```

完整目录结构见 `ARCHITECTURE.md §2`。

---

## 常用命令

```bash
npm install --prefix frontend && npm install --prefix backend  # 首次安装依赖
cd frontend && npm run dev     # 前端 http://localhost:5173
cd backend  && npm run dev     # 后端 http://localhost:3000
cd frontend && npm run build   # 构建前端
cd backend  && npm run db:reset  # 重置数据库（开发用）
```

每次任务完成后git commit（每次commit前必须更新`CHANGELOG.md`）。

日志模式通过 `data/config.json` 的 `logging` 配置块控制：默认 `mode="metadata"`；需要原文预览时切到 `mode="raw"`，并按需开启 `logging.prompt.enabled` / `logging.llm_raw.enabled`。

**日志文件**：`data/logs/worldengine-YYYY-MM-DD.log`（按日轮换），如 `data/logs/worldengine-2026-04-20.log`。

---

## 执行清单

开始任务前：
- 先读 `CLAUDE.md`、`SCHEMA.md`、`ARCHITECTURE.md`、`CHANGELOG.md`
- 修改任何文件前，先读该文件当前内容
- 任务超过 3 步时，先列计划并等用户确认

结束任务前：
- 明确写出验证方式，而不是只说“已完成”
- 判断是否需要同步更新 `SCHEMA.md` / `ARCHITECTURE.md` / `CHANGELOG.md`
- 若改动影响入口规范，只更新 `CLAUDE.md`，不要把正文再复制进 `AGENTS.md`

---

## 文档同步触发器

| 变更类型 | 必须同步的文档 |
|---|---|
| 新增/删除表、字段、索引、配置键、导入导出格式 | `SCHEMA.md` |
| 修改 prompt 组装、SSE 事件、异步队列、状态读取/写入链路、API 行为、助手运行机制 | `ARCHITECTURE.md` |
| 修改 agent 规则、任务流程、锁定文件规则、文档分工 | `CLAUDE.md` |
| 引入新的兼容约束、隐性坑点、人工决策、迁移注意事项 | `CHANGELOG.md` |

禁止事项：
- 不要只改 `CHANGELOG.md` 来描述当前行为
- 不要在 `CLAUDE.md` 重复维护会频繁漂移的运行时细节
- 不要在 `SCHEMA.md` 记录 UI 或 prompt 运行流程

---

## 任务回执模板

任务结束时，回复至少包含以下 5 项：

```md
修改文件：
验证方式：
同步文档：
锁定文件：
残留风险：
```

---

## 不可随意修改的文件

以下文件一旦完成即锁定，未经明确要求禁止改动：

| 文件 | 说明 |
|---|---|
| `SCHEMA.md` | 数据库字段权威来源，改字段/加表必须同步更新此文件 |
| `CLAUDE.md` | 根目录唯一入口正文；改入口规范时只改这里，不改 `AGENTS.md` 正文 |
| `/backend/db/schema.js` | 实际建表文件，结构以 SCHEMA.md 为准；新增表/字段时用 `CREATE TABLE IF NOT EXISTS` 或 `ALTER TABLE IF NOT EXISTS` 追加，不重建已有表 |
| `/backend/utils/constants.js` | 所有硬性数值常量的唯一来源；新增常量需说明用途和来源 |
| `/backend/prompts/assembler.js` | 提示词组装顺序硬编码（当前 14 段，见 `ARCHITECTURE.md §4`），顺序不得改变；需修改时明确指出改动的段号 |
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

**提示词组装**
- 顺序权威来源：`backend/prompts/assembler.js` + `ARCHITECTURE.md §4`
- 任何段位、注入来源、历史消息策略、写作模式差异的改动，都必须同步更新 `ARCHITECTURE.md`
- `CLAUDE.md` 不重复维护 prompt 组装运行时细节，避免和实现漂移

**生成参数覆盖层级**：`世界级 > 全局`，worlds 表字段为 NULL 时回退全局配置

**前端**
- 所有 fetch 调用封装在 `/frontend/src/api/`，组件内禁止直接调用
- 样式只用 TailwindCSS 工具类，不写内联 style，颜色/字体/圆角/阴影统一走 CSS 变量（`--we-*` 前缀，定义于 `frontend/src/styles/tokens.css`），禁止硬编码色值
- 整体 Claude 风格（参考 `DESIGN.md`）：羊皮纸底色 + 陶土强调 + 暖色中性；衬线做标题、无衬线做 UI；环形阴影（`0 0 0 1px`）代替传统投影；单主题不做深浅色切换（用户如需暗色通过 T24A 自定义 CSS 片段覆盖 `--we-*` 变量即可）
- 语言：简体中文

---

## 代码规范

以下规则只收敛项目已经在执行的代码规范，不新增平行风格体系。

**后端分层**
- `routes/` 只做参数校验、请求解析、响应组装和调用 `services/`，不直接写 SQL
- `services/` 负责业务编排、事务边界、副作用触发、导入导出与跨模块协作
- `db/queries/` 是 SQL 唯一落点；不要在 `routes/` 或 `services/` 拼查询
- `memory/` 只放记忆召回、摘要、状态更新、展开原文等记忆相关逻辑
- `prompts/` 只放提示词组装、条目命中、模板变量相关逻辑
- `llm/` 只放模型调用与 provider 适配；上层不直接处理 provider 协议细节

**前端分层**
- `pages/` 负责页面级状态编排、路由上下文、数据加载与动作透传
- `components/` 负责展示和局部交互；组件内禁止直接 `fetch`
- `api/` 是前端网络请求唯一出口；新增接口先补 API 封装
- `store/` 只放跨页面共享状态；局部 UI 状态优先留在页面或组件内部
- `utils/` 只放纯工具函数；不要把页面业务流程塞进工具文件

**组件复用规则**
- 新页面组装前必须先查阅 `frontend/src/components/index.js`，有可用组件则强制复用，不可另起炉灶
- 编辑类页面骨架统一用 `EditPageShell`，禁止手写 `we-edit-canvas` / `we-edit-panel`
- 表单字段统一用 `FormGroup`，禁止散写 `div.we-edit-form-group` + `label.we-edit-label`
- 确认弹窗统一用 `ConfirmModal`，禁止页面内联定义局部弹窗
- 新组件需同步在 `components/index.js` 中注册后方可使用
- 没有现成组件时，先参照现有组件风格和 `DESIGN.md` 指引创建，放入 `components/ui/`

**文件命名约定**
- 前端 `frontend/src/api/`：统一 kebab-case（如 `import-export.js`、`session-timeline.js`）
- 前端 `frontend/src/components/`、`frontend/src/pages/`：React 组件/页面文件统一 PascalCase（如 `MessageItem.jsx`、`ChatPage.jsx`）
- 前端 `frontend/src/hooks/`：camelCase，必须以 `use` 开头（如 `useSettingsConfig.js`）
- 前端 `frontend/src/utils/`、`frontend/src/styles/`：统一 kebab-case（如 `chapter-grouping.js`、`regex-runner.js`）
- 后端所有 `.js` 文件：统一 kebab-case（如 `combined-state-updater.js`、`entry-matcher.js`）

**实现风格**
- 优先沿用现有模块的命名、导出方式和组织结构，不在同一模块混入第二套写法
- 单个函数只做一层职责；校验、查询、业务编排按分层拆开
- 新增逻辑优先找现有落点，避免顺手新建并行抽象
- 注释只写边界、决策和陷阱，不解释显而易见的语句
- 保留技术债时，必须在回复或 `CHANGELOG.md` 说明原因与影响

**验证要求**
- 改后端接口、状态链路、prompt 组装、导入导出：至少给出接口或流程级验证方法
- 改前端交互、样式、页面状态：至少给出页面路径和人工验证步骤
- 纯文档改动：至少说明检查了哪些漂移点、引用关系或冲突
- 无法运行测试时必须明确说明

---

## 关键设计速查

详细架构见 `ARCHITECTURE.md`：
- 提示词组装 → §4，记忆召回 → §6，SSE 事件 → §7
- 异步任务链 → §5，状态系统 → §8，正则替换管线 → §9
- 写作空间 → §11，副作用清理钩子 → §10

**上下文截断优先级**（绝不截断 → 最后截断）：`[1-12] System` > `[14] 当前消息` > `[13] 历史消息`

**图片附件**：base64 随消息发送（不单独上传接口），后端解码存 `/data/uploads/attachments/`，路径写入 `messages.attachments`（JSON 字符串）。单条最多 3 张、单张不超过 5MB，前端校验。

**角色卡/世界卡格式**：`.wechar.json`（format: worldengine-character-v1）/ `.weworld.json`（format: worldengine-world-v1），不兼容 SillyTavern 格式。导出包含状态字段定义和状态值。

**全局设置格式**：`.weglobal.json`（format: worldengine-global-settings-v1），包含全局提示词（system/post/条目）、自定义 CSS、全局正则规则（world_id IS NULL）和非 LLM 配置字段。导入为覆盖模式（先清空三张表的全局记录，再写入），config 字段覆盖，不含 API 密钥。

**persona 无 Prompt 条目**：persona 只有 name 和 system_prompt，与角色不同，没有 Prompt 条目。

**自定义 CSS**：前端拼接所有 `enabled=1` 条目后注入 `<style id="we-custom-css">`，全部为全局作用。

<claude-mem-context>
# Memory Context

# [WorldEngine] recent context, 2026-04-20 1:52am GMT+8

No previous sessions found.
</claude-mem-context>
