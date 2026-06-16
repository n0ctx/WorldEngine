import { normalizeProposal, applyProposal } from '../normalize-proposal.js';

export const definition = {
  name: 'apply_theme',
  description: '落库主题包变更（写到 /data/themes/<id>/theme.json + theme.css）。operation 取 create/update/delete；三种操作都必须显式给出 entityId（即主题 id）。参数结构详见 CONTRACT.md / THEME.md。',
  parameters: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['create', 'update', 'delete'] },
      entityId: { type: ['string', 'null'], description: '主题 id（三种操作都必填）' },
      changes: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          version: { type: 'string' },
          author: { type: 'string' },
          description: { type: 'string' },
          preview: { type: 'string', description: '预览图说明 / 路径' },
          css: { type: 'string', description: 'theme.css 内容（仅覆写 --we-* token）' },
        },
      },
      explanation: { type: 'string' },
    },
    required: ['operation'],
  },
};

export async function execute(args) {
  const proposal = {
    type: 'theme',
    operation: args.operation,
    entityId: args.entityId ?? null,
    changes: args.changes ?? {},
    explanation: args.explanation ?? '',
  };
  const normalized = normalizeProposal(proposal);
  const result = await applyProposal(normalized, null);
  return {
    success: true,
    type: 'theme',
    operation: args.operation,
    entityId: result?.id ?? args.entityId ?? null,
    summary: `${args.operation} 主题 ${args.entityId ?? args.changes?.name ?? ''}`,
  };
}
