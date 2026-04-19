export const GLOBAL_PROMPT_SKILL = {
  name: 'global_prompt_skill',
  description:
    '修改跨所有世界通用的全局配置，包括 global_system_prompt/global_post_prompt、全局 Prompt 条目（entryOps）和全局 LLM 参数。' +
    '只处理对所有世界题材都适用的内容，题材相关内容应放世界卡。' +
    '调用前必须先用 preview_card(target="global-prompt") 获取当前配置。',
  parameters: {
    type: 'object',
    properties: {
      task: { type: 'string', description: '详细描述需要对全局配置做哪些修改' },
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
