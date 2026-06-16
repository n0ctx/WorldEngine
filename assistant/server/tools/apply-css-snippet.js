import { normalizeProposal, applyProposal } from '../normalize-proposal.js';

export const definition = {
  name: 'apply_css_snippet',
  description: '落库 CSS 片段变更。operation 取 create/update/delete；update/delete 必传 entityId。参数结构详见 CONTRACT.md / CSSSNIPPET.md。',
  parameters: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['create', 'update', 'delete'] },
      entityId: { type: ['string', 'null'], description: 'update/delete 必填' },
      changes: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          content: { type: 'string', description: 'CSS 文本' },
          mode: { description: "chat / writing，默认 chat（非法值回退 chat）" },
          enabled: { type: 'boolean' },
        },
      },
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
  return { success: true, type: 'css-snippet', operation: args.operation, entityId: result?.id ?? result?.entityId ?? args.entityId ?? null, summary: `${args.operation} CSS 片段 ${args.changes?.name ?? args.entityId ?? ''}` };
}
