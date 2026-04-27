export const WORLD_CARD_AGENT = {
  name: 'world_card_agent',
  description:
    '创建、修改或删除世界卡。管理世界的 name/temperature/max_tokens，' +
    '以及世界 Prompt 条目（entryOps，包含 always 常驻条目和触发条目）和三层状态字段（stateFieldOps：world/persona/character）。' +
    '写入卡片正文、条目内容、状态字段说明或任务文本时，代入者统一写 {{user}}，模型扮演/回应的角色统一写 {{char}}。' +
    '世界内容（背景、后置提醒）通过 entryOps 的常驻条目管理，不使用 changes.system_prompt。' +
    'update/delete 前必须先调用 preview_card(target="world-card") 获取现有数据，再调用此代理。',
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
        description: '世界 ID（update/delete 时必填；create 时省略）',
      },
    },
    required: ['task', 'operation'],
  },
  proposalType: 'world-card',
};
