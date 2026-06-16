import { normalizeProposal, applyProposal } from '../normalize-proposal.js';

export const definition = {
  name: 'apply_regex_rule',
  description: '落库正则规则变更。operation 取 create/update/delete；update/delete 必传 entityId。参数结构详见 CONTRACT.md / REGEXRULE.md。',
  parameters: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['create', 'update', 'delete'] },
      entityId: { type: ['string', 'null'], description: 'update/delete 必填' },
      changes: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          pattern: { type: 'string', description: '正则表达式（不含两端斜杠）' },
          replacement: { type: 'string' },
          flags: { type: 'string', description: '正则 flags（如 g / gi）' },
          scope: { description: "user_input / ai_output / display_only / prompt_only，默认 display_only（非法值回退）" },
          world_id: { type: ['string', 'null'], description: '留空=全局规则' },
          mode: { description: 'chat / writing，默认 chat' },
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
