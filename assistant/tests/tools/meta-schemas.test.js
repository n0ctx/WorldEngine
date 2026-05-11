// 验证 meta/index.js 导出 5 件套 definition,且形态为扁平 schema。
import test from 'node:test';
import assert from 'node:assert/strict';

const expectedTools = [
  'write_plan_doc', 'edit_plan_doc', 'dispatch_subagent',
  'delete_plan_doc', 'finalize_task',
];

test('meta/index.js 导出 5 件套 definition', async () => {
  const mod = await import('../../server/tools/meta/index.js');
  for (const name of expectedTools) {
    const def = mod[toCamel(name)];
    assert.ok(def, `应导出 ${toCamel(name)}`);
    assert.equal(def.name, name);
    assert.ok(def.description, `${name} 应有 description`);
    assert.equal(def.parameters?.type, 'object', `${name}.parameters.type 应为 'object'`);
  }
});

function toCamel(snake) {
  return snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase()) + 'Definition';
}
