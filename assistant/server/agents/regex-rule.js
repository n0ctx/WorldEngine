export const REGEX_RULE_AGENT = {
  name: 'regex_rule_agent',
  description:
    '管理正则替换规则（创建/修改/删除），用于文本替换、HTML 包裹、Markdown 清洗、AI 输出格式化、prompt 模板占位符替换等。' +
    'update/delete 前必须先调用 preview_card(target="regex-rule") 获取现有规则列表和 ID。' +
    '不负责视觉样式（那是 css_snippet_agent 的职责）。',
  parameters: {
    type: 'object',
    properties: {
      task: { type: 'string', description: '描述需要实现的文本替换或格式化规则，或说明要修改/删除哪条规则' },
      operation: {
        type: 'string',
        enum: ['create', 'update', 'delete'],
        description: 'create 新建规则；update 修改现有规则；delete 删除现有规则',
      },
      entityId: {
        type: 'string',
        description: '规则 ID（update/delete 时必填，从 preview_card 返回的 existingRules 中获取）',
      },
    },
    required: ['task', 'operation'],
  },
  proposalType: 'regex-rule',
};
