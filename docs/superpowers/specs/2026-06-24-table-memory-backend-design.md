# 表格记忆系统（后端）设计

> 阶段：本 spec 只覆盖**后端**。前端面板与编辑 UI 在独立 session 实现。
> 分支：`feat/table-memory-backend`
> 日期：2026-06-24

## 1. 背景与定位

WorldEngine 是 AI 互动小说 agent。现有记忆系统已有三层（后端）：

1. **状态栏** = `state-values` 系统（world/persona/character/session 四级「字段→单值」），每轮由副 LLM（`combined-state-updater`）输出 JSON、代码解析、解析失败重试，更新状态。
2. **长期记忆** = `long-term-memory.js`，session 级 `memory.md`，每行一条文本，超阈值自动压缩。
3. **回滚快照** = turn record 存 `long_term_memory_snapshot`，回退轮次时整体还原。

本功能新增**第三种数据形状：表格记忆（多行多列的表）**。状态栏是「字段→单值」、长期记忆是「逐行文本」，都装不下「多行多列且需按行增删改」的结构化世界状态。因此新建独立子系统，但接到与现有记忆相同的三个挂载点（每轮更新、回滚快照、prompt 注入）。

适合放进表格的标准：**会被反复查询、会变化、字段明确、需要保持一致**。不放剧情正文。

## 2. 5 张内置表（列写死在代码）

MVP 固定 5 张表，列结构由代码常量 `TABLE_SCHEMAS` 定义，副 LLM 只填值不改结构。（原「角色表」已废弃——现有状态栏已覆盖玩家+附近 NPC 的状态。）

| 表 key | 名称 | 列（除内置 `id`、`别名` 外） |
|---|---|---|
| `relations` | 关系表 | 主体A, 主体B, 关系类型, 信任/敌意, 债务/承诺, 冲突点, 最近变化 |
| `items` | 物品表 | 物品, 持有人/位置, 类型, 效果/用途, 限制条件, 状态 |
| `places` | 地点表 | 地点, 所属势力, 当前状态, 危险/资源, 已发生事件, 可触发内容 |
| `plotlines` | 剧情线表 | 剧情线, 关联角色/地点, 当前阶段, 紧急度, 玩家是否介入, 后台处理结果, 状态 |
| `world` | 世界状态表 | 规则/事实, 影响范围, 当前状态, 来源事件, 是否可逆 |

每行额外两个内置列：
- `id`：代码在新建行时分配的自增整数，行的稳定主键。
- `别名`：实体的历史称呼集合（如 `张三 / 张老板 / 铁匠`），用于副 LLM 归并判重。

## 3. 行 ID 与身份漂移（核心机制）

**问题**：互动小说里实体在正文中诞生，且同一实体会换称呼（张三→张老板→那个铁匠），副 LLM 容易新建重复行。

**解法（两段）**：
1. **行 ID 由代码分配、副 LLM 只回显**：每轮把带 `id` 列的表渲染给副 LLM。它 `update`/`close` 某行时只是照抄看到的 `id`，**从不自己生成 ID**。新建行（`add`）不带 ID，代码补。因此「LLM 输出 ID 漂移」不会发生。
2. **别名归并**：副 LLM 在 `add` 前必须先用正文里的称呼去匹配现有行的主名 + `别名` 列；匹配上 → 走 `update` 并把新称呼追加进 `别名`；匹配不上才 `add`。该规则写进副 LLM prompt 作为硬前置。

## 4. 数据形状（真源）

每个 session 一个 JSON 文件：`data/{WE_DATA_DIR}/table_memory/{sessionId}/tables.json`

```jsonc
{
  "version": 1,
  "tables": {
    "relations": { "rows": [ { "id": 1, "主体A": "...", "别名": "张三 / 张老板", "...": "..." } ], "nextId": 2 },
    "items":     { "rows": [...], "nextId": 1 },
    "places":    { "rows": [...], "nextId": 1 },
    "plotlines": { "rows": [...], "nextId": 1 },
    "world":     { "rows": [...], "nextId": 1 }
  },
  "archive": {
    "relations": [...], "items": [...], "places": [...], "plotlines": [...], "world": [...]
  }
}
```

- `nextId` 每表独立自增，保证 ID 在表内稳定唯一（不复用已删 ID）。
- `archive` 存被 `close` 的行，**不删除**，默认不进 prompt（保留连续性又不污染上下文）。
- 选 JSON 文件而非 SQLite：与长期记忆的「每 session 一文件」模式一致，回滚快照可直接复用文件/快照机制；表是整体读写（每轮全量喂给副 LLM）而非 SQL 过滤查询，无需关系库。不碰 `backend/db/queries/`、无需迁移表（仅 turn record 加一列见 §6）。

## 5. 每轮更新（独立副 LLM 调用，ops 式增量）

新建 `backend/services/table-memory.js` + prompt 模板 `backend/prompts/.../memory-table-update.md`。

每轮流程（与状态栏更新并列，**独立一次副 LLM 调用**）：

1. 渲染当前各活跃表（**带 `id` 列**）+ 本轮正文，组 prompt。
2. 副 LLM 只输出 ops JSON 数组，op 仅四种：

```json
[
  { "table": "relations", "op": "update", "id": 3, "fields": { "信任/敌意": "-2", "最近变化": "得知玩家撒谎" } },
  { "table": "plotlines", "op": "close",  "id": 5, "reason": "妹妹已死" },
  { "table": "places",    "op": "add",    "row": { "地点": "城东仓库", "所属势力": "黑帮", "当前状态": "已烧毁" } },
  { "table": "items",     "op": "noop" }
]
```

3. 代码解析并执行 ops（坏 JSON 重试，复用现有 `STATE_UPDATE_JSON_RETRY_MAX` 模式）：
   - `add`：代码分配 `nextId`，落新行；忽略 LLM 传入的任何 `id`。
   - `update`：按 `id` 定位行，只覆盖 `fields` 里给定的列；未知 `id` 跳过并告警。
   - `close`：按 `id` 把行从 `rows` 移入 `archive[table]`。
   - `noop`：无操作，仅表示该表本轮已审阅。
   - **无 `delete`**：记忆只归档不删，删了即丢连续性。
4. 落盘前代码做硬约束：
   - 字段限长（复用/参照 `STATE_TEXT_MAX_LENGTH` 思路，超长截断）。
   - 未知 `table` / 未知列名 → 丢弃该 op 并告警。
   - 别名归并由 prompt 要求，代码侧只保证不因 ID 错位写错行。

### 设计原则
- 副 LLM 是**结构化抽取器**，不写剧情。prompt 固定四段：角色定位（只输出 ops JSON）、归并规则（add 前查别名）、字段约束（最近变化/已发生事件 ≤ 一句话，只记结果不记过程）、触发条件（仅实质变化才 update，闲聊不动表）。
- 代码执行 ops，LLM 只产出意图 → 格式错误被代码拦下，不污染真源。

## 6. 三个挂载点（接入现有管线）

1. **每轮更新**：在现有 turn 处理流程中、状态栏更新旁边，加一次独立 `updateTableMemory(sessionId, turnText)`（后台任务，超时复用 `LLM_BACKGROUND_TASK_TIMEOUT_MS`）。
2. **回滚快照**：turn record 新增列 `table_memory_snapshot`（存整个 `tables.json` 文本）。回退轮次时整体还原，与 `long_term_memory_snapshot` 同款机制。
   - 需要一次 DB migration 加列；还原逻辑参照 `restoreLtmFromTurnRecord`（lastRecord 为空 → 清目录；快照为 null（旧记录）→ 不动；否则覆盖写）。
3. **prompt 注入**：在 `assembler.js`（`buildPrompt`/`buildWritingPrompt`）组上下文时，调用 `renderTablesToMarkdown()` 把结构化数据渲染成 md 表格注入。
   - **给主模型看的版本不含内部 `id` 列**（避免主模型把 ID 写进正文）。
   - **给副更新 LLM 看的版本含 `id` 列**（供其精确定位行）。
   - archive 默认不注入。

## 7. 对外接口与清理

- HTTP 路由 `backend/routes/table-memory.js`：
  - `GET  /api/sessions/:sessionId/table-memory` → 返回结构化数据 + 渲染后的 md（供将来前端展示）。
  - `PUT  /api/sessions/:sessionId/table-memory` → 整体覆盖写入（供将来前端手动编辑）。
- session 删除时清除 `table_memory/{sessionId}` 目录：注册 cleanup 钩子，与 LTM 同款。

## 8. 模块边界

| 模块 | 职责 | 依赖 |
|---|---|---|
| `services/table-memory.js` | JSON 文件 IO、ops 解析/执行、副 LLM 调用、渲染 | llm, prompt-loader, constants |
| `TABLE_SCHEMAS`（constants 或独立常量文件） | 5 表列定义、字段限长 | 无 |
| `renderTablesToMarkdown(tables, { withId })` | 结构化 → md 表格（纯函数） | 无 |
| `applyOps(tables, ops)` | 纯函数执行 ops，返回新 tables（便于单测） | TABLE_SCHEMAS |
| `routes/table-memory.js` | HTTP 读 / 覆盖写 | services, db/queries/sessions |
| turn record 快照接入 | 存/还原 table_memory_snapshot | turn-summarizer, migration |

## 9. 测试（后端）

- `applyOps` 纯函数单测：add 分配 ID、update 只改给定列、close 移入 archive、noop、未知 id/table/列被丢弃、字段超长截断。
- 坏 JSON 重试逻辑测试。
- `renderTablesToMarkdown` JSON→md 快照测试（含/不含 id 两版）。
- 回滚还原测试（空 lastRecord / null 快照 / 有快照三种）。
- 别名归并：验证「同实体新称呼时 LLM 走 update」需 prompt 级，难纯单测；至少验证代码侧按 id 不会写错行。

验证口径：后端改动跑相关 backend lint/test。

## 10. 明确不做（本阶段边界）

- 不做前端面板/编辑 UI（下个 session）。
- 不做用户自定义列（MVP 固定 5 表结构）。
- 不做第 7 张及以上的表。
- 不做表内自动压缩（archive 已控制活跃表增长；如活跃表仍过大留待后续）。
