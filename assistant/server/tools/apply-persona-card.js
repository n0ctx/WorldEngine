import { normalizeProposal, applyProposal } from '../normalize-proposal.js';
import { stateValueOpsSchema } from './apply-schemas.js';
import { runApply } from './_apply-factory.js';

export const definition = {
  name: 'apply_persona_card',
  description:
    '落库玩家卡（persona）变更。玩家卡禁止 stateFieldOps（新增/改/删状态字段定义必须走 world-card）；本工具只写字段「值」stateValueOps。operation 仅支持 create/update。' +
    'create 时 entityId 为目标 worldId；update 可额外传 personaId 定位特定玩家卡。' +
    '参数结构详见 CONTRACT.md / USERCARD.md。',
  parameters: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['create', 'update'] },
      entityId: { type: ['string', 'null'], description: '所属世界 ID' },
      personaId: { type: ['string', 'null'], description: 'update 时可选：直接指定玩家卡 ID；省略则修改激活玩家卡' },
      changes: {
        type: 'object',
        description: 'create 时可额外包含 world_id 指定目标世界（优先于 entityId）',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          system_prompt: { type: 'string' },
          world_id: { type: 'string', description: 'create 时可选：目标世界 ID（玩家卡不支持 post_prompt/first_message）' },
        },
      },
      stateValueOps: stateValueOpsSchema(['persona']),
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
  // persona-card 的 entityId 始终是 worldId（create/update 都依赖 worldId 定位 persona），
  // 不能用 result.id（新 persona 的主键）覆盖，否则后续链式 update 会拿 personaId 当 worldId 查表。
  return runApply(
    () => normalizeProposal(proposal),
    (normalized) => applyProposal(normalized, ctx.worldRefId ?? null),
    (result) => ({ success: true, type: 'persona-card', operation: args.operation, entityId: args.entityId ?? null, personaId: result?.id ?? null, summary: `${args.operation} 玩家卡 ${args.changes?.name ?? args.entityId ?? ''}` }),
  );
}
