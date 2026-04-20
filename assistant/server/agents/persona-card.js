export const PERSONA_CARD_AGENT = {
  name: 'persona_card_agent',
  description:
    '修改当前世界的玩家卡（玩家/主角/用户代入身份）。管理玩家的 name/system_prompt 和玩家状态字段（stateFieldOps：persona）。' +
    '玩家卡只支持 update（upsert）。必须先调用 preview_card(target="persona-card") 获取现有数据，再调用此代理。',
  parameters: {
    type: 'object',
    properties: {
      task: { type: 'string', description: '主代理预研后整理的任务说明，包含用户需求、当前数据摘要和具体修改指令' },
      operation: {
        type: 'string',
        enum: ['update'],
        description: '固定为 update（玩家卡只支持 upsert）',
      },
      entityId: {
        type: 'string',
        description: '所属世界 ID（必填，从上下文 worldId 获取）',
      },
    },
    required: ['task', 'operation', 'entityId'],
  },
  proposalType: 'persona-card',
};
