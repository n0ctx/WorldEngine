# persona 卡知识库（USERCARD.md）

> 写卡助手处理 `persona-card` 类任务时加载本文件。`persona-card` 即 `{{user}}` 卡，承载"代入者在该世界扮演的具体人物"。
> 行为框架（怎么生成 JSON、怎么报告父代理）见 `assistant/prompts/sub-agent.md`，不在本文件。

## persona（玩家卡）架构

persona 卡承载：

- `{{user}}` 名称：`name`
- `{{user}}` 简介：`description`
- `{{user}}` 人设：`system_prompt`
- `{{user}}` 状态值：`stateValueOps`，仅 `target:"persona"`，**只能填写已有字段的值**

> persona 不是"通用人设模板"，而是**一个具体的人**——有名字、有经历、有当下处境、有在世界里的位置。
> persona 卡适合**短而准**，避免把整本世界观塞进主角设定。

不属于 persona 卡：

- 世界规则 / lore / 世界条目（属于 world-card）
- 状态字段定义 / 修改 / 删除（一律由 world-card 管理）
- `{{char}}` 人设（属于 character-card）
- 全局 prompt / CSS / 正则

## changes 字段集

allowed keys（**仅 3 个**）：

| 字段 | 说明 |
|---|---|
| `name` | `{{user}}` 在该世界的名字/称呼 |
| `description` | 一句话简介（写这个人是谁，展示用） |
| `system_prompt` | `{{user}}` 在该世界的人设正文：统一用第三人称落笔，有具体名字、具体经历、具体处境 |

> **禁止字段**：`post_prompt`、`first_message`（persona 卡不存在这两个字段；`{{user}}` 不需要"开场白"或"输出后置提醒"）

## persona 无 Prompt 条目特殊性

- persona 卡**没有 entryOps / Prompt 条目**——这是 persona 与角色卡 / 世界卡的核心差异
- persona 信息只通过 `system_prompt` 表达，不能像 world-card 那样按情境触发
- 如果原始需求要"`{{user}}` 在 X 情境下补充背景"，应改为：
  - 简短背景 → 写进 `system_prompt`
  - 复杂情境触发的 lore → 通过 world-card 任务添加 `entryOps` 条目（条目内容里写 `{{user}}`）

## stateValueOps 规则

仅填写**已存在**的 `{{user}}` 状态字段值。不能创建字段、不能删除字段，新字段需通过 world-card 任务管理。

### 格式

```json
{ "target": "persona", "field_key": "inventory", "value_json": "[\"草药包\",\"绷带\"]" }
```

### 约束

- `target` 只允许 `"persona"`（persona-card 不能填 `target:"character"` 或 `target:"world"`）
- `field_key` 必须来自 `preview_card` 返回的 `existingPersonaStateFields`
- `value_json` 必须是 JSON 字符串或 `null`
- enum 字段：`value_json` 字符串值必须来自该字段的 `enum_options`，禁止填列表外值
- 写入范围：只写默认状态值，不改运行时会话状态

### value_json 写法（按 type）

| type | 写法 |
|---|---|
| number | `"100"` |
| text | `"\"正常\""` |
| enum | `"\"警觉\""`（值来自该字段 `enum_options`）|
| list | `"[\"草药包\",\"绷带\"]"` |
| boolean | `"false"` |
| datetime | `"\"1000-03-15T14:30\""`（ISO 局部时间 `YYYY-MM-DDTHH:mm`；年份为正整数、可任意位数；月/日/时/分各 2 位）|
| table | `"{\"hp\":80,\"mp\":40}"`（对象 JSON；key 必须是该字段 `table_columns` 已声明的列 key，值必须是数值；未列出的列保持缺省）|
| 清空且字段允许为空 | `null` |

## operation 限制

persona-card **仅允许 `create` / `update`**，**不允许 `delete`**。

| operation | entityId 取值 | 备注 |
|---|---|---|
| `create` | 所属世界 ID（由父代理从 `context.worldId` 或前序 world-card 步骤注入） | create 后新卡拥有独立的状态值行，与其他玩家卡互不影响；未在 `stateValueOps` 中显式指定的字段回退到字段模板默认值 |
| `update` | 所属世界 ID | persona 与世界绑定，update 修改的是当前激活 persona |
| `delete` | — | **不支持** |

> 创建依赖约束：`persona-card create` 必须依赖世界来源（`context.worldId` 或前序 `step:<world-card-create>`），与 character-card 同样的依赖规则。

## 操作手册

### 修改 persona 身份

"把 `{{user}}` 改成退役审判官，带罪流放到北境" → 改写 `system_prompt`，写出**具体经历**而不是"审判官人设模板"

### 调整状态值

"当前金币调成 120，背包改成草药包和绷带"：
```json
[
  { "target": "persona", "field_key": "gold", "value_json": "120" },
  { "target": "persona", "field_key": "inventory", "value_json": "[\"草药包\",\"绷带\"]" }
]
```

### 从零创建一个 persona

例："创建一个流浪医师身份"：

1. **changes**：
   - `name`：沈渡
   - `description`：被教会医院除名的行医人，现独自游走于瘟疫边境
   - `system_prompt`：写成具体人物的处境（出身、被除名的关键事件、现在去哪、身上还带着什么），不写"医师人格框架"
2. **stateValueOps**：
   - 若世界已存在 `hp` / `inventory` / `gold` 等字段，填对应初始值
   - 若世界没有这些字段，**不要自行新增**，改为提示父代理增加 world-card 步骤补字段模板

### 缺字段时转交世界卡

- 想记录"金币 / 携带物品"但当前世界 `existingPersonaStateFields` 没对应字段
- 不要发明 `field_key`
- 父代理应拆步：先 `world-card update` 补 `target:"persona"` 字段模板，再 `persona-card update` 填值

## 反例

- 给 persona 卡增加 lore 条目（persona 没有 entryOps）
- 给 persona 卡增加任何 `stateFieldOps`（不允许）
- 输出 `post_prompt` / `first_message`（不属于 persona changes）
- 生成不存在的 `field_key`
- 把"金币=120"直接写入 `system_prompt`（应用 stateValueOps）
- persona 卡 delete（不支持）
