import { normalizeProposal, applyProposal } from '../normalize-proposal.js';

export const definition = {
  name: 'apply_regex_rule',
  description: '落库正则规则变更。operation 取 create/update/delete；update/delete 必传 entityId。',
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
    type: 'regex-rule',
    operation: args.operation,
    entityId: args.entityId ?? null,
    changes: args.changes ?? {},
    explanation: args.explanation ?? '',
  };
  const normalized = normalizeProposal(proposal);
  const result = await applyProposal(normalized, null);
  return { success: true, type: 'regex-rule', operation: args.operation, entityId: result?.id ?? result?.entityId ?? args.entityId ?? null, summary: `${args.operation} 正则规则 ${args.changes?.name ?? args.entityId ?? ''}` };
}
