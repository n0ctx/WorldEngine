# 世界卡知识库（WORLDCARD.md）

> 写卡助手处理 `world-card` 类任务时加载本文件。所有 schema、字段、操作约束以本文件为准。
> 行为框架（怎么生成 JSON、怎么报告父代理）见 `assistant/prompts/sub-agent.md`，不在本文件。

## 世界卡架构概述

世界卡（world-card）是 WorldEngine 资源体系中"世界"层的承载，提供：

- 世界基础参数：`name` / `description` / `temperature` / `max_tokens`
- **世界 Prompt 条目**（`entryOps`，仅 world-card 拥有）：四种触发类型（always / keyword / llm / state），统一在 [7] 位置注入
- **三层状态字段定义**（`stateFieldOps`，仅 world-card 拥有）：`target:"world"` / `target:"persona"` / `target:"character"`

> 状态字段值（`stateValueOps`）由 character-card / persona-card 写入，**不属于 world-card**。
> 角色卡 / persona 的人设正文（`system_prompt` / `post_prompt` / `first_message`）也不属于 world-card。

世界内容（背景、规则、术式、长期 lore）一律通过 `entryOps` 的常驻条目（`trigger_type:"always"`）管理，**不要写进 changes**。

## changes 字段集

允许键只有：

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string | 世界名称 |
| `description` | string | 一句话简介（展示用，不要塞设定书） |
| `temperature` | number | LLM 采样温度（题材决定，严肃史诗偏低，轻松恋爱偏高） |
| `max_tokens` | number | LLM 最大输出长度 |

**禁止字段**：`system_prompt`、`post_prompt`（世界级别没有 prompt 字段；世界正文只能用 entryOps 表达）。

## entryOps 完整规则

每项 `op` 只能是 `create` / `update` / `delete`。`update` / `delete` 的 `id` 必须从 `preview_card` 返回数据中取得，不得自行发明。

### 通用字段

- `title`：条目标题
- `description`：1-2 句话描述**何时**触发（仅 `llm` 类型必填；`always`/`keyword`/`state` 可留空）
- `content`：完整注入内容（受术语约束：`{{user}}` / `{{char}}`）
- `keywords`：关键词数组（`keyword` 类型必填且至少 1 项）
- `keyword_scope`：`"user"` / `"assistant"` / `"user,assistant"`；**仅 `keyword` 类型生效**；至少包含一项，留空会被后端拒绝
- `keyword_logic`：`"AND"` / `"OR"`；**仅 `keyword` 类型生效**；`AND` = 所有关键词都出现才命中，`OR` = 任一关键词出现即命中（默认 `OR`）
- `active_turns`：非负整数；**仅 `keyword` 类型生效**；`0` = 命中后永久生效；`1` = 仅命中当轮；`N` = 命中后续 N 轮（默认 `1`）
- `trigger_type`：`always` / `keyword` / `llm` / `state`（必填）
- `token`：注入顺序权重，整数 ≥ 1，**越小越靠前、越大越靠后**（默认 1）。这是排序权重，不是优先级。LLM 对靠后的内容 recency 更强，因此**越靠后（token 数越大）实际优先级越高**；越靠前（token 数越小）越容易被后续内容覆盖。需要 LLM 严格遵守的规则应放大 token 让其靠后注入，背景设定可放小 token 靠前注入。回复用户时禁止把 "token=1" 描述为 "优先级最高"

> `position` 字段已废弃，禁止输出。所有命中条目统一在 [7] 注入。

### 四种 trigger_type

| trigger_type | 用途 | 关键约束 |
|---|---|---|
| `always` | 常驻条目，每轮必注入；用于世界观核心框架、不可违背的法则 | `keywords` 可为空 |
| `keyword` | 关键词命中时注入；用于专有名词触发的 lore | `keywords` 至少 1 项；空则改用 llm 或 always |
| `llm` | LLM 读 `description` 字段语义判定是否注入（关键词兜底）；用户/UI 称"AI 召回条目" | **不是向量召回**；`description` 必填 |
| `state` | 当前会话状态全部满足 `conditions` 时注入 | `conditions` 至少 1 项，否则永远不触发 |

> 任务文本出现"AI 召回条目" / "AI召回" 时，必须输出 `trigger_type:"llm"` 并写非空 `description`，禁止降级为 keyword 或 always。

### keyword vs llm 选择

- 选 keyword：有明确专有名词（如"地下黑市""审判庭"）；2-5 个关键词可精确覆盖；内容较短（<150 字）
- 选 llm：概念抽象、关键词难穷举（如"阶级压迫""政治阴谋"）；语义相关时触发；内容较长（>200 字）
- 同一段 lore 不要同时建 keyword 和 llm 两条；keyword 写 20 个关键词应改 llm，llm 写 1-2 个具体关键词应改 keyword

### conditions（trigger_type:"state" 专用）

- 数组所有条件 **AND** 逻辑，必须全部满足；不支持 OR（OR 拆成多条独立 state 条目）
- 每项格式：`{ "target_field": "<层级>.<label>", "operator": "...", "value": "..." }`
- `target_field` 必须使用真实字段标签：`世界.xxx` / `玩家.xxx` / `角色.xxx`，不要只写裸 `field_key`
- 操作符：
  - 数值：`>` `<` `=` `>=` `<=` `!=`
  - 文本：`包含` `等于` `不包含`
  - **datetime**：使用数值操作符；`value` 必须写完整 ISO 局部时间 `"YYYY-MM-DDTHH:mm"`，按段位解析为整数后逐段比较

### 状态字段与 state 条目耦联约束（必读）

`target_field` 中的 label 部分必须与真实存在的状态字段 `label` **逐字符一致**（大小写敏感）。系统按 label 查找字段——字段不存在 = 条件永远为假 = 条目永远不触发。

实践：
1. 引用已有字段：先 `preview_card` 确认真实 label
2. 同提案同时创建字段和 state 条目：`stateFieldOps.create.label` 与 `conditions[].target_field` 的 label 部分必须逐字一致
3. 跨提案：先落库字段，再创建引用该字段的 state 条目；或同提案一并完成

### 示例

create 常驻：
```json
{ "op": "create", "title": "世界背景", "description": "", "content": "完整内容", "keywords": [], "trigger_type": "always", "token": 1 }
```

create 关键词（AND + 仅 user 消息触发 + 命中后保持 3 轮）：
```json
{
  "op": "create", "title": "黑市暗号", "description": "",
  "content": "{{user}} 报出暗号后，黑市探子会暗中跟踪…",
  "keywords": ["影笺", "暗号"],
  "keyword_scope": "user",
  "keyword_logic": "AND",
  "active_turns": 3,
  "trigger_type": "keyword",
  "token": 5
}
```

create 状态触发：
```json
{
  "op": "create", "title": "决战节奏提醒", "description": "",
  "content": "{{char}} 的反应应切到高压节奏...",
  "trigger_type": "state",
  "conditions": [{ "target_field": "世界.剧情阶段", "operator": "等于", "value": "决战" }],
  "token": 1
}
```

update / delete：
```json
{ "op": "update", "id": "现有条目ID", "content": "新的注入内容" }
{ "op": "delete", "id": "现有条目ID" }
```

## stateFieldOps 完整规则

每项 `op` 只能是 `create` / `update` / `delete`。`update`/`delete` 的 `id` 必须从 `preview_card` 取得。

### target 取值（仅 world-card）

- `"world"`：世界/环境/剧情局势字段
- `"persona"`：`{{user}}` 状态字段
- `"character"`：`{{char}}` 共享字段定义（具体值由 character-card 写）

> character-card / persona-card **不允许** stateFieldOps。

### 7 种 type

> 选 type 前按 **boolean → number → datetime → enum → list → table → text** 顺序逐项排除，不允许跳步。默认禁止 `text`，必须先排除其他 6 种。

| type | 用于 | 正例 | 不要用于 |
|---|---|---|---|
| `boolean` | 二元状态：是否死亡、是否已解锁、是否入伙 | `已入伙: false` | 多选项状态（用 enum）|
| `number` | 纯数字：HP、金币、好感度、侵蚀度、声望、进度% | `HP: 85` | 文本描述、有固定选项的状态 |
| `datetime` | 可比较的时间点：游戏内当前日期时间、剧情时间线、约定截止时间 | `当前时间: "1000-03-15T14:30"` | 时长（用 number）；模糊时段（用 text/enum）|
| `enum` | 有固定可枚举选项：天气、剧情阶段、情绪、关系状态 | `天气: 酸雨/晴天/暴雪` | 数量无限或自由填写 |
| `list` | 可增减集合：背包、清单、已知线索、激活任务 | `背包: ["火把", "解毒药"]` | 单值字段（用 enum/text）|
| `table` | 一组同结构的并列数值：六维属性、攻防速、左右手装备耐久 | `三围: {atk:30, def:20, spd:15}` | 列数会变化的数据（用 list）；非数值字段 |
| `text` | 真正需要自由描述的状态：当前伤势详情 | `伤势描述: "右臂骨折"` | 一切可用前 6 种覆盖的场景 |

datetime 格式：`"YYYY-MM-DDTHH:mm"`，年份为正整数、可任意位数（1-N 位均可），月/日/时/分各 2 位（例 `"1000-03-15T14:30"` 或 `"238-04-20T00:00"`）。比较按段位解析为整数后逐段比较，不需要等宽零填充年份。

### update_mode

- `"manual"`：仅写卡助手或前端显式写入，不参与每轮自动更新
- `"llm_auto"`：每轮对话后由 LLM 根据 `update_instruction` 自动更新

### prefix（仅 datetime）

`datetime` 字段可选 `prefix` 字段，写展示前缀字符串（如 `"第三纪元 "`），仅前端渲染用，**不参与 LLM 比较**。

### default_value 写法

- number → `"100"`
- text → `"\"正常\""`
- enum → `"\"序章\""`
- list → `"[]"`（空数组；预设值如 `"[\"线索A\"]"`）
- boolean → `"false"`
- datetime → `"\"1000-03-15T14:30\""`
- table → `"{\"atk\":10,\"def\":5}"`（对象；key 必须是 `table_columns` 里声明过的列 key，值必须是数值）

### table_columns（仅 type='table'）

`type='table'` 字段必须填写 `table_columns`：JSON 数组，每项 `{ "key": "atk", "label": "攻", "min": 0, "max": 99 }`。`key` 仅允许字母数字下划线且列内唯一；`label` 是表头展示文本；`min` / `max` 可选，前端按上下限渲染进度条。`type='table'` 时禁止填写 `enum_options` / `min_value` / `max_value` / `prefix`。

### 示例

create：
```json
{
  "op": "create", "target": "world", "field_key": "story_phase",
  "label": "剧情阶段", "type": "enum",
  "description": "当前主线推进到哪一阶段",
  "default_value": "\"序章\"",
  "update_mode": "llm_auto",
  "update_instruction": "根据剧情推进更新阶段",
  "enum_options": ["序章", "调查", "冲突", "决战"],
  "allow_empty": 1
}
```

update（只输出需要修改的字段）：
```json
{ "op": "update", "target": "world", "id": "现有字段ID", "label": "新标签", "default_value": "\"新默认值\"" }
```

delete：
```json
{ "op": "delete", "target": "world", "id": "现有字段ID" }
```

create（table 类型示例）：
```json
{
  "op": "create", "target": "character", "field_key": "stats",
  "label": "三围", "type": "table",
  "description": "角色基础属性，按攻/防/速三列存储",
  "default_value": "{\"atk\":30,\"def\":20,\"spd\":15}",
  "table_columns": [
    { "key": "atk", "label": "攻", "min": 0, "max": 99 },
    { "key": "def", "label": "防", "min": 0, "max": 99 },
    { "key": "spd", "label": "速", "min": 0, "max": 99 }
  ],
  "update_mode": "llm_auto",
  "update_instruction": "战斗结果或装备变化后更新对应列",
  "allow_empty": 1
}
```

> 状态条目 (`trigger_type='state'`) 的条件 `target_field` 可定位到具体一列，格式 `角色.三围.atk`（即 `scope.field_label.column_key`）。

## 操作手册

### 完整新建世界卡（建议骨架）

1. **基础参数**：`name` / `description` / `temperature` / `max_tokens`
2. **核心框架条目**（1-2 条 `always`）：世界观概述、核心规则；精炼、稳定、不堆砌
3. **基础状态字段**（建议覆盖三层、覆盖多种 type）：
   - 世界层：天气(enum)、剧情阶段(enum)、白天/黑夜(boolean)
   - {{user}} 层：HP/金币(number)、背包(list)
   - {{char}} 层：好感度(number)、任务状态(enum)、是否入伙(boolean)
4. **Lore 条目**（3-8 条 `keyword` 或 `llm`）：地点、组织、势力、历史事件、文化习俗
5. **动态提醒条目**（2-4 条 `state`）：HP < 30 紧急反应、剧情阶段切换叙事变化、好感阈值互动模式

> 不要一次塞太多内容，宁可精简骨架让用户后续增量补充。

### 状态机世界卡（轮回 / 任务结算 / 阶段推进）

1. 创建世界层 enum 字段作为唯一阶段字段：`field_key:"mission_phase"` / `label:"任务阶段"` / `enum_options:[...]`
2. 为每个阶段创建一条 `trigger_type:"state"` 条目，`conditions` 引用同一个真实字段 label
3. 入口条目（如"开始游戏"）若无稳定关键词，用 `trigger_type:"llm"`，不要输出空 `keywords:[]` 的 keyword 条目
4. 属性 / 背包 / 技能等是 `{{user}}` 状态字段定义，放在 `stateFieldOps` 的 `target:"persona"`；初始值由后续 persona-card 步骤填写

### 修复 / 补强已有世界卡

- 先 `preview_card` 拉现状
- 优先复用已有字段，缺什么再补；不要重复创建
- 补"状态-状态条目动态系统"：先确认状态字段齐全 → 再补 `state` 条目把状态变化和叙事提醒接起来

### 创建世界时预设初始状态值

`world-card` 不支持 `stateValueOps`。需要预设初始属性值时拆步骤：
- Step 1：`world-card create` 定义状态字段
- Step 2：`persona-card update`（依赖 Step 1）用 `stateValueOps` 填初始值
- `field_key` 必须与 Step 1 字段一致

## 反例

- 把"当前战争进度 72%"写进 always 条目（应是 stateField）
- 把 `{{user}}` 血量写进 entryOps（应是 stateField，target:"persona"）
- `conditions` 写裸 field_key：`{ "target_field": "hp", ... }`（缺层级前缀）
- `stateFieldOps` 创建 `label:"生命值"` 但 `conditions` 写 `target_field:"玩家.HP"`——label 不一致永远不触发
- 输出 `position:"system"` / `position:"post"`（已废弃）
- 在 `changes` 输出 `system_prompt` / `post_prompt`
