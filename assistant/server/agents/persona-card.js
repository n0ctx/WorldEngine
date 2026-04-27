export const PERSONA_CARD_AGENT = {
  name: 'persona_card_agent',
  description:
    '管理当前世界的 {{user}} 卡（代入者身份）。支持 create（新增 {{user}} 身份）和 update（修改激活 {{user}}）。' +
    '管理 {{user}} 的 name/description/system_prompt。' +
    '写入卡片正文、状态值说明或任务文本时，代入者统一写 {{user}}，模型扮演/回应的角色统一写 {{char}}。' +
    'update 时必须先调用 preview_card(target="persona-card") 获取现有数据；' +
    '{{user}} 卡不负责创建、修改或删除状态字段，字段管理只能通过 world-card 完成；' +
    '但可以通过 stateValueOps 填写当前世界已存在的 {{user}} 状态字段值。',
  parameters: {
    type: 'object',
    properties: {
      task: { type: 'string', description: '主代理预研后整理的任务说明，包含原始需求、当前数据摘要和具体修改指令' },
      operation: {
        type: 'string',
        enum: ['create', 'update'],
        description: 'create 新建 {{user}} 身份；update 修改当前激活 {{user}}',
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
