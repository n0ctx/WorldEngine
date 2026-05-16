import { RuleTester } from 'eslint';
import rule from '../no-direct-toast-import.js';

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
});

ruleTester.run('no-direct-toast-import', rule, {
  valid: [
    { code: 'import { log } from "../core/utils/logger.js"', filename: 'frontend/src/components/Foo.jsx' },
    { code: 'import { showToast } from "../utils/toast.js"', filename: 'frontend/src/core/utils/logger.js' },
    { code: 'import { showToast } from "./toast.js"', filename: 'frontend/src/utils/toast.test.js' },
    { code: 'import x from "./other-module.js"', filename: 'frontend/src/components/Foo.jsx' },
    { code: 'import x from "./utils/toast-helpers.js"', filename: 'frontend/src/components/Foo.jsx' },
  ],
  invalid: [
    {
      code: 'import { showToast } from "../utils/toast.js"',
      filename: 'frontend/src/components/Foo.jsx',
      errors: [{ messageId: 'forbidden' }],
    },
    {
      code: 'import t from "./utils/toast"',
      filename: 'frontend/src/components/Bar.jsx',
      errors: [{ messageId: 'forbidden' }],
    },
    {
      code: 'import { showToast } from "../../core/utils/toast.js"',
      filename: 'frontend/src/components/Baz.jsx',
      errors: [{ messageId: 'forbidden' }],
    },
  ],
});
