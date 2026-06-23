// 写卡助手 meta 工具:write_plan_doc 的 JSON schema
// 仅声明纯 schema,execute 闭包仍留在 parent-agent.js 内构造。
export const writePlanDocDefinition = {
  name: 'write_plan_doc',
  description:
    'plan mode 首次落计划文档；仅适用于至少 2 个有真实依赖的可执行步骤的任务。状态自动转 awaiting_approval，UI 会显示审批按钮，无需再 reply_to_user 提示用户操作。' +
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
      minItems: 2,
      description: '步骤数组，至少 2 项；每项含 id?, title, targetType, operation, dependsOn, task。只保留真实依赖，不为了凑数拆同义步骤。',
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
