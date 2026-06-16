import { RuleTester } from 'eslint';
import rule from '../no-direct-db-prepare.js';

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
});

ruleTester.run('no-direct-db-prepare', rule, {
  valid: [
    // 经由 query 模块函数访问，不直接碰 db
    { code: 'getRecentTurnSummaries(id, limit)' },
    // 非 db 对象的同名方法不受影响
    { code: 'stmt.prepare()' },
    { code: 'tx.transaction()' },
    // db 上的其它方法不受影响（如 db.pragma）
    { code: 'db.pragma("foreign_keys = ON")' },
    { code: 'db.exec("VACUUM")' },
  ],
  invalid: [
    {
      code: 'db.prepare("SELECT 1").get()',
      errors: [{ messageId: 'forbidden' }],
    },
    {
      code: 'const run = db.transaction(() => {});',
      errors: [{ messageId: 'forbidden' }],
    },
    {
      code: 'db.prepare(`INSERT ...`).run(); db.transaction(fn);',
      errors: [{ messageId: 'forbidden' }, { messageId: 'forbidden' }],
    },
  ],
});
