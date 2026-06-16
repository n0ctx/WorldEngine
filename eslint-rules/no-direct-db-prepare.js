export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      forbidden:
        'backend/routes 与 backend/services 禁止直接 db.prepare/db.transaction，SQL 查询必须收口到 backend/db/queries/。',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (node.object?.name !== 'db') return;
        const prop = node.property?.name;
        if (prop !== 'prepare' && prop !== 'transaction') return;
        context.report({ node, messageId: 'forbidden' });
      },
    };
  },
};
