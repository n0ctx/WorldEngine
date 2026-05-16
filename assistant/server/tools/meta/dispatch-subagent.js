// 写卡助手 meta 工具:dispatch_subagent 的 JSON schema
// 仅声明纯 schema,execute 闭包仍留在 parent-agent.js 内构造。
export const dispatchSubagentDefinition = {
  name: 'dispatch_subagent',
  description:
    '派发子代理执行一个任务；可引用计划文档 stepId，也可直接提供 targetType / operation / task。'
    + 'operation 必须显式给出，不允许省略：create=从零新建一张卡（不要传入当前上下文的 entityRef，否则会被误判为 update）；'
    + 'update=改动指定 entityRef 的现有卡；delete=删除指定 entityRef 的现有卡。'
    + '若用户表述里出现"新建/新增/创建/生成/做一张"等意图，必须用 create；不要因为当前上下文已有 worldId 就退化成 update 覆盖现卡。'
    + '返回 { success:true, summary } 或 { success:false, error }。',
  parameters: {
    type: 'object',
    properties: {
      stepId: { type: 'string' },
      targetType: { type: 'string' },
      operation: {
        type: 'string',
        enum: ['create', 'update', 'delete'],
        description: '必填：create / update / delete。禁止留空，禁止以 update 作为默认值；不确定时优先 reply_to_user 向用户澄清。',
      },
      entityRef: {
        type: ['string', 'null'],
        description: 'update / delete 必须指向已有资源 ID；create 必须留空（null），不要把当前上下文的 worldId / characterId 当成新建目标。',
      },
      task: { type: 'string' },
      force: {
        type: 'boolean',
        description: '仅当用户明确要求同一轮再创建另一张同类型资源时使用；不要用它绕过计划要求。',
      },
    },
  },
};
