export const PERSONA_CARD_AGENT = {
  name: 'persona_card_agent',
  description:
    '管理当前世界的玩家卡（玩家/主角/用户代入身份）。支持 create（新增玩家身份）和 update（修改激活玩家）。' +
    '管理玩家的 name/description/system_prompt 和玩家状态字段（stateFieldOps：persona）。' +
    'update 时必须先调用 preview_card(target="persona-card") 获取现有数据；create 不需要预研。',
  parameters: {
    type: 'object',
    properties: {
      task: { type: 'string', description: '主代理预研后整理的任务说明，包含用户需求、当前数据摘要和具体修改指令' },
      operation: {
        type: 'string',
        enum: ['create', 'update'],
        description: 'create 新建玩家身份；update 修改当前激活玩家',
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
