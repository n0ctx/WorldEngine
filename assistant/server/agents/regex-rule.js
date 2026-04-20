export const REGEX_RULE_AGENT = {
  name: 'regex_rule_agent',
  description:
    '生成正则替换规则，用于文本替换、HTML 包裹、Markdown 清洗、AI 输出格式化、prompt 模板占位符替换等。' +
    '不负责视觉样式（那是 css_snippet_agent 的职责）。',
  parameters: {
    type: 'object',
    properties: {
      task: { type: 'string', description: '描述需要实现的文本替换或格式化规则' },
      operation: {
        type: 'string',
        enum: ['create'],
        description: '固定为 create',
      },
    },
    required: ['task', 'operation'],
  },
  proposalType: 'regex-rule',
};
