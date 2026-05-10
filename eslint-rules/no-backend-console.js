export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      forbidden: 'backend 禁止直接 console.{log,info,warn,error,debug}，请使用 utils/logger.js 的 createLogger',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (node.object?.name !== 'console') return;
        const prop = node.property?.name;
        if (!['log', 'info', 'warn', 'error', 'debug'].includes(prop)) return;
        const filename = context.filename || context.getFilename();
        if (filename.endsWith('utils/logger.js')) return;
        if (filename.endsWith('backend/server.js')) return;
        context.report({ node, messageId: 'forbidden' });
      },
    };
  },
};
