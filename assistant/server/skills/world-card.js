export const WORLD_CARD_SKILL = {
  name: 'world_card_skill',
  description:
    '创建、修改或删除世界卡。管理世界的 name/system_prompt/post_prompt/temperature/max_tokens，' +
    '以及世界 Prompt 条目（entryOps）和三层状态字段（stateFieldOps：world/persona/character）。' +
    '调用前必须先用 preview_card(target="world-card") 获取当前数据。',
  parameters: {
    type: 'object',
    properties: {
      task: { type: 'string', description: '详细描述需要对世界卡做哪些修改' },
      operation: {
        type: 'string',
        enum: ['create', 'update', 'delete'],
        description: '操作类型（默认 update）',
      },
      entityId: {
        type: 'string',
        description: '世界 ID（update/delete 时必填；create 时省略）',
      },
    },
    required: ['task', 'operation'],
  },
  proposalType: 'world-card',
};
