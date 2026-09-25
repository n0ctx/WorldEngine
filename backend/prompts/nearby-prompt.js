/**
 * nearby-prompt.js — 写作模式下嵌入 combined-state-updater 主提示词的 nearby pool 段。
 *
 * 仅 mode === 'writing' 时被调用；chat 模式不参与。
 *
 * @module backend/prompts/nearby-prompt
 */

function formatNearbyField(field) {
  let line = `  - ${field.field_key}（${field.label}，type=${field.type}）`;
  if (field.description) line += `；${field.description}`;
  if (field.type === 'enum' && Array.isArray(field.enum_options) && field.enum_options.length) {
    line += `；可选值（必须从中选一个）：[${field.enum_options.join(' / ')}]`;
  }
  if (field.type === 'number') {
    const lo = field.min_value != null ? field.min_value : '不限';
    const hi = field.max_value != null ? field.max_value : '不限';
    line += `；范围 ${lo}~${hi}`;
    if (field.unit) line += `；单位 ${field.unit}（仅展示，写入纯数字）`;
  }
  if (field.type === 'list') line += '；返回字符串数组 ["..","..",..]，替换整个列表';
  if (field.type === 'datetime') line += '；返回 ISO 局部时间 "YYYY-MM-DDTHH:mm"';
  if (field.type === 'table' && Array.isArray(field.table_columns) && field.table_columns.length) {
    const colDesc = field.table_columns.map((column) => {
      const lo = column.min != null ? column.min : '不限';
      const hi = column.max != null ? column.max : '不限';
      return `${column.key}(${column.label ?? column.key},${lo}~${hi})`;
    }).join(' / ');
    line += `；返回 {列key:数值,...}，列：[${colDesc}]，仅数值`;
  }
  if (field.type === 'boolean') line += '；返回 true 或 false';
  if (field.update_instruction) line += `\n    更新说明：${field.update_instruction}`;
  return line;
}

// 判断某字段值是否「空」：缺失 / null / 空串 / 空数组 / 空对象。
// 空字段需显式告知副 LLM 本轮补全，避免稀疏 patch 永远跳过未变化但仍为空的字段。
function isEmptyNearbyValue(value) {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function formatNearbyState(state) {
  return state && Object.keys(state).length
    ? Object.entries(state).map(([key, value]) => (
      `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`
    )).join(', ')
    : '（无）';
}

function formatNearbyPoolEntry(person, fieldKeys) {
  const stateStr = formatNearbyState(person.state);
  const missing = fieldKeys.filter((key) => (
    isEmptyNearbyValue(person.state ? person.state[key] : undefined)
  ));
  const missingStr = missing.length ? `｜待补全字段（本轮必须填）：[${missing.join(', ')}]` : '';
  return `- [id=${person.id}] ${person.name}（${person.is_saved ? '持续追踪' : '临时'}）｜人设：${person.persona || '（无）'}｜上轮状态：{${stateStr}}${missingStr}`;
}

/**
 * 构建 nearby pool 段。
 *
 * @param {Array<{id:string,name:string,is_saved:0|1,persona:string,state:Record<string,*>}>} pool
 *   当前 saved + 上轮 transient 池。state 为字段key→反序列化后的值映射；可为空对象。
 * @param {Array<object>} fields  nearby_enabled=1 的 character_state_fields
 * @param {object} [opts]
 * @param {string} [opts.playerName]  当前玩家（persona）名，用于显式排除其被识别为登场角色
 * @returns {string}
 */
export function buildNearbyPromptSection(pool, fields, opts = {}) {
  const playerName = typeof opts.playerName === 'string' ? opts.playerName.trim() : '';
  const fieldKeys = fields.map((field) => field.field_key);
  const fieldKeysCsv = fieldKeys.join(', ');
  const fieldsDesc = fields.map(formatNearbyField).join('\n');
  const poolDesc = pool.length
    ? pool.map((person) => formatNearbyPoolEntry(person, fieldKeys)).join('\n')
    : '（空）';

  return [
    '## 附近角色池',
    poolDesc,
    '',
    '## 启用字段（state 仅可包含这些 key）',
    fieldsDesc,
    '',
    '## 输出',
    '识别本轮以「名字、对话或动作主体」形式登场的角色（仅被路人提及不算），写入 nearby_characters：',
    '  [{ "ref_id": "<池中id 或 null（新角色）>", "name": "...", "state": {...}, "persona": "一句话人物设定" }, ...]',
    '池里有但本轮不在场的角色：不要输出。',
    playerName
      ? `严禁：玩家「${playerName}」是叙事视角主体（即"我/你/玩家"），永远不算登场角色。即使其名字、对话或动作出现在本轮正文中，也绝不可写入 nearby_characters，也不可在池中以该名建立新条目。`
      : '严禁：叙事视角主体（玩家本人）永远不算登场角色，即使其名字、对话或动作出现在本轮正文中，也不可写入 nearby_characters。',
    'persona：底层人物设定 —— 仅写性格 / 说话风格 / 长期身份 / 关键标签 等**稳定属性**。',
    '严禁在 persona 中写入：当前剧情片段、与玩家的临时关系状态、当下情绪/场景/位置 等动态内容；这些应通过叙事正文与 state 字段表达，不要污染 persona。',
    '新登场必填；已有角色仅在身份/性格描述需要修正补充时再输出 persona，否则省略字段（不强制每轮重写，避免覆盖稳定人设）。',
    '',
    '新登场角色：state 必须填齐所有启用字段，',
    `KEY 集合必须等于：[${fieldKeysCsv}]`,
    'name 必须是「专有人名」（真名 / 化名 / 昵称均可）：',
    '  ① 正文已给出名字 → 直接使用；',
    '  ② 正文未给出 → 按角色身份、性别、世界观（语言/族群/时代）合理虚构一个真名（如：林晚、佐藤遥、Marcus、阿依夏）；',
    '  严禁使用职业 / 外貌 / 身份描述短语作为 name，例如 "短发女猎人"、"黑衣男人"、"老板"、"路人甲"、"神秘女子" 等一律不允许。',
    '取值优先级：① 正文有述 → 按事实写；② 上下文暗示 → 按暗示推理；③ 完全无线索 → 按角色身份/场景/世界观合理性创作。',
    '严禁：留空 / null / 空字符串 / "未知"/"待定"/"暂无"/"不详"/"无"/"N/A"。',
    '严禁：因正文未提到就跳过该字段。',
    '每个值必须符合该字段 type/range/enum 约束。',
    '',
    '## 池中已有角色（ref_id 命中）—— 稀疏 patch',
    'state 仅含本轮变化的字段；未变化字段不要重复输出（保留上轮已有值，避免被弱模型打回默认）。',
    '但：该角色若标注了「待补全字段」，必须在本轮 state 中补全这些字段——即使本轮正文未涉及，也要按上方取值优先级合理推断/创作一个合规值，严禁继续留空。',
    '',
    '## 示例（启用字段假设为 [a, b, c]）',
    '✓ 新登场：{ "ref_id": null, "name": "...", "state": { "a": <a的合规值>, "b": <b的合规值>, "c": <c的合规值> }, "persona": "..." }',
    '✗ 新登场缺字段：{ "ref_id": null, "name": "...", "state": { "a": ... } }   ← 错：state 必须含 a/b/c 全部',
    '✓ 已有角色（仅 b 变化）：{ "ref_id": "<id>", "state": { "b": ... } }',
    '✓ 已有角色（仅 b 变化，但标注待补全 [c]）：{ "ref_id": "<id>", "state": { "b": <新值>, "c": <补全值> } }',
  ].join('\n');
}
