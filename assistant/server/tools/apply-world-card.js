// assistant/server/tools/apply-world-card.js
import { normalizeProposal, applyProposal } from '../normalize-proposal.js';
import { entryOpsSchema, stateFieldOpsSchema } from './apply-schemas.js';
import { runApply } from './_apply-factory.js';

export const definition = {
  name: 'apply_world_card',
  description: '落库一个世界卡变更。operation 取 create/update/delete；create 不传 entityId，update/delete 必传 entityId（worldId）。参数结构详见 CONTRACT.md / WORLDCARD.md。',
  parameters: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['create', 'update', 'delete'] },
      entityId: { type: ['string', 'null'], description: 'update/delete 必填：目标 worldId；create 留空' },
      changes: {
        type: 'object',
        description: '世界卡基础字段',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          temperature: { type: 'number' },
          max_tokens: { type: 'number' },
        },
      },
      entryOps: entryOpsSchema,
      stateFieldOps: stateFieldOpsSchema,
      explanation: { type: 'string' },
    },
    required: ['operation'],
  },
};

export async function execute(args, ctx = {}) {
  const proposal = {
    type: 'world-card',
    operation: args.operation,
    entityId: args.entityId ?? null,
    changes: args.changes ?? {},
    entryOps: args.entryOps ?? [],
    stateFieldOps: args.stateFieldOps ?? [],
    explanation: args.explanation ?? '',
  };
  return runApply(
    () => normalizeProposal(proposal),
    (normalized) => applyProposal(normalized, ctx.worldRefId ?? null),
    (result) => ({
      success: true,
      type: 'world-card',
      operation: args.operation,
      entityId: result?.id ?? result?.entityId ?? args.entityId ?? null,
      summary: summarize(args),
    }),
  );
}

function summarize(args) {
  const parts = [];
  if (args.operation === 'create') parts.push(`创建世界卡 ${args.changes?.name ?? ''}`);
  if (args.operation === 'update') parts.push(`更新世界卡 ${args.entityId}`);
  if (args.operation === 'delete') parts.push(`删除世界卡 ${args.entityId}`);
  if (args.entryOps?.length) parts.push(`${args.entryOps.length} 条 entryOps`);
  if (args.stateFieldOps?.length) parts.push(`${args.stateFieldOps.length} 条 stateFieldOps`);
  return parts.join('，');
}
