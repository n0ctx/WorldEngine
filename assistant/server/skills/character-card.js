export const CHARACTER_CARD_SKILL = {
  name: 'character_card_skill',
  description:
    '创建、修改或删除角色卡（NPC/配角）。管理角色的 name/system_prompt/post_prompt/first_message，' +
    '以及角色 Prompt 条目（entryOps）和角色/玩家状态字段（stateFieldOps：character/persona）。' +
    '调用前必须先用 preview_card(target="character-card") 获取当前数据。',
  parameters: {
    type: 'object',
    properties: {
      task: { type: 'string', description: '详细描述需要对角色卡做哪些修改' },
      operation: {
        type: 'string',
        enum: ['create', 'update', 'delete'],
        description: '操作类型（默认 update）',
      },
      entityId: {
        type: 'string',
        description: 'update/delete 时为角色 ID；create 时为所属世界 ID（省略则用当前上下文世界）',
      },
    },
    required: ['task', 'operation'],
  },
  proposalType: 'character-card',
};
