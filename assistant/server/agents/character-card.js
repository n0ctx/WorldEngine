export const CHARACTER_CARD_AGENT = {
  name: 'character_card_agent',
  description:
    '创建、修改或删除 {{char}} 卡。管理角色的 name/description/system_prompt/post_prompt/first_message。' +
    '写入卡片正文、开场白、后置提示词或任务文本时，代入者统一写 {{user}}，模型扮演/回应的角色统一写 {{char}}。' +
    'update/delete 前必须先调用 preview_card(target="character-card") 获取现有数据；' +
    '角色卡不负责创建、修改或删除状态字段，字段管理只能通过 world-card 完成；' +
    '但可以通过 stateValueOps 填写当前世界已存在的角色状态字段值。',
  parameters: {
    type: 'object',
    properties: {
      task: { type: 'string', description: '主代理预研后整理的任务说明，包含原始需求、当前数据摘要和具体修改指令' },
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
