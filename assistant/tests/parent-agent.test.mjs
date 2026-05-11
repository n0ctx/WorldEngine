// assistant/tests/parent-agent.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../../backend/tests/helpers/test-env.js';

const sandbox = createTestSandbox('assistant-parent-agent');
sandbox.setEnv();

const taskStore = await freshImport('assistant/server/task-store.js');
const planDoc = await freshImport('assistant/server/plan-doc.js');
const parentAgentMod = await freshImport('assistant/server/parent-agent.js');
const { runParentAgent, __testables } = parentAgentMod;

after(() => {
  resetMockEnv();
  sandbox.cleanup();
});

test('plan_doc_updated 事件携带文档全文', async () => {
  const task = taskStore.createTask({ context: { worldId: null } });
  const events = [];
  const fakeRes = { write: (line) => events.push(line) };
  taskStore.attachSse(task.id, fakeRes);
  await planDoc.writePlanDoc(task.id,
    '# 任务：T\n\n> 状态：planning · 创建时间：x\n\n## 用户意图\nx\n\n## 假设与约束\n- 无\n\n## 步骤\n\n- [ ] **step-1** A（world-card.create）\n  - 依赖：无\n  - 任务：a\n\n## 执行日志\n');
  taskStore.emit(task.id, { type: 'plan_doc_updated', taskId: task.id, content: 'demo' });
  assert.match(events.at(-1), /plan_doc_updated/);
  assert.match(events.at(-1), /demo/);
  await planDoc.deletePlanDoc(task.id);
});

test('toLLMTool / wrapApply 行为', async () => {
  const fakeMod = { definition: { name: 'foo' }, execute: async () => { throw new Error('boom'); } };
  const wrapped = __testables.wrapApply(fakeMod, {});
  const result = await wrapped({});
  assert.equal(result.ok, false);
  assert.match(result.error, /boom/);

  const okMod = { definition: { name: 'bar' }, execute: async () => ({ entityId: 'e1' }) };
  const w2 = __testables.wrapApply(okMod, {});
  const r2 = await w2({});
  assert.equal(r2.ok, true);
  assert.equal(r2.entityId, 'e1');

  // toLLMTool 三种形态
  const exec = async () => 'ok';
  const a = __testables.toLLMTool({ definition: { name: 'foo' }, execute: exec });
  assert.equal(a.function.name, 'foo');
  const b = __testables.toLLMTool({ definition: { type: 'function', function: { name: 'bar' } }, execute: exec });
  assert.equal(b.function.name, 'bar');
  const t = { type: 'function', function: { name: 'baz' }, execute: exec };
  assert.equal(__testables.toLLMTool(t), t);
  // executeOverride 覆盖
  const c = __testables.toLLMTool(t, async () => 'override');
  assert.notEqual(c.execute, t.execute);
  assert.throws(() => __testables.toLLMTool({ definition: { name: 'no-exec' } }), /missing execute/);
  assert.throws(() => __testables.toLLMTool({ definition: {} }, exec), /unrecognized/);
});

test('buildContextBlock 反映 task 状态', () => {
  const task = { id: 'task-1', status: 'planning', context: { worldId: 'w1', characterId: null } };
  assert.match(__testables.buildContextBlock(task, ''), /尚未生成/);
  assert.match(__testables.buildContextBlock(task, '## 真实计划\n'), /## 真实计划/);
});

test('buildMetaTools：5 个工具与各分支', async () => {
  const task = taskStore.createTask({ context: {} });
  const events = [];
  taskStore.attachSse(task.id, { write: (l) => events.push(l) });
  const tools = __testables.buildMetaTools(task, (e) => taskStore.emit(task.id, e));
  assert.equal(tools.length, 5);

  const writePlan = tools[0];
  assert.equal(writePlan.definition.function.name, 'write_plan_doc');
  const r = await writePlan.execute({
    title: 'T', intent: '描述',
    steps: [{ title: '建世界', targetType: 'world-card', operation: 'create', task: '...' }],
  });
  assert.equal(r.ok, true);
  assert.equal(task.status, 'awaiting_approval');
  const types = events.map((e) => JSON.parse(e.replace(/^data: /, '').trim()).type);
  assert.ok(types.includes('plan_doc_updated'));
  assert.ok(types.includes('awaiting_approval'));

  const editPlan = tools[1];
  assert.equal((await editPlan.execute({ op: 'append_log', line: 'log-1' })).ok, true);
  assert.equal((await editPlan.execute({ op: 'mark_done' })).ok, false);
  assert.equal((await editPlan.execute({ op: 'append_log' })).ok, false);
  assert.equal((await editPlan.execute({ op: 'replace_steps', steps: 'x' })).ok, false);
  assert.equal((await editPlan.execute({ op: 'unknown' })).ok, false);
  assert.equal((await editPlan.execute({ op: 'mark_done', stepId: 'step-1' })).ok, true);
  assert.equal((await editPlan.execute({ op: 'replace_steps', steps: [{ title: 'x', targetType: 'world-card', operation: 'update', task: 't' }] })).ok, true);

  // delete_plan_doc
  assert.equal((await tools[3].execute({})).ok, true);
  // finalize_task
  assert.equal((await tools[4].execute({ summary: 'done', terminalStatus: 'completed' })).ok, true);
  assert.equal(task.status, 'completed');
});

test('dispatch_subagent 工具：未找到 / 已完成', async () => {
  const task = taskStore.createTask({ context: {} });
  const tools = __testables.buildMetaTools(task, () => {});
  const dispatch = tools[2];
  // 无 plan doc → ok:false
  assert.equal((await dispatch.execute({ stepId: 'step-1' })).ok, false);

  const md = `# 任务：T\n\n> 状态：executing · 创建时间：x\n\n## 用户意图\ni\n\n## 假设与约束\n- 无\n\n## 步骤\n\n- [x] **step-1** done（world-card.create）\n  - 依赖：无\n  - 任务：a\n\n## 执行日志\n`;
  await planDoc.writePlanDoc(task.id, md);
  const r2 = await dispatch.execute({ stepId: 'step-1' });
  assert.equal(r2.ok, false);
  assert.match(r2.error, /already done/);
  const r3 = await dispatch.execute({ stepId: 'step-99' });
  assert.equal(r3.ok, false);
  await planDoc.deletePlanDoc(task.id);
});

test('runParentAgent：mock 流式 + done 事件', async () => {
  process.env.MOCK_LLM_STREAM = 'hello';
  const task = taskStore.createTask({ context: { worldId: null } });
  const events = [];
  taskStore.attachSse(task.id, { write: (l) => events.push(l) });
  await runParentAgent(task, '你好');
  const types = events.map((e) => JSON.parse(e.replace(/^data: /, '').trim()).type);
  assert.ok(types.includes('done'));
  const last = task.messages.at(-1);
  assert.equal(last.role, 'assistant');
  assert.equal(last.content, 'hello');
  delete process.env.MOCK_LLM_STREAM;
});

test('runParentAgent：流式抛错走 fail 分支', async () => {
  process.env.MOCK_LLM_STREAM_ERROR = 'stream-broken';
  const task = taskStore.createTask({ context: {} });
  taskStore.attachSse(task.id, { write: () => {} });
  await assert.rejects(() => runParentAgent(task, 'x'));
  assert.equal(task.status, 'failed');
  delete process.env.MOCK_LLM_STREAM_ERROR;
});

test('runParentAgent：无 task 拒绝', async () => {
  await assert.rejects(() => runParentAgent(null, 'x'), /task is required/);
});

test('runParentAgent：finalize_task 在 Step 1 切终态后跳过流式', async () => {
  // mock LLM 在 resolveToolContext 阶段调用 finalize_task → task.status=completed
  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([
    { name: 'finalize_task', arguments: { summary: 'all done', terminalStatus: 'completed' } },
  ]);
  // 故意把 stream 设为非空：若进入 Step 2 会污染 messages
  process.env.MOCK_LLM_STREAM = 'should-not-appear';
  const task = taskStore.createTask({ context: {} });
  const events = [];
  taskStore.attachSse(task.id, { write: (l) => events.push(l) });
  await runParentAgent(task, '收尾');
  assert.equal(task.status, 'completed');
  // 终态分支会发 done 并 endAllSse
  const types = events.map((e) => JSON.parse(e.replace(/^data: /, '').trim()).type);
  assert.ok(types.includes('task_completed'));
  assert.ok(types.some((t) => t === 'done' || t === undefined));
  // 不应有 delta（Step 2 被跳过）
  const hasDelta = events.some((e) => /"type":"delta"/.test(e));
  assert.equal(hasDelta, false);
  // task.messages 不应被注入流式 stream 文本
  const hasLeak = task.messages.some((m) => m.content?.includes('should-not-appear'));
  assert.equal(hasLeak, false);
  delete process.env.MOCK_LLM_TOOL_CALLS;
  delete process.env.MOCK_LLM_STREAM;
});

test('runParentAgent：已取消任务会中断 tool loop，不走 failed 分支', async () => {
  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([
    { name: 'list_resources', arguments: { target: 'worlds' } },
  ]);
  process.env.MOCK_LLM_STREAM = 'should-not-appear';
  const task = taskStore.createTask({ context: {} });
  taskStore.setStatus(task.id, 'cancelled');
  const events = [];
  taskStore.attachSse(task.id, { write: (l) => events.push(l) });

  await runParentAgent(task, '取消中的任务');

  assert.equal(task.status, 'cancelled');
  const hasFailed = events.some((e) => /"type":"task_failed"/.test(e));
  const hasDone = events.some((e) => /"done":\s*true/.test(e));
  const hasDelta = events.some((e) => /"type":"delta"/.test(e));
  assert.equal(hasFailed, false);
  assert.equal(hasDone, true);
  assert.equal(hasDelta, false);

  delete process.env.MOCK_LLM_TOOL_CALLS;
  delete process.env.MOCK_LLM_STREAM;
});

test('runParentAgent：write_plan_doc 后停在 awaiting_approval（不发 done）', async () => {
  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([
    {
      name: 'write_plan_doc',
      arguments: {
        title: 'T',
        intent: '建一个世界',
        steps: [{ title: '建世界', targetType: 'world-card', operation: 'create', task: '...' }],
      },
    },
  ]);
  process.env.MOCK_LLM_STREAM = 'should-not-appear';
  const task = taskStore.createTask({ context: {} });
  const events = [];
  taskStore.attachSse(task.id, { write: (l) => events.push(l) });
  await runParentAgent(task, '帮我建个世界');
  assert.equal(task.status, 'awaiting_approval');
  const types = events.map((e) => JSON.parse(e.replace(/^data: /, '').trim()).type);
  assert.ok(types.includes('awaiting_approval'));
  // awaiting_approval 分支不发 done，连接保持
  const doneCount = events.filter((e) => /"done":\s*true/.test(e)).length;
  assert.equal(doneCount, 0);
  // 不应有 delta
  const hasDelta = events.some((e) => /"type":"delta"/.test(e));
  assert.equal(hasDelta, false);
  // 清理
  await planDoc.deletePlanDoc(task.id);
  delete process.env.MOCK_LLM_TOOL_CALLS;
  delete process.env.MOCK_LLM_STREAM;
});

test('runParentAgent：approved sentinel 替换文案', async () => {
  process.env.MOCK_LLM_STREAM = 'ok';
  const task = taskStore.createTask({ context: {} });
  taskStore.attachSse(task.id, { write: () => {} });
  await runParentAgent(task, __testables.APPROVED_SENTINEL);
  const firstUser = task.messages.find((m) => m.role === 'user');
  assert.match(firstUser.content, /用户已确认计划/);
  delete process.env.MOCK_LLM_STREAM;
});

test('dispatch_subagent: 子代理软失败统一映射为 ok:false', async () => {
  // 让子代理 llm.completeWithTools 抛错 → dispatchSubAgent 返回 {success:false}
  process.env.MOCK_LLM_COMPLETE_ERROR = 'subagent boom';
  const task = taskStore.createTask({ context: {} });
  const md = `# 任务：T\n\n> 状态：executing · 创建时间：x\n\n## 用户意图\ni\n\n## 假设与约束\n- 无\n\n## 步骤\n\n- [ ] **step-1** A（world-card.create）\n  - 依赖：无\n  - 任务：a\n\n## 执行日志\n`;
  await planDoc.writePlanDoc(task.id, md);
  taskStore.attachSse(task.id, { write: () => {} });

  const tools = __testables.buildMetaTools(task, () => {});
  const dispatch = tools[2];
  const r = await dispatch.execute({ stepId: 'step-1' });

  assert.equal(r.ok, false);
  assert.ok(r.error, '应当带 error 字段');

  await planDoc.deletePlanDoc(task.id);
  delete process.env.MOCK_LLM_COMPLETE_ERROR;
});
