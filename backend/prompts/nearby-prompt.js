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
  if (!pool.length) {
    return [
      '当前已知的登场角色池：（空）',
      '',
      '任务（关于"附近 / 登场角色"）：',
      '1. 阅读本轮 user 与 assistant 文本，识别本轮以「名字、对话或动作主体形式登场的角色」（仅被旁人或路人提及不算）',
      '2. 对识别到的每个角色，输出到 nearby_characters 数组：',
      '   { "ref_id": null, "name": "...", "state": { ... }, "memory": "新一句话总结" }',
      '3. 不在场角色不要输出',
    ].join('\n');
  }

  const fieldsDesc = fields.map((f) => {
    let line = `  - ${f.field_key}（${f.label}，类型：${f.type}）`;
    if (f.description) line += `；${f.description}`;
    return line;
  }).join('\n');

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
    '任务（关于"附近 / 登场角色"）：',
    '1. 阅读本轮 user 与 assistant 文本，识别本轮以「名字、对话或动作主体形式登场的角色」（仅被旁人或路人提及不算）',
    '2. 对识别到的每个角色，输出到 nearby_characters 数组：',
    '   { "ref_id": "<池里的id；新角色为null>", "name": "...", "state": { 字段key: 值, ... }, "memory": "新的一句话总结" }',
    '3. 池里有但本轮不在场的角色不要输出',
    '4. memory 一句话总结角色与{{user}}的交互历史，覆盖式更新',
    '5. 字段类型/范围约束与主 state 协议一致；不要输出未启用字段',
  ].join('\n');
}
