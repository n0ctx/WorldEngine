// assistant/server/tools/apply-character-card.js
import { normalizeProposal, applyProposal } from '../normalize-proposal.js';
import { stateValueOpsSchema } from './apply-schemas.js';
import { runApply } from './_apply-factory.js';

export const definition = {
  name: 'apply_character_card',
  description: '落库角色卡变更。角色卡禁止 stateFieldOps（新增/改/删状态字段定义必须走 world-card）；本工具只写字段「值」stateValueOps。operation 取 create/update/delete；create 时 entityId 为目标 worldId，update/delete 时为 characterId。参数结构详见 CONTRACT.md / CHARCARD.md。',
  parameters: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['create', 'update', 'delete'] },
      entityId: { type: ['string', 'null'], description: 'create=目标 worldId；update/delete=characterId' },
      changes: {
        type: 'object',
        description: 'create 时可额外包含 world_id 指定目标世界（优先于 entityId）',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          system_prompt: { type: 'string' },
          post_prompt: { type: 'string' },
          first_message: { type: 'string' },
          world_id: { type: 'string', description: 'create 时可选：目标世界 ID' },
        },
      },
      stateValueOps: stateValueOpsSchema(['character']),
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
  return runApply(
    () => normalizeProposal(proposal),
    (normalized) => applyProposal(normalized, ctx.worldRefId ?? null),
    (result) => ({
      success: true,
      type: 'character-card',
      operation: args.operation,
      id: result?.id ?? null,
      entityId: args.entityId ?? null,
      summary: `${args.operation} 角色卡 ${args.changes?.name ?? args.entityId}`,
    }),
  );
}
