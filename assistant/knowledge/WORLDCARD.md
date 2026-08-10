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

`name`（世界名称）/ `description`（一句话简介，展示用，不要塞设定书）/ `temperature`（LLM 采样温度，题材决定：严肃史诗偏低，轻松恋爱偏高）/ `max_tokens`。

**禁止字段**：`system_prompt`、`post_prompt`（世界级别没有 prompt 字段，且后端会静默丢弃这两个键、不报错；世界正文只能用 entryOps 表达）。

## entryOps 完整规则

每项 `op` 只能是 `create` / `update` / `delete`。`update` / `delete` 的 `id` 必须从 `preview_card` 返回数据中取得，不得自行发明——ID 不存在时后端不会报错，只是这条 op 静默不生效。

### 字段补充说明（schema 已声明字段名/类型，这里只写 schema 没有的语义）

- `description`：仅 `trigger_type:"llm"` 必填（LLM 靠它语义判定是否注入）；其余类型留空即可，不校验、不报错。
- `content`：受术语约束，写 `{{user}}` / `{{char}}` 占位符。
- `keyword_scope` / `keyword_logic` / `active_turns`：**仅 `trigger_type:"keyword"` 生效**，其他类型填了会被静默存下但不产生任何效果。`keyword_logic` 的 `AND` = 所有关键词都出现才命中，`OR`（默认）= 任一出现即命中。`active_turns`：`0` = 命中后永久生效；`1`（默认）= 仅命中当轮；`N` = 命中当轮后再续 N-1 轮 carry-over（共 N 轮）。fresh hit 只扫"本轮"最新一条 user/assistant 消息，跨轮持续完全由该字段控制。
- `condition_logic`：`"AND"` / `"OR"`，**仅 `trigger_type:"state"` 生效，且不在 apply 工具的 schema 里**（写了才有效，不写默认 `"AND"`，非 `"OR"` 的值一律按 `"AND"` 处理，不报错）。多条 `conditions` 要 OR 时直接填该字段，不要把同一条目拆成多条。
- `token`：整数 ≥1（默认 1，非法值静默钳到 1）。**特例 `token=0`（cached layer）**：仅 `trigger_type:"always"` 允许填 0；该条目**不进 [7] 注入**，转而拼到 cached system 消息末尾（位于 [3] 之后），是 prompt cache 的一部分，按 `sort_order ASC, created_at ASC` 稳定排序，适合"始终常驻、文本稳定、希望命中 prompt cache"的世界观核心条目。trigger_type 从 always 切走时 token=0 会被后端静默归一为 1。回复用户时禁止把 "token=1" 描述为"优先级最高"——token 越大越靠后，LLM 对靠后内容 recency 更强，越靠后实际优先级越高。
- `sort_order`：同 token 时的细排序，LLM 一般无需主动输出。

> `position` 字段已废弃，禁止输出（见「反例」）。所有命中条目统一在 [7] 注入。

### trigger_type 选型（always / keyword / llm / state；schema 不做 enum 校验，写错值会被静默丢弃，务必按此表填）

- `always`：常驻，每轮必注入；世界观核心框架、不可违背的法则
- `keyword`：关键词命中时注入；专有名词触发的 lore；`keywords` 至少 1 项，否则永远不触发
- `llm`：LLM 读 `description` 语义判定是否注入（**不是向量召回**）；用户/UI 称"AI 召回条目"；`description` 必填
- `state`：当前会话状态满足 `conditions`（按 `condition_logic`）时注入；`conditions` 至少 1 项，否则永远不触发

> 任务文本出现"AI 召回条目" / "AI召回" 时，必须输出 `trigger_type:"llm"` 并写非空 `description`，禁止降级为 keyword 或 always。

### keyword vs llm 选择

- 选 keyword：有明确专有名词（如"地下黑市""审判庭"）；2-5 个关键词可精确覆盖；内容较短（<150 字）
- 选 llm：概念抽象、关键词难穷举（如"阶级压迫""政治阴谋"）；语义相关时触发；内容较长（>200 字）
- 同一段 lore 不要同时建 keyword 和 llm 两条；keyword 写 20 个关键词应改 llm，llm 写 1-2 个具体关键词应改 keyword

### conditions（trigger_type:"state" 专用）

- 每项格式：`{ "target_field": "<层级>.<label>", "operator": "...", "value": "..." }`；`target_field` 必须使用真实字段标签 `世界.xxx` / `玩家.xxx` / `角色.xxx`，不要只写裸 `field_key`（裸键在同名冲突时会报错，要求改写为带层级前缀的形式）。
- 操作符非法会直接报错自纠；**datetime** 字段是唯一的静默风险点：必须用数值操作符，`value` 必须写完整 ISO 局部时间 `"YYYY-MM-DDTHH:mm"`，按段位解析为整数逐段比较，格式不对不会报错，只会导致条件永远不匹配。

### 状态字段与 state 条目耦联约束（必读）

`target_field` 中的 label 部分必须与真实存在的状态字段 `label` **逐字符一致**（大小写敏感）。系统按 label 查找字段——字段不存在 = 条件永远为假 = 条目永远不触发，**这个错配不会报错**。

实践：
1. 引用已有字段：先 `preview_card` 确认真实 label
2. 同提案同时创建字段和 state 条目：`stateFieldOps.create.label` 与 `conditions[].target_field` 的 label 部分必须逐字一致
3. 跨提案：先落库字段，再创建引用该字段的 state 条目；或同提案一并完成

### 示例

create 常驻（cached layer，`always` + `token=0`）：
```json
{ "op": "create", "title": "世界观核心", "content": "本世界遵循 …（极稳定的世界规则，几乎不会改）", "trigger_type": "always", "token": 0 }
```

create 关键词（AND + 仅 user 消息触发 + 命中后保持 3 轮）：
```json
{
  "op": "create", "title": "黑市暗号", "content": "{{user}} 报出暗号后，黑市探子会暗中跟踪…",
  "keywords": ["影笺", "暗号"], "keyword_scope": "user", "keyword_logic": "AND", "active_turns": 3,
  "trigger_type": "keyword", "token": 5
}
```

create 状态触发（OR 任一满足即可）：
```json
{
  "op": "create", "title": "战斗高压预警", "content": "{{char}} 的语气应变得急促、戒备。",
  "trigger_type": "state", "condition_logic": "OR",
  "conditions": [
    { "target_field": "角色.HP", "operator": "<", "value": "30" },
    { "target_field": "世界.剧情阶段", "operator": "等于", "value": "决战" }
  ],
  "token": 1
}
```

update / delete：
```json
{ "op": "update", "id": "现有条目ID", "content": "新的注入内容" }
{ "op": "delete", "id": "现有条目ID" }
```

## stateFieldOps 完整规则

每项 `op` 只能是 `create` / `update` / `delete`。`update`/`delete` 的 `id` 必须从 `preview_card` 取得。`target` 只能是 `"world"` / `"persona"` / `"character"`；character-card / persona-card 上出现 stateFieldOps 会直接报错拒绝（状态字段的创建/修改/删除只能在 world-card 做）。

- `"world"`：世界/环境/剧情局势字段
- `"persona"`：`{{user}}` 状态字段
- `"character"`：`{{char}}` 共享字段定义（具体值由 character-card 写）

### 默认状态字段（新建世界自带，禁止重复创建）

新建世界时，`createWorld()` 已自动落库以下状态字段（定义见 `backend/utils/default-state-fields.js`）。落库后它们就是普通字段——用户可在字段管理界面改名/改类型/删除，写卡助手也可以对它们发起 `update` / `delete`，但**禁止再创建语义重复的新字段**。

| 层级 | field_key | label | type | update_mode | 备注 |
|---|---|---|---|---|---|
| world | `location` | 地点 | text | llm_auto | |
| world | `weather` | 天气 | enum | llm_auto | 选项：晴/多云/阴/雨/雪/雾/风暴 |
| world | `diary_time` | 时间 | datetime | llm_auto 或 system_rule | 仅日记功能开启时存在，sort_order 固定 0 |
| persona **与** character（两层字段定义相同，各层各自独立取值） | `personality` | 性格 | list | manual | |
| 同上 | `age` | 年龄 | number | manual | |
| 同上 | `appearance` | 外貌 | list | manual | |
| 同上 | `outfit` | 穿着 | list | llm_auto | |
| 同上 | `identity` | 身份 | list | manual | 身份/职业/头衔 |

> 不含姓名字段——角色/玩家表本身已有 `name` 列，不要为姓名再建状态字段。

**禁止创建同义重复字段**：以下常见同义词已被默认字段覆盖，命中即禁止另建，应复用已有 `field_key`：

- 服装 / 衣着 / 装扮 / 穿搭 → 已有 `outfit`（穿着，list）
- 外形 / 长相 / 容貌 / 相貌 → 已有 `appearance`（外貌，list）
- 职业 / 头衔 / 身份背景 / 身份标签 → 已有 `identity`（身份，list）
- 位置 / 所在地 / 场景 / 当前地点 → 已有 `location`（地点，text）
- 气候 / 天色 / 天候 → 已有 `weather`（天气，enum）
- 性情 / 脾气 / 秉性 → 已有 `personality`（性格，list）
- 岁数 / 年岁 → 已有 `age`（年龄，number）

**需要调整默认字段时**（如某世界"天气"枚举选项不合适、非人类世界不需要"年龄"），走 `stateFieldOps` 的 `update` / `delete` 改这些已有字段，不要另起一个新 `field_key`。

只应新增**默认字段未覆盖的、世界特有**的字段：如 HP、金币、好感度、任务阶段、修为、声望、势力值等。

### 7 种 type 选型（枚举见 schema：number / text / enum / list / boolean / datetime / table）

> 选 type 前按 **boolean → number → datetime → enum → list → table → text** 顺序逐项排除，不允许跳步。默认禁止 `text`，必须先排除其他 6 种——这是纯选型判断，schema 只给类型枚举，不会替你把关。

- `boolean`：二元状态（是否死亡/已解锁/入伙），不要用于多选项状态（应用 enum）
- `number`：纯数字（HP、金币、好感度、侵蚀度、声望、进度%）；可选 `min_value` / `max_value`，参与每轮自动状态更新的越界裁剪与前端进度条渲染
- `datetime`：可比较的时间点（游戏内当前日期时间、剧情时间线、约定截止时间），不要用于时长（应用 number）或模糊时段（应用 text/enum）
- `enum`：固定可枚举选项（剧情阶段、情绪、关系状态），不要用于数量无限或自由填写的场景
- `list`：可增减集合（背包、清单、已知线索、激活任务），不要用于单值字段（应用 enum/text）
- `table`：一组同结构的并列数值（六维属性、攻防速），列数会变化的数据应用 list，非数值字段不要放进 table
- `text`：真正需要自由描述的状态（如伤势详情），一切可用前 6 种覆盖的场景都不要用 text

datetime 格式：`"YYYY-MM-DDTHH:mm"`，年份为正整数、可任意位数，月/日/时/分各 2 位（例 `"1000-03-15T14:30"`）；不符合会直接报错自纠。

### update_mode

- `"manual"`：仅写卡助手或前端显式写入，不参与每轮自动更新
- `"llm_auto"`：每轮对话后由 LLM 根据 `update_instruction` 自动更新
- `"system_rule"`（仅默认字段 `diary_time` 使用，由 `createWorld()` 直接写库）：由系统规则驱动，不交给 LLM。**写卡助手不要主动输出这个值**——它不在合法枚举内，写了会被静默拒绝并回退为 `manual`，不会报错也不会变成你想要的效果。

### default_value 写法（除 datetime / table 外，格式错误不会报错，只会存入错误的值）

- number → `"100"`；text → `"\"正常\""`；enum → `"\"序章\""`；boolean → `"false"`
- list → `"[]"`（空数组；预设值如 `"[\"线索A\"]"`）
- datetime → `"\"1000-03-15T14:30\""`（格式错误会直接报错）
- table → `"{\"atk\":10,\"def\":5}"`（对象；key 必须是 `table_columns` 里声明过的列 key 且值必须是数值，否则报错）

### table_columns（仅 type='table'）

必填，JSON 数组，每项 `{ "key": "atk", "label": "攻", "min": 0, "max": 99 }`；`key` 仅允许字母数字下划线且列内唯一，格式错误会报错。`type='table'` 时禁止填写 `enum_options` / `min_value` / `max_value` / `prefix`（填了会报错）。

状态条目 (`trigger_type='state'`) 的条件 `target_field` 可定位到具体一列，格式 `角色.三围.atk`（即 `scope.field_label.column_key`）。

### 示例

create：
```json
{
  "op": "create", "target": "world", "field_key": "story_phase",
  "label": "剧情阶段", "type": "enum",
  "default_value": "\"序章\"",
  "update_mode": "llm_auto",
  "update_instruction": "根据剧情推进更新阶段",
  "enum_options": ["序章", "调查", "冲突", "决战"]
}
```

create（table 类型）：
```json
{
  "op": "create", "target": "character", "field_key": "stats",
  "label": "三围", "type": "table",
  "default_value": "{\"atk\":30,\"def\":20,\"spd\":15}",
  "table_columns": [
    { "key": "atk", "label": "攻", "min": 0, "max": 99 },
    { "key": "def", "label": "防", "min": 0, "max": 99 },
    { "key": "spd", "label": "速", "min": 0, "max": 99 }
  ],
  "update_mode": "llm_auto",
  "update_instruction": "战斗结果或装备变化后更新对应列"
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

> `nearby_enabled`（仅 `target:"character"` 可选布尔，默认 `true`）：控制该字段是否被"附近/登场角色"临时角色池继承。`false` 时只作用于正式角色卡，登场角色不显示也不写入。用于 HP / MP / 复杂数值表等只对正式 `{{char}}` 有意义的字段。非 character 字段填了会报错。

> `prefix`（仅 datetime 类型可选）：展示前缀字符串（如 `"第三纪元 "`），仅前端渲染用，**不参与 LLM 比较**。

## 操作手册

### 完整新建世界卡（建议骨架）

1. **基础参数**：`name` / `description` / `temperature` / `max_tokens`
2. **核心框架条目**（1-2 条 `always`）：世界观概述、核心规则；精炼、稳定、不堆砌
3. **世界特有状态字段**（默认字段已自动创建，见「默认状态字段」；这里只补默认字段未覆盖的、世界特有的字段）：世界层剧情阶段(enum)/昼夜(boolean)、{{user}} 层 HP/金币(number)/背包(list)、{{char}} 层好感度(number)/任务状态(enum)/是否入伙(boolean)
4. **Lore 条目**（3-8 条 `keyword` 或 `llm`）：地点、组织、势力、历史事件、文化习俗
5. **动态提醒条目**（2-4 条 `state`）：HP < 30 紧急反应、剧情阶段切换叙事变化、好感阈值互动模式

> 不要一次塞太多内容，宁可精简骨架让用户后续增量补充。

### 状态机世界卡（轮回 / 任务结算 / 阶段推进）

1. 创建世界层 enum 字段作为唯一阶段字段：`field_key:"mission_phase"` / `label:"任务阶段"` / `enum_options:[...]`
2. 为每个阶段创建一条 `trigger_type:"state"` 条目，`conditions` 引用同一个真实字段 label
3. 入口条目（如"开始游戏"）若无稳定关键词，用 `trigger_type:"llm"`，不要输出空 `keywords:[]` 的 keyword 条目
4. 属性 / 背包 / 技能等是 `{{user}}` 状态字段定义，放在 `stateFieldOps` 的 `target:"persona"`；初始值由后续 persona-card 步骤填写

### 修复 / 补强已有世界卡

先 `preview_card` 拉现状 → 优先复用已有字段，缺什么再补，不要重复创建 → 确认状态字段齐全后再补 `state` 条目把状态变化和叙事提醒接起来。

### 创建世界时预设初始状态值

`world-card` 不支持 `stateValueOps`。需要预设初始属性值时拆步骤：Step 1 `world-card create` 定义状态字段 → Step 2 `persona-card update`（依赖 Step 1）用 `stateValueOps` 填初始值，`field_key` 须与 Step 1 一致。

## 反例

- 把"当前战争进度 72%"写进 always 条目（应是 stateField）
- 把 `{{user}}` 血量写进 entryOps（应是 stateField，target:"persona"）
- `conditions` 写裸 field_key：`{ "target_field": "hp", ... }`（缺层级前缀）
- `stateFieldOps` 创建 `label:"生命值"` 但 `conditions` 写 `target_field:"玩家.HP"`——label 不一致永远不触发
- 为了凑 OR 逻辑把同一段 state 条目拆成多条（应改 `condition_logic:"OR"`）
- `trigger_type:"keyword"` 或 `"state"` 上填 `token:0`（被后端归一为 1，cached layer 仅 `always` 可用）
- 输出 `position:"system"` / `position:"post"`（已废弃）
- 在 `changes` 输出 `system_prompt` / `post_prompt`
- 世界已有默认字段 `outfit`（穿着），还创建一个 `clothing`/"服装" 字段（语义重复，应复用或 `update` 已有字段，见「默认状态字段」）
