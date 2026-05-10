export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      forbidden: '组件不得直接 import utils/toast.js，请使用 utils/logger.js 的 log API',
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const src = node.source.value;
        if (typeof src !== 'string') return;
        if (!/utils\/toast(\.js)?$/.test(src)) return;
        const filename = context.filename || context.getFilename();
        if (filename.endsWith('utils/logger.js')) return;
        if (/utils\/toast.*\.test\.[jt]sx?$/.test(filename)) return;
        context.report({ node, messageId: 'forbidden' });
      },
    };
  },
};
