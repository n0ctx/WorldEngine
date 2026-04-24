# 状态条目（State Entries）设计文档

**日期**：2026-04-24  
**状态**：已批准

---

## 概述

将现有的"状态触发器"系统（`triggers` + `trigger_conditions` + `trigger_actions` 三张表）完全废除，改为在 `world_prompt_entries` 新增 `state` 类型条目。状态条目与 `always` / `keyword` / `llm` 三种条目并行，在每次提示词组装时实时评估状态条件，满足则自动注入。

---

## 数据层

### 删除

- `triggers` 表（含数据，不迁移）
- `trigger_conditions` 表（含数据，不迁移）
- `trigger_actions` 表（含数据，不迁移）

### 新增

```sql
CREATE TABLE IF NOT EXISTS entry_conditions (
  id           TEXT PRIMARY KEY,   -- UUID，crypto.randomUUID()
  entry_id     TEXT NOT NULL REFERENCES world_prompt_entries(id) ON DELETE CASCADE,
  target_field TEXT NOT NULL,      -- "世界.体力" / "玩家.精力" / "角色.心情"
  operator     TEXT NOT NULL,      -- '>' | '<' | '=' | '>=' | '<=' | '!=' | '包含' | '等于' | '不包含'
  value        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entry_conditions_entry_id ON entry_conditions(entry_id);
```

### 修改

`world_prompt_entries.trigger_type` 扩展为 4 种合法值：

| 值 | 说明 |
|---|---|
| `always` | 常驻，无条件注入 |
| `keyword` | 关键词匹配 |
| `llm` | AI 预判（有 description）+ 关键词兜底 |
| `state` | 状态条件评估（新增） |

### 迁移策略

`schema.js` 中：
- `DROP TABLE IF EXISTS trigger_actions`
- `DROP TABLE IF EXISTS trigger_conditions`
- `DROP TABLE IF EXISTS triggers`
- `CREATE TABLE IF NOT EXISTS entry_conditions ...`

---

## 后端

### 删除

| 文件 | 说明 |
|---|---|
| `backend/services/trigger-evaluator.js` | 旧触发器评估器 |
| `backend/db/queries/triggers.js` | 旧触发器 DB 查询 |
| `backend/routes/triggers.js`（如存在） | 旧触发器路由 |

### 新增

**`backend/db/queries/entry-conditions.js`**

- `listConditionsByEntry(entryId)` — 查询某条目的所有条件
- `createEntryCondition(entryId, data)` — 新建条件
- `updateEntryCondition(condId, data)` — 更新条件
- `deleteEntryCondition(condId)` — 删除条件
- `replaceEntryConditions(entryId, conditions[])` — 批量替换（先删再插，用于保存时原子同步）

### 修改

**`backend/prompts/entry-matcher.js`**

- 从旧 `trigger-evaluator.js` 提取并内化：
  - `evaluateCondition(condition, stateMap)` — 纯函数，数值/文本操作符评估
  - `collectStateValues(worldId, sessionId)` — 读取当前 session 状态，返回 `Map<"实体名.字段标签", string>`
- `matchEntries()` 新增第四分支（与其余三类并行）：
  ```
  state 类型 →
    读取 entry_conditions（listConditionsByEntry）
    → collectStateValues(worldId, sessionId)
    → 逐条评估（AND 逻辑）
    → 全部满足 → 加入 triggeredIds
  ```
- 条件为空的 state 条目不触发

**`backend/prompts/assembler.js`（锁定文件，[7] 段改动）**

- 删除 [7] 段中旧 trigger inject_prompt 的独立注入路径
- [7] 段只保留一条路径：`matchEntries()` → 命中条目按 `position` 注入
- state 类型条目的评估在 `entry-matcher.js` 内完成，assembler 无感知

**`backend/routes/`（新增 entry_conditions 路由）**

```
GET    /api/entries/:entryId/conditions       — 查询条目条件列表
POST   /api/entries/:entryId/conditions       — 新建单条条件
PUT    /api/entries/:entryId/conditions/:id   — 更新单条条件
DELETE /api/entries/:entryId/conditions/:id   — 删除单条条件
```

也可采用 `PUT /api/entries/:entryId/conditions`（批量替换），与前端保存流程对齐。

**移除所有 trigger 引用**

- `backend/routes/chat.js` — 移除 `evaluateTriggers()` 调用
- `backend/routes/writing.js` — 移除 `evaluateTriggers()` 调用
- 任何 import trigger-evaluator 的地方均清除

---

## 前端

### 删除

- `frontend/src/components/state/TriggerEditor.jsx`
- `frontend/src/api/triggers.js`
- 触发器相关页面区块（WorldConfigPage 或 WorldStatePage 中的触发器面板）

### 修改

**`EntryEditor.jsx`**

- `trigger_type` 选项新增 `state`（显示为"状态条件"）
- 选中 `state` 时显示条件编辑区：
  - 条件行列表：`[字段选择下拉] [操作符下拉] [值输入框]`
  - 字段选项复用 TriggerEditor 的动态加载逻辑（`listWorldStateFields` / `listCharacterStateFields` / `listPersonaStateFields`）
  - 操作符随字段类型自动切换（数值字段 → 数值操作符；文本字段 → 文本操作符）
  - 支持增删条件行（最少 1 条）
  - 保存流程：先 upsert 条目本体，再调用 `PUT /api/entries/:id/conditions`（批量替换）
- 编辑已有 state 条目时，加载时同时拉取 entry_conditions

**`EntrySection.jsx`**

- 新增 `state` 类型的分组区块（标题如"状态条件"）
- 条目行展示条件摘要，如 `世界.体力 < 30 且 角色.心情 = 痛苦`（最多展示前 2 条，超出显示 +N）

**`frontend/src/api/prompt-entries.js`**

- 新增：
  - `getEntryConditions(entryId)`
  - `replaceEntryConditions(entryId, conditions[])`

**`frontend/src/components/index.js`**

- 确认 EntryEditor / EntrySection 已注册，无需新注册

---

## 提示词组装流程（更新后）

`matchEntries()` 内部四分支，完全并行：

| 分支 | 类型 | 命中条件 |
|---|---|---|
| 1 | `always` | 直接命中 |
| 2 | `keyword` | 关键词匹配最近消息 |
| 3 | `llm` | LLM preflight + 关键词兜底 |
| **4** | **`state`** | **entry_conditions 全部满足（AND）** |

所有命中条目统一按 `position`（`system` / `post`）注入，assembler 无差异对待。

---

## 需同步更新的文档

| 文档 | 变更内容 |
|---|---|
| `SCHEMA.md` | 删除 triggers 三表描述，新增 entry_conditions 表；更新 world_prompt_entries.trigger_type 可选值；更新删除策略 |
| `ARCHITECTURE.md` | 更新 §4 assembler [7] 段说明；更新 entry-matcher 行为描述；删除 trigger-evaluator 相关章节 |
| `CHANGELOG.md` | 记录废除触发器系统、新增状态条目的决策与迁移注意事项 |

---

## 验证方式

1. 后端：创建 state 条目并设置条件 → 手动修改 session_state_values → 发一条消息 → 检查日志确认条目被命中注入
2. 前端：EntryEditor 切换到 state 类型 → 添加条件 → 保存 → 重新打开确认条件已保存
3. 旧触发器清理：确认 triggers / trigger_conditions / trigger_actions 表已不存在，DB 无残留
4. 回归：already/keyword/llm 三类条目行为不受影响
