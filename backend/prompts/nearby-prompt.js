/**
 * nearby-prompt.js — 写作模式下嵌入 combined-state-updater 主提示词的 nearby pool 段。
 *
 * 仅 mode === 'writing' 时被调用；chat 模式不参与。
 *
 * @module backend/prompts/nearby-prompt
 */

/**
 * 构建 nearby pool 段。
 *
 * @param {Array<{id:string,name:string,is_saved:0|1,memory:string,state:Record<string,*>}>} pool
 *   当前 saved + 上轮 transient 池。state 为字段key→反序列化后的值映射；可为空对象。
 * @param {Array<object>} fields  nearby_enabled=1 的 character_state_fields
 * @returns {string}
 */
export function buildNearbyPromptSection(pool, fields) {
  const fieldKeys = fields.map((f) => f.field_key);
  const fieldKeysCsv = fieldKeys.join(', ');

  const fieldsDesc = fields.map((f) => {
    let line = `  - ${f.field_key}（${f.label}，type=${f.type}）`;
    if (f.description) line += `；${f.description}`;
    if (f.type === 'enum' && Array.isArray(f.enum_options) && f.enum_options.length) {
      line += `；可选值（必须从中选一个）：[${f.enum_options.join(' / ')}]`;
    }
    if (f.type === 'number') {
      const lo = f.min_value != null ? f.min_value : '不限';
      const hi = f.max_value != null ? f.max_value : '不限';
      line += `；范围 ${lo}~${hi}`;
      if (f.unit) line += `；单位 ${f.unit}（仅展示，写入纯数字）`;
    }
    if (f.type === 'list') line += '；返回字符串数组 ["..","..",..]，替换整个列表';
    if (f.type === 'datetime') line += '；返回 ISO 局部时间 "YYYY-MM-DDTHH:mm"';
    if (f.type === 'table' && Array.isArray(f.table_columns) && f.table_columns.length) {
      const colDesc = f.table_columns.map((c) => {
        const lo = c.min != null ? c.min : '不限';
        const hi = c.max != null ? c.max : '不限';
        return `${c.key}(${c.label ?? c.key},${lo}~${hi})`;
      }).join(' / ');
      line += `；返回 {列key:数值,...}，列：[${colDesc}]，仅数值`;
    }
    if (f.type === 'boolean') line += '；返回 true 或 false';
    if (f.update_instruction) line += `\n    更新说明：${f.update_instruction}`;
    return line;
  }).join('\n');

  const poolDesc = pool.length
    ? pool.map((p) => {
      const stateStr = p.state && Object.keys(p.state).length
        ? Object.entries(p.state).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(', ')
        : '（无）';
      return `- [id=${p.id}] ${p.name}（${p.is_saved ? '已保存' : '临时'}）｜记忆：${p.memory || '（无）'}｜上轮状态：{${stateStr}}`;
    }).join('\n')
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
    '  [{ "ref_id": "<池中id 或 null（新角色）>", "name": "...", "state": {...}, "memory": "新一句话总结" }, ...]',
    '池里有但本轮不在场的角色：不要输出。memory：覆盖式，一句话总结与{{user}}的交互历史。',
    '',
    '## 新登场角色（ref_id=null）—— state 必须填齐所有启用字段',
    `KEY 集合必须等于：[${fieldKeysCsv}]`,
    '取值优先级：① 正文有述 → 按事实写；② 上下文暗示 → 按暗示推理；③ 完全无线索 → 按角色身份/场景/世界观合理性创作。',
    '严禁：留空 / null / 空字符串 / "未知"/"待定"/"暂无"/"不详"/"无"/"N/A"。',
    '严禁：因正文未提到就跳过该字段。',
    '每个值必须符合该字段 type/range/enum 约束。',
    '',
    '## 池中已有角色（ref_id 命中）—— 稀疏 patch',
    'state 仅含本轮变化的字段；未变化字段不要重复输出。',
    '例外：上轮状态显示某字段缺失/为空时，按"新登场"规则补全。',
    '',
    '## 示例（启用字段假设为 [a, b, c]）',
    '✓ 新登场：{ "ref_id": null, "name": "...", "state": { "a": <a的合规值>, "b": <b的合规值>, "c": <c的合规值> }, "memory": "..." }',
    '✗ 新登场缺字段：{ "ref_id": null, "name": "...", "state": { "a": ... } }   ← 错：state 必须含 a/b/c 全部',
    '✓ 已有角色（仅 b 变化）：{ "ref_id": "<id>", "state": { "b": ... } }',
  ].join('\n');
}
