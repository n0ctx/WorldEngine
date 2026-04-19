export const PERSONA_CARD_SKILL = {
  name: 'persona_card_skill',
  description:
    '修改当前世界的玩家卡（玩家/主角/用户代入身份）。管理玩家的 name/system_prompt 和玩家状态字段（stateFieldOps：persona）。' +
    '玩家卡只支持 update（upsert）。调用前必须先用 preview_card(target="persona-card") 获取当前数据。',
  parameters: {
    type: 'object',
    properties: {
      task: { type: 'string', description: '详细描述需要对玩家卡做哪些修改' },
      operation: {
        type: 'string',
        enum: ['update'],
        description: '固定为 update（玩家卡只支持 upsert）',
      },
      entityId: {
        type: 'string',
        description: '所属世界 ID（省略则用当前上下文世界）',
      },
    },
    required: ['task', 'operation'],
  },
  proposalType: 'persona-card',
};
