// 写卡助手 meta 工具:finalize_task 的 JSON schema
// 仅声明纯 schema,execute 闭包仍留在 parent-agent.js 内构造。
export const finalizeTaskDefinition = {
  name: 'finalize_task',
  description: '发送总结消息并把任务设为终态。terminalStatus ∈ {completed, failed, cancelled}。',
  parameters: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      terminalStatus: { type: 'string', enum: ['completed', 'failed', 'cancelled'] },
    },
    required: ['summary', 'terminalStatus'],
  },
};
