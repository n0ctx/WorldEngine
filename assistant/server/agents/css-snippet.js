export const CSS_SNIPPET_AGENT = {
  name: 'css_snippet_agent',
  description:
    '生成自定义 CSS 片段，用于主题覆盖、气泡样式、消息排版、thinking-block 美化、动效等视觉改造。' +
    '不负责文本替换或正则规则（那是 regex_rule_agent 的职责）。',
  parameters: {
    type: 'object',
    properties: {
      task: { type: 'string', description: '描述需要实现的视觉效果或样式需求' },
      operation: {
        type: 'string',
        enum: ['create'],
        description: '固定为 create',
      },
    },
    required: ['task', 'operation'],
  },
  proposalType: 'css-snippet',
};
