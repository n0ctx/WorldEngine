/**
 * Task 3：验证父子代理在 llm.* 调用处透传 cacheableSystem 选项。
 *
 * 采用静态源码检查（而非 ESM spy 注入），原因：
 *   - llm 模块为 ESM 默认导出，难以在测试内可靠覆盖；
 *   - cacheableSystem 是纯 cache 提示字段，传不传不影响业务逻辑，spy 注入收益低。
 *
 * 检查目标：parent-agent.js 至少 2 处（context summary complete + completeWithToolsDetailed），
 *           sub-agent.js 至少 1 处（completeWithTools）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('parent-agent.js 在 llm 调用处透传 cacheableSystem', () => {
  const src = fs.readFileSync(new URL('../server/parent-agent.js', import.meta.url), 'utf8');
  const count = (src.match(/cacheableSystem\s*:/g) || []).length;
  assert.ok(count >= 2, `parent-agent.js 应至少 2 处含 cacheableSystem，实际 ${count}`);
});

test('sub-agent.js 在 llm 调用处透传 cacheableSystem', () => {
  const src = fs.readFileSync(new URL('../server/sub-agent.js', import.meta.url), 'utf8');
  const count = (src.match(/cacheableSystem\s*:/g) || []).length;
  assert.ok(count >= 1, `sub-agent.js 应至少 1 处含 cacheableSystem，实际 ${count}`);
});

test('cacheableSystem 值为 systemPrompt（稳定 prefix 变量名）', () => {
  const parent = fs.readFileSync(new URL('../server/parent-agent.js', import.meta.url), 'utf8');
  const sub = fs.readFileSync(new URL('../server/sub-agent.js', import.meta.url), 'utf8');
  assert.match(parent, /cacheableSystem\s*:\s*systemPrompt/);
  assert.match(sub, /cacheableSystem\s*:\s*systemPrompt/);
});
