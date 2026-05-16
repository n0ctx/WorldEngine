import { RuleTester } from 'eslint';
import rule from '../no-backend-console.js';

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
});

ruleTester.run('no-backend-console', rule, {
  valid: [
    { code: 'logger.info("hi")', filename: 'backend/routes/foo.js' },
    { code: 'createLogger("x")', filename: 'backend/services/bar.js' },
    { code: 'console.log("ok")', filename: 'backend/utils/logger.js' },
    { code: 'console.error("server start")', filename: 'backend/server.js' },
    { code: 'console.table([])', filename: 'backend/services/bar.js' },
    { code: 'logger.log("ok")', filename: 'backend/routes/foo.js' },
  ],
  invalid: [
    {
      code: 'console.log("x")',
      filename: 'backend/routes/chat.js',
      errors: [{ messageId: 'forbidden' }],
    },
    {
      code: 'console.info("y")',
      filename: 'backend/services/x.js',
      errors: [{ messageId: 'forbidden' }],
    },
    {
      code: 'console.warn("z")',
      filename: 'backend/db/queries.js',
      errors: [{ messageId: 'forbidden' }],
    },
    {
      code: 'console.error("e")',
      filename: 'backend/routes/foo.js',
      errors: [{ messageId: 'forbidden' }],
    },
    {
      code: 'console.debug("d")',
      filename: 'backend/llm/index.js',
      errors: [{ messageId: 'forbidden' }],
    },
  ],
});
