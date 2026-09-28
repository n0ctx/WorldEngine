/**
 * default-state-fields.js — 新建世界的默认状态字段种子
 *
 * 仅在 services/worlds.js 的 createWorld() 里落库一次，落库后就是普通字段——
 * 用户可以在字段管理界面里改名、改类型、删除，跟手动创建的字段没有任何区别。
 * 不做迁移、不影响已存在的世界；导入世界卡（import-export.js）走裸 SQL 建表，不经过
 * createWorld，因此不会被这里的种子污染（导入的世界卡自带完整字段定义）。
 *
 * 只种世界层字段；玩家层 / 角色层不预设任何默认字段，由用户按需自行创建。
 *
 * 存储格式约定（与 StateFieldEditor.jsx / StateValueField.jsx 保持一致）：
 *   - text/enum   的 default_value 存"裸字符串"（不加 JSON 引号），如 '' 或 '晴'
 *   - list        的 default_value 存 JSON 数组字符串，如 '[]'
 *   - enum_options 传原生 JS 数组，落库时由 db/queries 层统一 JSON.stringify
 *   - number      不给 default_value（只设 min_value），留空表示无默认值
 *
 * world_state_fields 里 diary_time 固定占 sort_order 0（见 ensureDiaryTimeField），
 * 这里的世界层字段从 sort_order 1 开始。
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
