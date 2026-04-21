export function buildProposalSummary(proposal) {
  const TYPE_SHORT = { 'world-card': '世界卡', 'character-card': '角色卡', 'persona-card': '玩家卡', 'global-config': '全局设置', 'css-snippet': '自定义CSS', 'regex-rule': '正则规则' };
  const OP_SHORT = { create: '新建', update: '修改', delete: '删除' };
  const lines = [`[${TYPE_SHORT[proposal.type] || proposal.type}${OP_SHORT[proposal.operation] || proposal.operation}]`];
  for (const [k, v] of Object.entries(proposal.changes || {})) {
    lines.push(`${k}: ${typeof v === 'string' ? v.slice(0, 120) : v}`);
  }
  const entryCount = Array.isArray(proposal.entryOps) ? proposal.entryOps.length : 0;
  const sfCount = Array.isArray(proposal.stateFieldOps) ? proposal.stateFieldOps.length : 0;
  if (entryCount) lines.push(`条目操作: ${entryCount}条`);
  if (sfCount) lines.push(`状态字段操作: ${sfCount}条`);
  return lines.join('\n');
}

export function buildHistory(msgs) {
  const history = [];
  let pendingProposals = [];
  for (const m of msgs) {
    if (m.role === 'user') {
      history.push({ role: 'user', content: m.content });
      pendingProposals = [];
    } else if (m.role === 'proposal' && m.proposal) {
      pendingProposals.push(buildProposalSummary(m.proposal));
    } else if (m.role === 'assistant' && m.content) {
      const prefix = pendingProposals.length > 0 ? pendingProposals.join('\n---\n') + '\n\n' : '';
      history.push({ role: 'assistant', content: prefix + m.content });
      pendingProposals = [];
    }
  }
  return history;
}
