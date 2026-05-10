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
    let line = `  - ${f.field_key}（${f.label}，类型：${f.type}）`;
    if (f.description) line += `；${f.description}`;
    return line;
  }).join('\n');

  // few-shot 示例：用前两个启用字段构造一个具体填充例子
  const exampleFields = fieldKeys.slice(0, Math.min(3, fieldKeys.length));
  const exampleFilled = exampleFields.length
    ? exampleFields.map((k, i) => `"${k}": "${['专注', '柜台后方', '正在核对今日账目'][i] ?? '...'}"`).join(', ')
    : '';
  const exampleMissing = exampleFields.length >= 2
    ? `"${exampleFields[0]}": "专注"`
    : '';

  const newCharRule = [
    '【关键约束 ‖ 新登场角色 state 字段必须 100% 填齐】',
    `每个新登场角色（ref_id=null）的 state 对象 KEY 必须等于以下全部启用字段的并集：[${fieldKeysCsv}]`,
    '对每个字段按以下顺序决定值：',
    '  1. 正文有明确描述 → 按事实写',
    '  2. 正文无明确描述但角色姓名/记忆/上下文有暗示 → 按暗示推理写',
    '  3. 完全无线索 → 基于角色身份、场景、世界观做合理性创作（例：贼眉鼠眼的小偷"心情"默认"警惕"，市集摊主"位置"默认"摊位前"，不是"未知"）',
    '严禁：留空字段 / 写 null / 写空字符串 / 写 "未知" / "待定" / "暂无" / "不详" / "无" / "N/A" 等占位词。',
    '严禁：因为正文没提到就跳过某字段——你必须主动创作一个合理值。',
    '',
    '【已有角色更新规则 ‖ 稀疏 patch】',
    '若 ref_id 命中池中已有角色：state 仅包含本轮发生变化的字段；未变化字段不要重复输出。',
    '例外：池中行某字段"上轮状态"显示该字段缺失/为空时，本轮必须用上述新登场规则补全该字段。',
  ].join('\n');

  const example = exampleFields.length >= 2
    ? [
      '【示例 ‖ 启用字段为 ' + fieldKeysCsv + '】',
      '✓ 正确（新登场，全部填齐）：',
      `   { "ref_id": null, "name": "刘掌柜", "state": { ${exampleFilled} }, "memory": "..." }`,
      '✗ 错误（缺字段）：',
      `   { "ref_id": null, "name": "刘掌柜", "state": { ${exampleMissing} }, "memory": "..." }`,
      '   原因：state 必须包含所有启用字段；正文未提到的字段也要创作。',
    ].join('\n')
    : '';

  if (!pool.length) {
    return [
      '当前已知的登场角色池：（空）',
      '',
      '登场角色启用字段（仅这些字段可写入 nearby_characters[i].state）：',
      fieldsDesc,
      '',
      newCharRule,
      ...(example ? ['', example] : []),
      '',
      '任务（关于"附近 / 登场角色"）：',
      '1. 阅读本轮 user 与 assistant 文本，识别本轮以「名字、对话或动作主体形式登场的角色」（仅被旁人或路人提及不算）',
      '2. 对识别到的每个角色，按上述规则输出到 nearby_characters 数组：{ "ref_id": null, "name": "...", "state": { ... }, "memory": "新一句话总结" }',
      '3. 不在场角色不要输出',
      '4. memory 一句话总结角色与{{user}}的交互历史',
      '5. 字段类型/范围约束与主 state 协议一致；不要输出未启用字段',
    ].join('\n');
  }

  const poolDesc = pool.map((p) => {
    const stateStr = p.state && Object.keys(p.state).length
      ? Object.entries(p.state).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(', ')
      : '（无）';
    return `- [id=${p.id}] ${p.name}（${p.is_saved ? '已保存' : '临时'}）｜记忆：${p.memory || '（无）'}｜上轮状态：{${stateStr}}`;
  }).join('\n');

  return [
    '当前已知的登场角色池（继承自上轮 transient 与已保存的 saved）：',
    poolDesc,
    '',
    '登场角色启用字段（仅这些字段可写入 nearby_characters[i].state）：',
    fieldsDesc,
    '',
    newCharRule,
    ...(example ? ['', example] : []),
    '',
    '任务（关于"附近 / 登场角色"）：',
    '1. 阅读本轮 user 与 assistant 文本，识别本轮以「名字、对话或动作主体形式登场的角色」（仅被旁人或路人提及不算）',
    '2. 对识别到的每个角色，按上述规则输出到 nearby_characters 数组：{ "ref_id": "<池里的id；新角色为null>", "name": "...", "state": { ... }, "memory": "..." }',
    '3. 池里有但本轮不在场的角色不要输出',
    '4. memory 一句话总结角色与{{user}}的交互历史，覆盖式更新',
    '5. 字段类型/范围约束与主 state 协议一致；不要输出未启用字段',
  ].join('\n');
}
