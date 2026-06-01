// 写卡助手 meta 工具:dispatch_subagent 的 JSON schema
// 仅声明纯 schema,execute 闭包仍留在 parent-agent.js 内构造。
export const dispatchSubagentDefinition = {
  name: 'dispatch_subagent',
  description:
    '派发子代理执行一个任务；可引用计划文档 stepId，也可直接提供 targetType / operation / task。'
    + 'operation 必须显式给出，不允许省略：create=从零新建一张卡（不要传入当前上下文的 entityRef，否则会被误判为 update）；'
    + 'update=改动指定 entityRef 的现有卡；delete=删除指定 entityRef 的现有卡。'
    + '若用户表述里出现"新建/新增/创建/生成/做一张"等意图，必须用 create；不要因为当前上下文已有 worldId 就退化成 update 覆盖现卡。'
    + '若本步骤是 persona-card / character-card 的状态值写入，优先使用 stateValues 入参，由工具层解析 field_key/type/value_json，不要自己在 task 里拼这些格式。'
    + '返回 { success:true, summary } 或 { success:false, error }。',
  parameters: {
    type: 'object',
    properties: {
      stepId: {
        type: 'string',
        description:
          '可选：指向 plan_doc 中的步骤 ID。仅当 step.task 命中尾部截断（已批准计划里 task 写成「...：」一类残缺指令）时，同时给出 task 才会覆盖 step.task；正常 step 的 task 不可被覆盖，需要改语义请走 edit_plan_doc.replace_steps 重新审批。',
      },
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
      stateValues: {
        type: 'array',
        description:
          '可选：结构化的状态值写入。父代理只给字段标识与语义值，工具层从世界 schema 读 field_key/type 并校验 value，'
          + '避免子代理猜格式失败。仅支持 targetType=persona-card / character-card。'
          + '每项：{ field?: string(中文 label), field_key?: string(精确键), value: any(按字段 type 给原生值；list 给数组、number 给数字、enum 给枚举字符串、boolean 给 true/false、datetime 给 "YYYY-MM-DDTHH:mm"、table 给 {col: number}、清空给 null) }。'
          + '至少要提供 field 或 field_key 之一；同 label 冲突时必须改用 field_key。',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string', description: '中文 label（如"私处"、"据点地址"）；与 field_key 至少一个' },
            field_key: { type: 'string', description: '字段精确键（如 "food_user"）；优先于 field' },
            target: { type: 'string', enum: ['persona', 'character'], description: '可选；不传由 targetType 自动推导' },
            value: { description: '按字段 type 给原生值，详见参数描述' },
          },
          required: ['value'],
        },
      },
    },
  },
};
