// 写卡助手 meta 工具:dispatch_subagent 的 JSON schema
// 仅声明纯 schema,execute 闭包仍留在 parent-agent.js 内构造。
export const dispatchSubagentDefinition = {
  name: 'dispatch_subagent',
  description: '派发子代理执行一个任务；可引用计划文档 stepId，也可直接提供 targetType / operation / task。返回 { ok:true, summary } 或 { ok:false, error }。',
  parameters: {
    type: 'object',
    properties: {
      stepId: { type: 'string' },
      targetType: { type: 'string' },
      operation: { type: 'string', enum: ['create', 'update', 'delete'] },
      entityRef: { type: ['string', 'null'] },
      task: { type: 'string' },
      force: {
        type: 'boolean',
        description: '仅当用户明确要求同一轮再创建另一张同类型资源时使用；不要用它绕过计划要求。',
      },
    },
  },
};
