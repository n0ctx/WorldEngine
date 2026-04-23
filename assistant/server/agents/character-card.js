export const CHARACTER_CARD_AGENT = {
  name: 'character_card_agent',
  description:
    '创建、修改或删除角色卡（NPC/配角）。管理角色的 name/system_prompt/post_prompt/first_message，' +
    '以及角色/玩家状态字段（stateFieldOps：character/persona）。' +
    'update/delete 前必须先调用 preview_card(target="character-card") 获取现有数据，再调用此代理。',
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
        description: 'update/delete 时为角色 ID；create 时为所属世界 ID（必填，从上下文 worldId 获取）',
      },
    },
    required: ['task', 'operation', 'entityId'],
  },
  proposalType: 'character-card',
};
