// 写卡助手 meta 工具:edit_plan_doc 的 JSON schema
// 仅声明纯 schema,execute 闭包仍留在 parent-agent.js 内构造。
export const editPlanDocDefinition = {
  name: 'edit_plan_doc',
  description:
    '修改计划文档。op=mark_done 勾选某 step 已完成；op=append_log 追加执行日志行；' +
    'op=replace_steps 替换未完成步骤（已完成步骤始终保留，无法通过此操作覆盖）。',
  parameters: {
    type: 'object',
    properties: {
      op: { type: 'string', enum: ['mark_done', 'append_log', 'replace_steps'] },
      stepId: { type: 'string', description: 'mark_done 时必填' },
      line: { type: 'string', description: 'append_log 时必填' },
      steps: {
        type: 'array',
        description: 'replace_steps 时必填，结构同 write_plan_doc 的 steps',
        items: { type: 'object' },
      },
    },
    required: ['op'],
  },
};
