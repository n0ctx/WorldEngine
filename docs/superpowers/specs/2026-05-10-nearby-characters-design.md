# 写作页面「附近 / 登场角色（Nearby Characters）」设计

> 日期：2026-05-10
> 范围：写作页面右侧栏与每轮自动状态更新链路；完全替代现有"激活角色（writing_session_characters）"模型
> 状态：待实现（spec 阶段）

---

## 1. 背景与目标

写作页面当前以「激活角色」管理出场人物：用户手动从公共角色卡里挑选若干角色加入会话（写入 `writing_session_characters`），加入后他们的状态栏出现在右侧 CAST 面板，每轮 LLM 同步更新。

存在的问题：
- 长篇写作里出场角色多、流动性强，手动维护激活列表负担重
- 临时配角不值得为其建公共角色卡，但仍需要简单的状态/记忆延续
- LLM 已经"知道"本轮谁登场了，让用户重复声明等于浪费

本特性把出场角色识别交给每轮已存在的 `combined-state-updater` LLM 调用，自动维护一个 session 级的"登场角色"池。用户可以：
- 让池子完全自动（transient 角色随登场出现、随消失自动删除）
- 主动保存某个登场角色（saved，跨轮持久延续，但仍 session 级）
- 用一键"制卡"把本轮登场角色升级为公共角色卡

**硬约束**：每轮不增加额外 LLM 调用 — 提取、状态更新、记忆更新合并到现有 combined-state-updater 的同一次调用。

---

## 2. 关键决策摘要

| ID | 决策 |
|---|---|
| Q1 | 状态字段模板：复用 `character_state_fields` + 新开关 `nearby_enabled`（默认全部启用，可在世界字段编辑页逐字段切换）；额外固定挂一个 `memory` 列（独立于模板，存在 `session_nearby_characters.memory`） |
| Q2 | 存储：新表 `session_nearby_characters` + `session_nearby_character_state_values`，CASCADE 随 session 删 |
| Q3 | LLM 输出协议：现有 JSON 加顶级字段 `nearby_characters: [{ref_id, name, state, memory}]`；非法 ref_id 整条丢弃 |
| Q3.1 | 登场判定：prompt 明确「本轮正文中以名字、对话或动作主体形式登场的角色，仅被路人提及不算」 |
| Q4 | 同次 LLM 调用内 pre-flight：prompt 池 = saved + 上轮 transient（合并），每项发 (id, name, memory)；本轮在场角色额外附带「上轮 state + memory」做更新基线 |
| Q4.1 | 池构成：saved + 上轮 transient 全部进池（保持模型上下文完整） |
| Q4.2 | 在场角色 prompt 包含上轮 memory，LLM 输出新的 memory（覆盖式） |
| Q5.1 | 制卡候选 = 本轮登场角色（saved + transient） |
| Q5.2 | 保存为公共角色卡时，仅启用字段（nearby_enabled=1）的当前值写入 `character_state_values.default_value_json`；未启用字段不写（取字段定义默认）；不写 memory、不写 nearby ID |
| Q5.3 | 完全替换现有 `CharacterAnalyzingModal` 流程：UI 框架复用，旧的「从对话提取候选」逻辑删除 |
| Q6.1 | 右侧栏布局：世界 / {{user}} / 附近 / TIMELINE 四段；"新入口"和"制卡"按钮挂在"附近"标题栏右侧 |
| Q6.2 | 视觉区分：saved 角色名带印章 icon，排在 transient 之前 |
| Q6.3.1 | memory 字段允许用户手动编辑 |
| Q7 | 写卡助手：CHARCARD 知识契约 + 写字段工具增加 `nearby_enabled` 参数；不新增"创建登场角色"工具 |
| Q8.1 | regenerate / 编辑消息：`turn_records.state_snapshot` 扩展 `nearby` 层；`state-rollback.js` 同步还原 |
| Q8.2 | 从公共角色卡添加 saved 时，初始 state = 角色卡 `character_state_values.default_value_json` |
| Q8.3 | session 内 name 全局唯一（saved + 上轮 transient 合并后唯一）；ID 仅做防御性兜底；LLM ref_id 缺失时按 name 在池中匹配；都没命中才视为新角色 |
| Q8.4 | 制卡 LLM 调用走 `writing.aux_llm → aux_llm → llm` 回退（属后台辅助任务，不计入"零额外调用"硬约束所限定的"每轮自动状态更新"链路） |

---

## 3. 数据模型

### 3.1 新表 `session_nearby_characters`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | UUID（前端不暴露） |
| session_id | TEXT FK→sessions.id CASCADE | — |
| name | TEXT | session 内唯一（含 transient + saved） |
| memory | TEXT | LLM 维护的一句话交互摘要（默认 `''`） |
| is_saved | INTEGER | 0=transient / 1=saved，默认 0 |
| created_at | INTEGER | — |
| updated_at | INTEGER | — |
| UNIQUE | — | (session_id, name) |

### 3.2 新表 `session_nearby_character_state_values`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | TEXT PK | — |
| session_id | TEXT FK→sessions.id CASCADE | — |
| nearby_id | TEXT FK→session_nearby_characters.id CASCADE | — |
| field_key | TEXT | 必须存在于该世界 `character_state_fields` 且 `nearby_enabled=1` |
| runtime_value_json | TEXT NULLABLE | LLM 维护的运行时值 |
| updated_at | INTEGER | — |
| UNIQUE | — | (nearby_id, field_key) |

### 3.3 字段定义改动

`character_state_fields` 新增列：

```sql
ALTER TABLE character_state_fields ADD COLUMN nearby_enabled INTEGER NOT NULL DEFAULT 1;
```

迁移时所有现存行回填 `1`。

### 3.4 删除表

`writing_session_characters` 整表删除（连带相关 service / route / API / 前端）。

### 3.5 turn_records.state_snapshot 扩展

JSON 增加 `nearby` 层：

```json
{
  "world":     { "field_key": "value_json", ... },
  "persona":   { "field_key": "value_json", ... },
  "character": { "cid": { "field_key": "value_json", ... }, ... },
  "nearby": [
    {
      "id":       "uuid",
      "name":     "...",
      "memory":   "...",
      "is_saved": 0,
      "state":    { "field_key": "value_json", ... }
    }
  ]
}
```

`state-rollback.js` 同步：还原快照时清空两张 nearby 表后按 snapshot 重写；无 nearby 字段（旧记录）→ 清空两张表。

### 3.6 .weworld.json 导入导出

`character_state_fields` 数组中每项增加 `nearby_enabled`（默认 1）；旧文件无此字段时按 1 处理，向下兼容。

`session_nearby_*` 是 session 运行时数据，不进世界卡导出。

---

## 4. 后端改造

### 4.1 数据访问层

新增：
- `backend/db/queries/session-nearby-characters.js`：CRUD（getBySessionId、getById、getByName、create、setIsSaved、setMemory、setName、deleteById、deleteTransientNotInIds）
- `backend/db/queries/session-nearby-character-state-values.js`：getByNearbyId、upsert、deleteByNearbyId

### 4.2 服务层

`backend/services/writing-sessions.js` 增加：
- `listNearby(sessionId)` → `[{ id, name, memory, is_saved, state: [{ field_key, label, type, ..., runtime_value_json }] }]`，仅含 nearby_enabled=1 字段
- `addSavedFromCharacter(sessionId, characterId)` → 校验 name 唯一；初始 state = 该公共角色 `character_state_values.default_value_json`（仅启用字段）；初始 memory=''
- `removeSaved(sessionId, nearbyId)` → 直接 DELETE 该 nearby 行（state values 由 CASCADE 同步删除）。下一轮 LLM 若再次识别到该名字，会以 transient 重新出现；用户认可此次"删除即清空 state/memory"的损失，避免与 turn 链路耦合
- `patchNearbyMemory(sessionId, nearbyId, memory)` — 用户手动编辑 memory
- `patchNearbyState(sessionId, nearbyId, fieldKey, valueJson)` — 用户手动编辑某字段
- `setNearbyIsSaved(sessionId, nearbyId, isSaved)` — transient → saved 切换

`backend/services/writing-sessions.js` 删除：所有 `activateCharacter` / `deactivateCharacter` / `listActiveCharacters` 相关方法。

### 4.3 路由层

`backend/routes/writing.js` 增加：
- `GET /api/writing-sessions/:sessionId/nearby` → list
- `POST /api/writing-sessions/:sessionId/nearby` body `{ character_id }` → addSavedFromCharacter
- `PATCH /api/writing-sessions/:sessionId/nearby/:nearbyId` body `{ is_saved? | memory? | name? }`
- `PATCH /api/writing-sessions/:sessionId/nearby/:nearbyId/state` body `{ field_key, value_json }`
- `DELETE /api/writing-sessions/:sessionId/nearby/:nearbyId`

删除：所有 `/active-characters` 路由。

### 4.4 combined-state-updater 改造

只在 `mode === 'writing'` 时启用 nearby 链路（chat 模式不参与，避免污染）。

新增 prompt 段（写作模式插入）：

```
当前已知的登场角色池（继承自上轮 transient 与已保存的 saved）：
- [id=abc123] 张三（已保存）｜记忆：上次和{{user}}打赌输了。｜上轮状态：{心情:"得意", 位置:"酒馆"}
- [id=def456] 李雷（临时）｜记忆：刚被{{user}}救下。｜上轮状态：{心情:"感激"}

字段定义（仅在登场角色池启用的字段）：
- 心情（mood，类型：text），更新说明：根据本轮事件给出
- 位置（location，类型：text）
- ...

任务：
1. 阅读本轮 user 与 assistant 文本，识别本轮以「名字、对话或动作主体」形式登场的角色
   （仅被旁人或路人提及不算；只有直接对话、内心活动主体、动作主语才算）
2. 在场角色 → 输出到 nearby_characters 数组：
   { "ref_id": "<池里的id；新角色为null>", "name": "...", "state": { "field_key": value, ... }, "memory": "新一句话总结" }
3. 不在场角色不要输出
4. 字段约束遵循各字段的 type / enum_options / range（同主 state patch 协议）
5. memory 一句话总结角色与{{user}}的交互历史，覆盖式更新
```

输出 JSON 顶级 schema：

```json
{
  "world":   { ... },
  "persona": { ... },
  "characters": { ... },
  "nearby_characters": [
    { "ref_id": "abc123|null", "name": "张三", "state": {...}, "memory": "..." }
  ]
}
```

后端处理（写在 `combined-state-updater.js` 的 `applyNearbyResult` 函数中）：

```
for each item in llm.nearby_characters:
  if item.ref_id and item.ref_id ∈ pool:
    update name/state/memory of pool[ref_id]
    mark seen[ref_id] = true
  elif item.name and item.name ∈ poolNames:
    update by name match (ID 兜底失效场景)
    mark seen[name's id] = true
  elif item.ref_id is null and item.name not in pool:
    // 新增 transient
    create new row with new UUID, is_saved=0
    upsert state values
    mark seen[new_id] = true
  else:
    // 非法 ref_id（指向不存在的 id）
    log warn, drop

// 清理本轮没回的
for each pool entry not in seen:
  if entry.is_saved == 1: keep（state/memory 不动）
  else (transient): DELETE row + DELETE state values
```

state values 的写入：仅启用字段（nearby_enabled=1）；未知字段忽略；类型不匹配跳过（参考主 state patch 处理）。

### 4.5 turn_records / state-rollback

`createTurnRecord` 在快照里增加 nearby 层（读两张表组装）。

`state-rollback.js` 的 `restoreStateFromSnapshot` 新增 nearby 还原分支：清空两张 nearby 表 → 按 snapshot.nearby 重写；snapshot 缺 nearby 字段时清空两张表（向下兼容）。

### 4.6 制卡服务

新增 `backend/services/nearby-card-maker.js`：
- `analyzeNearbyForCardCreation(sessionId, nearbyId)` → 调用 `writing.aux_llm → aux_llm → llm`，传入：name + memory + 当前 state + 最近 N 轮文本（参考现有制卡的上下文窗口）→ LLM 返回 `{ system_prompt, description, first_message }`
- `confirmCreateCharacterCard(worldId, sessionId, nearbyId, { name, system_prompt, description, first_message })` → 在 characters 表创建新行；写入 `character_state_values.default_value_json` 仅启用字段的当前值；不写 memory、不写 nearby id

路由：
- `POST /api/writing-sessions/:sessionId/nearby/:nearbyId/analyze` → 返回 LLM 生成的 `{ system_prompt, description, first_message }` 草稿，不落库
- `POST /api/worlds/:worldId/characters/from-nearby` body `{ session_id, nearby_id, name, system_prompt, description, first_message }` → 落库并返回新 character；不复用现有 character POST，独立路由便于鉴权与逻辑分离

### 4.7 副作用清理

CASCADE 自动处理；不需要在 `cleanup-registrations.js` 注册新钩子。

---

## 5. 前端改造

### 5.1 API 封装

新增 `frontend/src/api/session-nearby.js`：
- `fetchNearby(sessionId)`
- `addSavedNearbyFromCharacter(sessionId, characterId)`
- `setNearbySaved(sessionId, nearbyId, isSaved)`
- `patchNearbyMemory(sessionId, nearbyId, memory)`
- `patchNearbyState(sessionId, nearbyId, fieldKey, valueJson)`
- `patchNearbyName(sessionId, nearbyId, name)`
- `removeNearby(sessionId, nearbyId)`
- `analyzeNearbyForCard(sessionId, nearbyId)`
- `createCharacterFromNearby(worldId, sessionId, nearbyId, payload)`

删除 `frontend/src/api/writing-sessions.js` 中的 `activateCharacter` / `deactivateCharacter`。

### 5.2 组件

替换：
- `CastPanel.jsx` → `NearbyPanel.jsx`（同入口位置；props 不变或精简）
  - 顶部 CAST 印章行删除
  - 区块顺序：世界 / {{user}} / 附近 / TIMELINE
  - "附近"标题栏右侧两个按钮：`从角色卡添加`、`制卡`

新增：
- `components/book/NearbyCharacterBlock.jsx` — 单角色折叠块；状态值复用 `StatusSection`；memory 单独一行（带编辑器）
- `components/book/AddSavedNearbyModal.jsx` — 列出当前世界公共角色卡，用户选一个→后端 addSavedFromCharacter；name 已存在则 modal 内提示并禁用对应行
- `components/book/MakeCardModal.jsx` — 候选 = 本轮 nearby 列表；逐个勾选→后端 analyze；预览 LLM 生成的 system_prompt / description / first_message；用户确认→后端 createCharacterFromNearby

删除：
- `components/writing/CharacterAnalyzingModal.jsx` 旧逻辑（重写或合并到 MakeCardModal）
- `components/writing/CharacterPreviewModal.jsx`（同上）

### 5.3 写作页 `WritingSpacePage.jsx`

- 移除 `activeCharacters` 状态及 `activateCharacter` / `deactivateCharacter` 调用
- 改为消费 `nearby` 数据（通过 `useSessionState` hook 或独立 hook）
- 制卡按钮入口从原位置移到 NearbyPanel 内部

### 5.4 状态字段编辑页

`StateFieldEditor.jsx`（角色字段编辑）增加 `nearby_enabled` 复选框，默认勾选；写卡助手生成的字段 plan-doc / proposal 也支持此字段。

### 5.5 useSessionState hook

新增 nearby 拉取与缓存；`state_updated` SSE 事件触发后，nearby 数据也重新拉取。

---

## 6. 写卡助手对接

### 6.1 知识层

修改 `assistant/knowledge/CHARCARD.md`（或对应契约文件）：增加段落说明 `nearby_enabled` 的作用、默认值、何时关闭（如：玩家专属字段、不希望临时角色继承的字段）。

修改 `assistant/knowledge/CONTRACT.md`：登记此字段。

### 6.2 工具层

`assistant/server/tools/` 现有用于创建/修改 character_state_fields 的工具增加 `nearby_enabled` 参数（boolean，默认 true）。

不新增任何"创建登场角色"工具 — 登场角色由用户在写作页操作或由 LLM 在 combined-state-updater 中自动产生。

### 6.3 normalize-proposal

如果写卡助手有 proposal 校验层，把 `nearby_enabled` 加入合法字段白名单与默认填充。

---

## 7. 异步任务链 / SSE

不增加新优先级、不增加新 SSE 事件类型。沿用 `state_updated` 通知前端刷新 nearby（前端 hook 接到事件后调 `fetchNearby`）。

---

## 8. 错误处理与边界

| 情形 | 行为 |
|---|---|
| LLM 返回 `nearby_characters` 字段缺失 | 视为本轮无在场角色：清空所有 transient，保留 saved 不动 |
| LLM 返回 ref_id 指向不存在 id | 整条丢弃，warn 日志 |
| LLM 返回 ref_id=null 且 name 已在池中 | 当作池中已有角色（按 name 匹配兜底），更新 |
| LLM 返回的字段超出 nearby_enabled 范围 | 跳过该字段（参照主 state patch 同等处理） |
| LLM 返回名字与本轮另一个返回项冲突 | 后到的覆盖先到的（warn）|
| 用户从公共角色卡添加 saved 时 name 已被占用 | 后端 409，前端 modal 提示 |
| 用户重命名 saved 触发 name 冲突 | 后端 409，前端表单提示 |
| transient 删除但用户曾编辑过其字段 | 接受丢失（用户认可的 edge case）|
| 旧的 `writing_session_characters` 表数据 | 迁移：直接 DROP；不做数据搬迁（接受一次性丢失，本项目无向后兼容义务）|

---

## 9. 测试计划

### 9.1 后端单测

- `tests/db/queries/session-nearby-characters.test.js`：CRUD + UNIQUE(session_id, name) 校验
- `tests/db/queries/session-nearby-character-state-values.test.js`：upsert + CASCADE
- `tests/memory/combined-state-updater-nearby.test.js`：
  - ref_id 命中→更新
  - name 兜底→更新
  - ref_id=null+新 name→新建 transient
  - 非法 ref_id→丢弃
  - 池里没回的 transient→删除
  - 池里没回的 saved→保留
  - nearby_enabled=0 字段不进 prompt 不参与 patch
- `tests/memory/state-rollback-nearby.test.js`：snapshot 往返
- `tests/services/nearby-card-maker.test.js`：制卡保存只写启用字段、不写 memory/id
- `tests/routes/writing-nearby.test.js`：路由参数校验、409 重名

### 9.2 前端单测

- `AddSavedNearbyModal` 重名拒绝
- `NearbyPanel` saved/transient 排序与印章 icon
- `MakeCardModal` 候选来源 = 本轮 nearby

### 9.3 E2E（可选）

写作模式：发一轮含 2 个新角色 → 右侧"附近"出现 2 个 transient + state + memory；保存 1 个 → 印章；下一轮只提到其中 1 个 → transient 自动消失，saved 保留；点制卡 → 候选含本轮在场的；选其一 → 公共角色卡列表新增。

---

## 10. 范围外（明确不做）

- 不改 chat 模式（仅写作模式启用 nearby 链路）
- 不做跨 session 的 nearby 同步 / 共享
- 不增加 SSE 新事件
- 不让写卡助手具备"创建登场角色"工具
- 不迁移旧 `writing_session_characters` 数据
- 不在公共角色卡上引入 memory 概念

---

## 11. 实施分包建议（供后续 writing-plans 阶段切分）

1. **DB 层**：schema.js 加表/列、migration、queries 文件、单测
2. **后端 service / route**：writing-sessions service + writing route + 单测
3. **combined-state-updater 改造**：prompt 段、解析、应用；nearby 单测
4. **turn_records / state-rollback**：snapshot 扩展 + 回滚单测
5. **前端 NearbyPanel + 子组件 + API + hook**：取代 CastPanel
6. **制卡 modal 重写**：MakeCardModal + analyze + create
7. **state field 编辑页**：nearby_enabled 复选框
8. **写卡助手知识 + 工具更新**
9. **删除旧 writing_session_characters 全链路**
10. **文档同步**：SCHEMA.md / ARCHITECTURE.md / CHANGELOG.md

包之间依赖：1 → 2 → 3 → 4 → 5/6/7 并行；8 独立可并行；9 在 1-7 完成后扫尾；10 最后或并行追加。
