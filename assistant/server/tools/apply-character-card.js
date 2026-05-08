// assistant/server/tools/apply-character-card.js
import { normalizeProposal, applyProposal } from '../normalize-proposal.js';

export const definition = {
  name: 'apply_character_card',
  description: '落库角色卡变更。operation 取 create/update/delete。create 时 entityId 为 worldId（依赖关系），update/delete 时为 characterId。',
  parameters: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['create', 'update', 'delete'] },
      entityId: { type: ['string', 'null'] },
      changes: { type: 'object' },
      stateValueOps: { type: 'array' },
      explanation: { type: 'string' },
    },
    required: ['operation'],
  },
};

export async function execute(args, ctx = {}) {
  const proposal = {
    type: 'character-card',
    operation: args.operation,
    entityId: args.entityId ?? null,
    changes: args.changes ?? {},
    stateValueOps: args.stateValueOps ?? [],
    explanation: args.explanation ?? '',
  };
  const normalized = normalizeProposal(proposal);
  const result = await applyProposal(normalized, ctx.worldRefId ?? null);
  return { success: true, type: 'character-card', operation: args.operation, entityId: result?.id ?? result?.entityId ?? args.entityId ?? null, summary: `${args.operation} 角色卡 ${args.changes?.name ?? args.entityId}` };
}
