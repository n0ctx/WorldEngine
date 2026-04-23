import { configureAxe } from 'vitest-axe';
import { toHaveNoViolations } from 'vitest-axe/matchers';
import { expect } from 'vitest';

expect.extend({ toHaveNoViolations });

// 配置 axe 使用中文语言环境
configureAxe({
  locale: 'zh',
});
