/**
 * default-state-fields.js — 新建世界的默认状态字段种子
 *
 * 仅在 services/worlds.js 的 createWorld() 里落库一次，落库后就是普通字段——
 * 用户可以在字段管理界面里改名、改类型、删除，跟手动创建的字段没有任何区别。
 * 不做迁移、不影响已存在的世界；导入世界卡（import-export.js）走裸 SQL 建表，不经过
 * createWorld，因此不会被这里的种子污染（导入的世界卡自带完整字段定义）。
 *
 * 存储格式约定（与 StateFieldEditor.jsx / StateValueField.jsx 保持一致）：
 *   - text/enum   的 default_value 存"裸字符串"（不加 JSON 引号），如 '' 或 '晴'
 *   - list        的 default_value 存 JSON 数组字符串，如 '[]'
 *   - enum_options 传原生 JS 数组，落库时由 db/queries 层统一 JSON.stringify
 *   - number      不给 default_value（只设 min_value），留空表示无默认值
 *
 * world_state_fields 里 diary_time 固定占 sort_order 0（见 ensureDiaryTimeField），
 * 这里的世界层字段从 sort_order 1 开始；persona / character 层各自独立计数，从 0 开始。
 */

export const DEFAULT_WORLD_STATE_FIELDS = [
  {
    field_key: 'location',
    label: '地点',
    type: 'text',
    description: '当前故事发生的地点',
    update_mode: 'llm_auto',
    update_instruction: '跟随剧情中人物所处位置变化更新，写具体地点名',
    allow_empty: 1,
    default_value: '',
    sort_order: 1,
  },
  {
    field_key: 'weather',
    label: '天气',
    type: 'enum',
    description: '当前世界的天气状况',
    update_mode: 'llm_auto',
    update_instruction: '仅在剧情明确提到天气变化时更新，未提及时保持原值不变',
    enum_options: ['晴', '多云', '阴', '雨', '雪', '雾', '风暴'],
    allow_empty: 1,
    default_value: '晴',
    sort_order: 2,
  },
];

/**
 * persona_state_fields 与 character_state_fields 共用同一套字段定义（两张表各自独立落库，
 * field_key 相同但互不影响）。不含姓名字段——角色/玩家表本身已有 name 列。
 */
export const DEFAULT_ACTOR_STATE_FIELDS = [
  {
    field_key: 'personality',
    label: '性格',
    type: 'list',
    description: '性格特点列表',
    update_mode: 'manual',
    allow_empty: 1,
    default_value: '[]',
    sort_order: 0,
  },
  {
    field_key: 'age',
    label: '年龄',
    type: 'number',
    description: '年龄',
    update_mode: 'manual',
    min_value: 0,
    allow_empty: 1,
    sort_order: 1,
  },
  {
    field_key: 'appearance',
    label: '外貌',
    type: 'list',
    description: '外貌特征列表',
    update_mode: 'manual',
    allow_empty: 1,
    default_value: '[]',
    sort_order: 2,
  },
  {
    field_key: 'outfit',
    label: '穿着',
    type: 'list',
    description: '当前穿戴的衣物与配饰列表',
    update_mode: 'llm_auto',
    update_instruction: '记录当前身上穿戴的衣物与配饰；换装、脱除、损坏时更新',
    allow_empty: 1,
    default_value: '[]',
    sort_order: 3,
  },
  {
    field_key: 'identity',
    label: '身份',
    type: 'list',
    description: '身份/职业/头衔列表',
    update_mode: 'manual',
    allow_empty: 1,
    default_value: '[]',
    sort_order: 4,
  },
];
