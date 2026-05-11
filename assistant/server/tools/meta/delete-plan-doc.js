// 写卡助手 meta 工具:delete_plan_doc 的 JSON schema
// 仅声明纯 schema,execute 闭包仍留在 parent-agent.js 内构造。
export const deletePlanDocDefinition = {
  name: 'delete_plan_doc',
  description: '删除计划文档（终态前调用）。',
  parameters: { type: 'object', properties: {} },
};
