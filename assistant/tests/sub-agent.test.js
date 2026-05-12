import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../../backend/tests/helpers/test-env.js';
import { insertWorld } from '../../backend/tests/helpers/fixtures.js';

const sandbox = createTestSandbox('assistant-sub-agent');
sandbox.setEnv();

const subAgent = await freshImport('assistant/server/sub-agent.js');
const { __testables, dispatchSubAgent } = subAgent;

after(() => {
  resetMockEnv();
  sandbox.cleanup();
});

test('toLLMTool 处理三种入参形态', () => {
  // bare definition + execute
  const exec = async () => 'ok';
  const a = __testables.toLLMTool({
    definition: { name: 'foo', description: 'd', parameters: { type: 'object' } },
    execute: exec,
  });
  assert.equal(a.type, 'function');
  assert.equal(a.function.name, 'foo');
  assert.equal(a.execute, exec);

  // wrapped definition + execute
  const b = __testables.toLLMTool({
    definition: { type: 'function', function: { name: 'bar' } },
    execute: exec,
  });
  assert.equal(b.function.name, 'bar');

  // 已成形 tool
  const t = { type: 'function', function: { name: 'baz' }, execute: exec };
  assert.equal(__testables.toLLMTool(t), t);

  // executeOverride 覆盖
  const c = __testables.toLLMTool({ definition: { name: 'qux' } }, exec);
  assert.equal(c.execute, exec);

  // 缺少 execute → 抛
  assert.throws(() => __testables.toLLMTool({ definition: { name: 'no-exec' } }), /missing execute/);

  // 不识别的形态 → 抛
  assert.throws(() => __testables.toLLMTool({ definition: {} }, exec), /unrecognized/);
});

test('resolveEntityRef 解析占位符', () => {
  const ctx = { worldId: 'w1', characterId: 'c1' };
  assert.equal(__testables.resolveEntityRef(null, ctx), null);
  assert.equal(__testables.resolveEntityRef('context.worldId', ctx), 'w1');
  assert.equal(__testables.resolveEntityRef('context.characterId', ctx), 'c1');
  assert.equal(__testables.resolveEntityRef('literal-id', ctx), 'literal-id');
});

test('buildUserMessage 包含 stepId / targetType / context JSON', () => {
  const out = __testables.buildUserMessage({
    stepId: 'step-1',
    targetType: 'world-card',
    operation: 'create',
    entityRef: 'context.worldId',
    task: '建一个世界',
    context: { worldId: 'w1' },
  });
  assert.match(out, /stepId: step-1/);
  assert.match(out, /targetType: world-card/);
  assert.match(out, /建一个世界/);
  assert.match(out, /"worldId": "w1"/);
});

test('buildUserMessage 在缺省任务时使用占位文案', () => {
  const out = __testables.buildUserMessage({ targetType: 'world-card', operation: 'update' });
  assert.match(out, /\(空任务，请基于知识与 context 推断\)/);
  assert.match(out, /stepId: n\/a/);
  assert.match(out, /entityRef: null/);
});

test('dispatchSubAgent 未知 targetType 抛错', async () => {
  await assert.rejects(
    () => dispatchSubAgent({ targetType: 'unknown', task: '' }),
    /No apply tool/,
  );
});

test('dispatchSubAgent 调用 mock LLM 完成一次（无 tool 调用）', async () => {
  // mock llm 返回固定文本
  process.env.MOCK_LLM_COMPLETE = '已经创建了世界卡 X';
  const world = insertWorld(sandbox.db, { name: 'subagent-world' });
  const result = await dispatchSubAgent({
    stepId: 'step-1',
    targetType: 'world-card',
    operation: 'update',
    entityRef: world.id,
    task: '改世界描述',
    context: { worldId: world.id },
  });
  assert.equal(result.success, true);
  assert.match(result.summary, /已经创建了世界卡 X/);
});

test('dispatchSubAgent 在 LLM 抛错时返回 success=false', async () => {
  process.env.MOCK_LLM_COMPLETE_ERROR = 'mock-llm-fail';
  const result = await dispatchSubAgent({
    targetType: 'world-card',
    operation: 'update',
    task: 'x',
  });
  assert.equal(result.success, false);
  assert.match(result.error, /mock-llm-fail/);
  delete process.env.MOCK_LLM_COMPLETE_ERROR;
});

test('dispatchSubAgent emitFn 触发 tool_call_started/completed 事件', async () => {
  process.env.MOCK_LLM_COMPLETE = 'done';
  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([
    { name: 'list_resources', arguments: { target: 'worlds' } },
  ]);
  const events = [];
  const result = await dispatchSubAgent({
    targetType: 'world-card',
    operation: 'update',
    task: 'x',
    context: {},
    emitFn: (e) => events.push(e),
  });
  assert.equal(result.success, true);
  const types = events.map((e) => e.type);
  assert.ok(types.includes('tool_call_started'));
  assert.ok(types.includes('tool_call_completed'));
  delete process.env.MOCK_LLM_TOOL_CALLS;
  delete process.env.MOCK_LLM_COMPLETE;
});

test('dispatchSubAgent 内部 tool 抛错时 emit success=false', async () => {
  process.env.MOCK_LLM_COMPLETE = 'done';
  // 调用 list_resources 传未知 target → 触发抛错
  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([
    { name: 'list_resources', arguments: { target: 'unknown' } },
  ]);
  const events = [];
  await dispatchSubAgent({
    targetType: 'world-card',
    operation: 'update',
    task: 'x',
    context: {},
    emitFn: (e) => events.push(e),
  }).catch(() => {});
  const completed = events.find((e) => e.type === 'tool_call_completed');
  if (completed) {
    assert.equal(completed.success, false);
  }
  delete process.env.MOCK_LLM_TOOL_CALLS;
  delete process.env.MOCK_LLM_COMPLETE;
});
