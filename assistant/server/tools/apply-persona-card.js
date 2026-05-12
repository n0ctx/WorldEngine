import { normalizeProposal, applyProposal } from '../normalize-proposal.js';

export const definition = {
  name: 'apply_persona_card',
  description:
    '落库玩家卡（persona）变更。operation 仅支持 create/update。' +
    'create 时 entityId 为目标 worldId（可跨世界，不限于当前世界；也可在 changes.world_id 中指定）。' +
    'update 时可额外传 personaId 直接定位特定玩家卡；省略则修改当前激活玩家卡。',
  parameters: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['create', 'update'] },
      entityId: { type: ['string', 'null'], description: '所属世界 ID' },
      personaId: { type: ['string', 'null'], description: 'update 时可选：直接指定玩家卡 ID；省略则修改激活玩家卡' },
      changes: { type: 'object', description: 'create 时可额外包含 world_id 指定目标世界（优先于 entityId）' },
      stateValueOps: { type: 'array' },
      explanation: { type: 'string' },
    },
    required: ['operation'],
  },
};

export async function execute(args, ctx = {}) {
  const proposal = {
    type: 'persona-card',
    operation: args.operation,
    entityId: args.entityId ?? null,
    personaId: args.personaId ?? null,
    changes: args.changes ?? {},
    stateValueOps: args.stateValueOps ?? [],
    explanation: args.explanation ?? '',
  };
  const normalized = normalizeProposal(proposal);
  const result = await applyProposal(normalized, ctx.worldRefId ?? null);
  // persona-card 的 entityId 始终是 worldId（create/update 都依赖 worldId 定位 persona），
  // 不能用 result.id（新 persona 的主键）覆盖，否则后续链式 update 会拿 personaId 当 worldId 查表。
  return { success: true, type: 'persona-card', operation: args.operation, entityId: args.entityId ?? null, personaId: result?.id ?? null, summary: `${args.operation} 玩家卡 ${args.changes?.name ?? args.entityId ?? ''}` };
}
