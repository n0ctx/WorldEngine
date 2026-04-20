export const WORLD_CARD_AGENT = {
  name: 'world_card_agent',
  description:
    '创建、修改或删除世界卡。管理世界的 name/system_prompt/post_prompt/temperature/max_tokens，' +
    '以及世界 Prompt 条目（entryOps）和三层状态字段（stateFieldOps：world/persona/character）。' +
    'update/delete 前必须先调用 preview_card(target="world-card") 获取现有数据，再调用此代理。',
  parameters: {
    type: 'object',
    properties: {
      task: { type: 'string', description: '主代理预研后整理的任务说明，包含用户需求、当前数据摘要和具体修改指令' },
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
