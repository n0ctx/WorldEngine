// 写卡助手 meta 工具:dispatch_subagent 的 JSON schema
// 仅声明纯 schema,execute 闭包仍留在 parent-agent.js 内构造。
export const dispatchSubagentDefinition = {
  name: 'dispatch_subagent',
  description: '派发子代理执行计划文档中某未完成的 step；返回 { ok:true, summary } 或 { ok:false, error }。',
  parameters: {
    type: 'object',
    properties: { stepId: { type: 'string' } },
    required: ['stepId'],
  },
};
