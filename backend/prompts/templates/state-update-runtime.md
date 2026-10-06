以下是各字段的当前值，请结合上面的字段定义判断本轮变化：

{{VALUES}}

本轮轮号：{{ROUND}}

【世界当前时间】{{WORLD_TIME}}

【本轮触发的世界观条目】（本轮正文生成时按剧情命中的设定，与【世界观】同等对待）
{{TRIGGERED_SETTING}}

【实体目录】
{{ENTITY_DIRECTORY}}

【本轮相关的未了事项】
{{RELEVANT_THREADS}}

【相关实体详情】
{{ENTITY_DETAILS}}

【待补全】（本轮必须全部补上，本轮没出场的也要补：按【相关实体详情】里它已有的档案、关系和【世界观】创作，正文没写到的直接编出合理的值。缺档案用 fill_profile，缺字段用顶层 entity_fields，缺位置用 set_state）
{{PROFILE_GAPS}}

对话内容：
{{DIALOGUE}}

请按前述要求返回 JSON 对象（顶层 key：{{RESPONSE_KEYS}}），只返回 JSON，不要任何解释。
