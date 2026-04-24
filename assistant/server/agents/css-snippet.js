export const CSS_SNIPPET_AGENT = {
  name: 'css_snippet_agent',
  description:
    '管理自定义 CSS 片段（创建/修改/删除），用于主题覆盖、气泡样式、消息排版、thinking-block 美化、动效等视觉改造。' +
    'update/delete 前必须先调用 preview_card(target="css-snippet") 获取现有片段列表和 ID。' +
    '不负责文本替换或正则规则（那是 regex_rule_agent 的职责）。',
  parameters: {
    type: 'object',
    properties: {
      task: { type: 'string', description: '描述需要实现的视觉效果或样式需求，或说明要修改/删除哪个片段' },
      operation: {
        type: 'string',
        enum: ['create', 'update', 'delete'],
        description: 'create 新建片段；update 修改现有片段；delete 删除现有片段',
      },
      entityId: {
        type: 'string',
        description: '片段 ID（update/delete 时必填，从 preview_card 返回的 existingSnippets 中获取）',
      },
    },
    required: ['task', 'operation'],
  },
  proposalType: 'css-snippet',
};
