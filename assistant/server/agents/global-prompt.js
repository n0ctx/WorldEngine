export const GLOBAL_PROMPT_AGENT = {
  name: 'global_prompt_agent',
  description:
    '修改跨所有世界通用的全局配置，包括 global_system_prompt/global_post_prompt、全局 Prompt 条目（entryOps）和全局 LLM 参数。' +
    '只处理对所有世界题材都适用的内容，题材相关内容应放世界卡。' +
    '必须先调用 preview_card(target="global-prompt") 获取现有配置，再调用此代理。',
  parameters: {
    type: 'object',
    properties: {
      task: { type: 'string', description: '主代理预研后整理的任务说明，包含用户需求、当前数据摘要和具体修改指令' },
      operation: {
        type: 'string',
        enum: ['update'],
        description: '固定为 update',
      },
    },
    required: ['task', 'operation'],
  },
  proposalType: 'global-config',
};
