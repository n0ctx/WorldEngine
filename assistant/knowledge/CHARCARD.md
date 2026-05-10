# 角色卡知识库（CHARCARD.md）

> 写卡助手处理 `character-card` 类任务时加载本文件。`character-card` 即 `{{char}}` 卡，承载模型扮演的角色。
> 行为框架（怎么生成 JSON、怎么报告父代理）见 `assistant/prompts/sub-agent.md`，不在本文件。

## 角色卡架构

角色卡承载：

- 角色基本信息：`name` / `description`
- 人设正文：`system_prompt`（常驻人格内核）/ `post_prompt`（每轮输出提醒）/ `first_message`（开场白）
- 角色状态值：`stateValueOps`，仅 `target:"character"`，**只能填写已有字段的值**

不属于角色卡：

- 世界规则、世界 lore、世界条目（属于 world-card）
- 状态字段定义 / 修改 / 删除（一律由 world-card 管理）
- `{{user}}` 人设（属于 persona-card）
- 全局 prompt / CSS / 正则

## changes 字段集

允许键只有：

| 字段 | 说明 |
|---|---|
| `name` | 角色名 |
| `description` | 一句话简介（展示用，不要写设定书） |
| `system_prompt` | 完整角色 system prompt：常驻人格内核（性格、说话方式、价值观、静态背景、初始关系） |
| `post_prompt` | 每轮输出提醒（如第一人称、语气、格式约束） |
| `first_message` | 开场白；要像"第一次登场"，不是空泛打招呼 |

> 隐藏往事 / 技能细则 / 只在特定话题出现的记忆：简短的并入 `system_prompt` 末尾；篇幅大的应作为 world-card 条目，由 world-card 任务步骤添加，不要塞进 character-card。

> **不要把动态状态写进 `system_prompt`**（如"好感度=62"）。状态值用 `stateValueOps`。

## stateValueOps 规则

仅填写**已存在**的状态字段值。不能创建字段、不能删除字段，新字段需通过 world-card 任务管理。

> 字段定义上的 `nearby_enabled` 开关由 world-card 管理，character-card 不感知该字段，也不应在 `stateValueOps` 中输出该键。

### 格式

```json
{ "target": "character", "field_key": "affection", "value_json": "50" }
```

### 约束

- `target` 只允许 `"character"`（character-card 不能填 `target:"persona"` 或 `target:"world"`）
- `field_key` 必须来自 `preview_card` 返回的当前世界 `existingCharacterStateFields`
- `value_json` 必须是 JSON 字符串或 `null`
- enum 字段：`value_json` 字符串值必须来自该字段的 `enum_options`，禁止填列表外值
- 写入范围：只写默认状态值，不改运行时会话状态

### value_json 写法（按 type）

| type | 写法 |
|---|---|
| number | `"50"` |
| text | `"\"警觉\""` |
| enum | `"\"轻伤\""`（值来自该字段 `enum_options`）|
| list | `"[\"短刀\",\"钥匙\"]"` |
| boolean | `"true"` |
| datetime | `"\"1000-03-15T14:30\""`（ISO 局部时间 `YYYY-MM-DDTHH:mm`；年份为正整数、可任意位数；月/日/时/分各 2 位） |
| table | `"{\"atk\":30,\"def\":20}"`（对象 JSON；key 必须是该字段 `table_columns` 已声明的列 key，值必须是数值；未列出的列保持缺省）|
| 清空且字段允许为空 | `null` |

## 创建依赖约束

`character-card create` 必须依赖世界来源：

- 父代理派发时 `entityRef` 必须是 `context.worldId` 或前序 `step:<world-card-create>`
- create 模式下 proposal 的 `entityId` 填**所属世界 ID**（不是新角色 ID；新角色 ID 由后端生成）
- `update` / `delete` 模式下 `entityId` 必须保留给定的角色 ID
- 没有状态值变更时，`stateValueOps` 输出空数组 `[]`

> 复合任务（同时建世界 + 角色）必须在计划文档中显式声明依赖：character 步骤的"依赖：step-<world-card-create>"。

## 操作手册

### 改人设

- 性格、说话方式、价值观、压抑表达 → `system_prompt`
- 每轮输出约束（如"始终少说一句、避免解释过多"）→ `post_prompt`
- 第一次见面情境 → `first_message`

### 填写现有状态值

- 当前世界已定义 `affection`、`injury_level`，要表达"她现在好感度 50，轻伤"：
  ```json
  [
    { "target": "character", "field_key": "affection", "value_json": "50" },
    { "target": "character", "field_key": "injury_level", "value_json": "\"轻伤\"" }
  ]
  ```

### 缺字段时转交世界卡

- 想记录"携带武器"但 `preview_card` 没对应字段 → 不要发明 `field_key`
- 应在父代理层面拆步：先 `world-card update` 补字段模板，再 `character-card update` 填值

### 状态机世界中的角色卡

- 状态机世界的"任务阶段""血统"等字段已由 world-card 定义
- 角色卡只负责该角色身上的具体值（如某个角色的初始好感、初始伤势），不要再生成字段定义

## 反例

- 把"这个世界由蒸汽帝国统治"写进角色卡（应是 world-card 条目）
- 把"好感度=62"写进 `system_prompt`（应是 stateValueOps）
- 生成 `stateFieldOps`（任何形式都不允许）
- 生成 `entryOps`（不允许）
- 填写 `target:"persona"` 或 `target:"world"` 的状态值（character-card 只能 `target:"character"`）
- 发明世界里不存在的 `field_key`
- create 时把 `entityId` 填 `null`（必须填所属世界 ID）
