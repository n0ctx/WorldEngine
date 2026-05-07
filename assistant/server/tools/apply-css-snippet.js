import { normalizeProposal, applyProposal } from '../normalize-proposal.js';

export const definition = {
  name: 'apply_css_snippet',
  description: '落库 CSS 片段变更。operation 取 create/update/delete；update/delete 必传 entityId。',
  parameters: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['create', 'update', 'delete'] },
      entityId: { type: ['string', 'null'] },
      changes: { type: 'object' },
      explanation: { type: 'string' },
    },
    required: ['operation'],
  },
};

export async function execute(args) {
  const proposal = {
    type: 'css-snippet',
    operation: args.operation,
    entityId: args.entityId ?? null,
    changes: args.changes ?? {},
    explanation: args.explanation ?? '',
  };
  const normalized = normalizeProposal(proposal);
  const result = await applyProposal(normalized, null);
  return { success: true, type: 'css-snippet', operation: args.operation, entityId: result.entityId ?? null, summary: `${args.operation} CSS 片段 ${args.changes?.name ?? args.entityId ?? ''}` };
}
