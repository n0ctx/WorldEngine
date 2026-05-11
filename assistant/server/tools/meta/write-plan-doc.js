// 写卡助手 meta 工具:write_plan_doc 的 JSON schema
// 仅声明纯 schema,execute 闭包仍留在 parent-agent.js 内构造。
export const writePlanDocDefinition = {
  name: 'write_plan_doc',
  description:
    'plan mode 首次落计划文档；状态自动转 awaiting_approval，等待用户 /approve。' +
    'steps[].id 可省略（自动生成 step-N）。',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '任务标题（短）' },
      intent: { type: 'string', description: '对用户需求的复述，1-3 句' },
      assumptions: {
        type: 'array',
        items: { type: 'string' },
        description: '来自 preview_card / read_file 的事实假设',
      },
      steps: {
        type: 'array',
        description: '步骤数组，每项含 id?, title, targetType, operation, dependsOn, task',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            targetType: {
              type: 'string',
              enum: ['world-card', 'character-card', 'persona-card', 'global-config', 'css-snippet', 'regex-rule'],
            },
            operation: { type: 'string', enum: ['create', 'update', 'delete'] },
            dependsOn: { type: 'array', items: { type: 'string' } },
            task: { type: 'string' },
          },
          required: ['title', 'targetType', 'operation', 'task'],
        },
      },
    },
    required: ['title', 'intent', 'steps'],
  },
};
