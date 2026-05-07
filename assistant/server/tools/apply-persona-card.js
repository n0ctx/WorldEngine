import { normalizeProposal, applyProposal } from '../normalize-proposal.js';

export const definition = {
  name: 'apply_persona_card',
  description: '落库玩家卡（persona）变更。operation 仅支持 create/update。entityId 为 worldId。',
  parameters: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['create', 'update'] },
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
    type: 'persona-card',
    operation: args.operation,
    entityId: args.entityId ?? null,
    changes: args.changes ?? {},
    stateValueOps: args.stateValueOps ?? [],
    explanation: args.explanation ?? '',
  };
  const normalized = normalizeProposal(proposal);
  const result = await applyProposal(normalized, ctx.worldRefId ?? null);
  return { success: true, type: 'persona-card', operation: args.operation, entityId: result.entityId ?? null, summary: `${args.operation} 玩家卡 ${args.changes?.name ?? args.entityId ?? ''}` };
}
