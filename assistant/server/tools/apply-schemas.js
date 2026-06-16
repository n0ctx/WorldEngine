// apply_* 工具的精确 input_schema 片段（"strict-ish" 模型引导）。
//
// 设计原则（经 normalize-proposal 逐字段核对）：
// - **只对 normalize 会 throw 的字段**加 `enum` / `required` / 收紧 `type`：
//   operation/op、stateFieldOps.target、stateFieldOps.type、stateValueOps 的 target/field_key/value_json。
//   这些字段模型写错 normalize 必抛错，提前在 schema 堵住能根除一批"格式错→重试→烧 token"。
// - **对 normalize 会 coerce / 回退的字段**只写 description，不 enum、不 required、不收紧 type：
//   keyword_scope/keyword_logic/active_turns/token/trigger_type/update_mode/mode/scope/min_value/max_value 等。
//   过紧的 schema 会让 provider 在一个本可被归一化救回的输入上直接 400。
// - 不使用 `additionalProperties:false`（normalize 的 pickAllowed 负责丢多余键），
//   不依赖 provider 的 strict 模式（Anthropic 无此旗标；OpenAI strict 要求全 required 与 additionalProperties:false，
//   与本项目"重度可选 + 服务端归一"的设计相悖）。
// - 只用栈内已有的 schema 构造（含 `type:['string','null']` 联合）；不用 oneOf/anyOf/tuple 等易触发跨 provider 400 的关键字。

// 世界 Prompt 条目（lore / 关键词 / state 条目）增改删。仅 world-card 暴露。
export const entryOpsSchema = {
  type: 'array',
  description: 'Prompt 条目增改删；persona/character 没有条目，所有条目都属 world-card。',
  items: {
    type: 'object',
    properties: {
      op: { type: 'string', enum: ['create', 'update', 'delete'] },
      id: { description: 'update / delete 必填：目标条目 ID（create 不填）' },
      title: { description: '条目标题' },
      description: { description: '条目说明' },
      content: { description: '条目正文（注入到 Prompt 的内容）' },
      keywords: { description: '关键词数组（字符串）；trigger_type=keyword 时必须非空' },
      keyword_scope: { description: "可选 'user' / 'assistant' / 'user,assistant'，留空默认全选" },
      keyword_logic: { description: 'AND / OR，默认 OR' },
      active_turns: { description: '生效轮数，整数，默认 1' },
      token: { description: '排序权重，整数 ≥1，默认 1（越大越靠后、recency 越强）' },
      trigger_type: { description: 'always / keyword / llm / state' },
      conditions: { description: 'trigger_type=state 时的条件数组：[{ target_field, operator, value }]' },
    },
    required: ['op'],
  },
};

// 世界状态字段「定义」增改删（不是字段值）。仅 world-card 暴露。
export const stateFieldOpsSchema = {
  type: 'array',
  description: '状态字段「定义」的增改删；只能在 world-card 上做。写字段「值」请用 stateValueOps。',
  items: {
    type: 'object',
    properties: {
      op: { type: 'string', enum: ['create', 'update', 'delete'] },
      target: { type: 'string', enum: ['world', 'persona', 'character'], description: '字段归属：世界 / 玩家 / 角色' },
      id: { description: 'update / delete 必填：目标字段 ID（create 不填）' },
      field_key: { description: 'create 必填：字段精确键（如 hp / gold）' },
      label: { description: 'create 必填：中文显示名' },
      type: { type: 'string', enum: ['number', 'text', 'enum', 'list', 'boolean', 'datetime', 'table'] },
      description: { description: '字段说明' },
      default_value: { description: '默认值（按 type 给对应形态）' },
      update_mode: { description: 'llm_auto / manual，非法值会被忽略' },
      update_instruction: { description: 'llm_auto 时给模型的更新指引' },
      enum_options: { description: 'type=enum 时的选项数组（字符串）' },
      min_value: { description: 'type=number 可选下限（参与越界裁剪与进度条）' },
      max_value: { description: 'type=number 可选上限' },
      allow_empty: { description: '是否允许空值（布尔）' },
      prefix: { description: '仅 datetime 类型可用的前缀' },
      table_columns: { description: '仅 type=table：列定义数组' },
      nearby_enabled: { description: '仅 target=character：是否参与"附近角色"' },
    },
    required: ['op'],
  },
};

// 状态字段「值」写入。target 取值随卡类型不同（persona-card→['persona']，character-card→['character']）。
export const stateValueOpsSchema = (targets) => ({
  type: 'array',
  description: '状态字段「值」写入；建议优先用 dispatch_subagent 的 stateValues 入参（工具层会自动生成本块）。',
  items: {
    type: 'object',
    properties: {
      target: { type: 'string', enum: targets },
      field_key: { type: 'string', description: '字段精确键（如 food_user / hp_char）' },
      value_json: {
        type: ['string', 'null'],
        description: 'JSON 字符串：list / table 等先 JSON.stringify；数字 / 布尔也要写成字符串；清空给 null。禁止直接给原生数组 / 对象 / 数字。',
      },
    },
    required: ['target', 'field_key', 'value_json'],
  },
});
