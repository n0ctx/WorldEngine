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
  assert.equal(writePlan.definition.name, 'write_plan_doc');
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

test('edit_plan_doc.replace_steps: 已完成步骤被强制保留', async () => {
  const task = taskStore.createTask({ context: {} });
  taskStore.attachSse(task.id, { write: () => {} });
  const tools = __testables.buildMetaTools(task, () => {});

  const md = [
    '# 任务：T',
    '',
    '> 状态：executing · 创建时间：x',
    '',
    '## 用户意图',
    'i',
    '',
    '## 假设与约束',
    '- 无',
    '',
    '## 步骤',
    '',
    '- [x] **step-1** done（world-card.create）',
    '  - 依赖：无',
    '  - 任务：a',
    '  - 完成于 12:00:00',
    '- [ ] **step-2** todo（character-card.create）',
    '  - 依赖：无',
    '  - 任务：b',
    '',
    '## 执行日志',
    '',
  ].join('\n');
  await planDoc.writePlanDoc(task.id, md);

  const editPlan = tools[1];
  const r = await editPlan.execute({
    op: 'replace_steps',
    steps: [{ title: '只剩这个', targetType: 'character-card', operation: 'update', task: 't' }],
  });
  assert.equal(r.ok, true);

  const newMd = await planDoc.readPlanDoc(task.id);
  const parsed = planDoc.parsePlanDoc(newMd);
  const doneStep = parsed.steps.find((s) => s.id === 'step-1');
  assert.ok(doneStep, 'step-1 必须保留');
  assert.equal(doneStep.done, true, 'step-1.done 必须仍为 true');
  assert.match(newMd, /完成于 12:00:00/, '已完成步骤的完成时间必须保留在原始文档中');
  assert.equal(doneStep.completedAt, '12:00:00', 'parsePlanDoc 必须解析 completedAt');

  await planDoc.deletePlanDoc(task.id);
});

test('runParentAgent: SSE 事件携带 runId', async () => {
  process.env.MOCK_LLM_STREAM = 'hi';
  const task = taskStore.createTask({ context: {} });
  const events = [];
  taskStore.attachSse(task.id, { write: (l) => events.push(l) });
  await runParentAgent(task, '你好');
  const parsed = events
    .map((e) => { try { return JSON.parse(e.replace(/^data: /, '').trim()); } catch { return null; } })
    .filter(Boolean);
  const withoutRun = parsed.filter((e) => typeof e.runId !== 'string' || e.runId.length === 0);
  assert.equal(withoutRun.length, 0, `所有事件都应携带 runId,缺失:${JSON.stringify(withoutRun)}`);
  const ids = new Set(parsed.map((e) => e.runId));
  assert.equal(ids.size, 1, `同一次 run 的 runId 应一致,实际:${[...ids].join(',')}`);
  delete process.env.MOCK_LLM_STREAM;
});

test('dispatchSubAgent: task.status===cancelled 时子代理工具循环立即中断', async () => {
  // mock 让子代理想连续调 list_resources → apply_world_card
  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([
    { name: 'list_resources', arguments: { target: 'worlds' } },
    { name: 'apply_world_card', arguments: { name: 'w', system_prompt: 'p' } },
  ]);

  const task = taskStore.createTask({ context: {} });
  taskStore.attachSse(task.id, { write: () => {} });

  const md = `# 任务：T\n\n> 状态：executing · 创建时间：x\n\n## 用户意图\ni\n\n## 假设与约束\n- 无\n\n## 步骤\n\n- [ ] **step-1** A（world-card.create）\n  - 依赖：无\n  - 任务：a\n\n## 执行日志\n`;
  await planDoc.writePlanDoc(task.id, md);

  // 在执行 dispatch 前就把 task 标 cancelled,模拟"用户已点清空"
  taskStore.setStatus(task.id, 'cancelled');

  const tools = __testables.buildMetaTools(task, () => {}, 'run-12345678');
  const dispatch = tools[2];
  const r = await dispatch.execute({ stepId: 'step-1' });

  // 期望:子代理在第一轮 tool 调用前的 cancelCheck 命中,
  //   throw ToolLoopCancelledError → completeWithTools 透传 →
  //   dispatchSubAgent catch 转 {success:false, error: 'task cancelled'}
  //   父代理 dispatch_subagent.execute 映射为 {ok:false, error}(Sprint A Task 1)
  assert.equal(r.ok, false);
  assert.match(r.error ?? '', /cancel/i);

  await planDoc.deletePlanDoc(task.id);
  delete process.env.MOCK_LLM_TOOL_CALLS;
});

test('runParentAgent: happy path 集成（write_plan_doc → approve → dispatch_subagent → finalize_task）', async () => {
  // ---- Phase 1：plan 模式，落计划文档并切到 awaiting_approval ----
  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([
    {
      name: 'write_plan_doc',
      arguments: {
        title: '建一个世界',
        intent: '用户想要新建一个世界卡',
        steps: [
          { title: '建世界', targetType: 'world-card', operation: 'create', task: '创建空世界卡' },
        ],
      },
    },
  ]);
  // 给 plan 阶段一个空 stream（避免 awaiting_approval 之后还有 stream 文本进入）
  process.env.MOCK_LLM_STREAM = '';

  const task = taskStore.createTask({ context: { worldId: null } });
  const events = [];
  taskStore.attachSse(task.id, { write: (l) => events.push(l) });

  await runParentAgent(task, '帮我建个世界');
  assert.equal(task.status, 'awaiting_approval');
  const phase1Types = events.map((e) => {
    try { return JSON.parse(e.replace(/^data: /, '').trim()).type; } catch { return null; }
  });
  assert.ok(phase1Types.includes('plan_doc_updated'), 'phase1 应当 emit plan_doc_updated');
  assert.ok(phase1Types.includes('awaiting_approval'), 'phase1 应当 emit awaiting_approval');

  // ---- Phase 2：approve → 执行 step → finalize_task ----
  // 模拟 routes.approve：切到 executing 再调 runParentAgent('<<approved>>')
  taskStore.setStatus(task.id, 'executing');

  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([
    { name: 'dispatch_subagent', arguments: { stepId: 'step-1' } },
    {
      name: 'finalize_task',
      arguments: { summary: '世界已创建', terminalStatus: 'completed' },
    },
  ]);
  // 子代理 completeWithTools 也读这个 env，但它的 handler 表里没这两个 name，
  // 都被 mock provider 的 `if (typeof handler !== 'function') continue;` 跳过，
  // 子代理返回 success:true, summary:''。
  process.env.MOCK_LLM_COMPLETE = ''; // 子代理空总结
  process.env.MOCK_LLM_STREAM = 'should-not-appear'; // finalize 终态后 Step 2 应被跳过

  const phase2Start = events.length;
  await runParentAgent(task, __testables.APPROVED_SENTINEL);

  assert.equal(task.status, 'completed');

  const phase2Events = events.slice(phase2Start);
  const phase2Types = phase2Events.map((e) => {
    try { return JSON.parse(e.replace(/^data: /, '').trim()).type; } catch { return null; }
  });

  assert.ok(phase2Types.includes('step_started'), 'phase2 应当 emit step_started');
  assert.ok(phase2Types.includes('step_completed'), 'phase2 应当 emit step_completed');
  assert.ok(phase2Types.includes('task_completed'), 'phase2 应当 emit task_completed');

  // 终态后 Step 2 应被跳过，不应有流式 delta 注入 should-not-appear
  const hasDelta = phase2Events.some((e) => /"type":"delta"/.test(e));
  assert.equal(hasDelta, false, '终态后不应再发 delta');
  const hasLeak = task.messages.some((m) => m.content?.includes('should-not-appear'));
  assert.equal(hasLeak, false, '流式文本不应泄漏进 task.messages');

  // 总结消息应被 finalize_task 写入
  const summaryMsg = task.messages.find((m) => m.role === 'assistant' && m.content === '世界已创建');
  assert.ok(summaryMsg, 'finalize_task 应写入总结消息');

  // 清理
  await planDoc.deletePlanDoc(task.id).catch(() => {});
  delete process.env.MOCK_LLM_TOOL_CALLS;
  delete process.env.MOCK_LLM_STREAM;
  delete process.env.MOCK_LLM_COMPLETE;
});

test('edit_plan_doc.replace_steps: 非连续 done 不会触发 id 碰撞', async () => {
  const task = taskStore.createTask({ context: {} });
  taskStore.attachSse(task.id, { write: () => {} });
  const tools = __testables.buildMetaTools(task, () => {});

  const md = [
    '# 任务：T',
    '',
    '> 状态：executing · 创建时间：x',
    '',
    '## 用户意图',
    'i',
    '',
    '## 假设与约束',
    '- 无',
    '',
    '## 步骤',
    '',
    '- [x] **step-1** d1（world-card.create）',
    '  - 依赖：无',
    '  - 任务：a',
    '  - 完成于 12:00:00',
    '- [ ] **step-2** todo（character-card.create）',
    '  - 依赖：无',
    '  - 任务：b',
    '- [x] **step-3** d3（character-card.update）',
    '  - 依赖：无',
    '  - 任务：c',
    '  - 完成于 12:05:00',
    '',
    '## 执行日志',
    '',
  ].join('\n');
  await planDoc.writePlanDoc(task.id, md);

  const editPlan = tools[1];
  const r = await editPlan.execute({
    op: 'replace_steps',
    steps: [{ title: '新步骤', targetType: 'character-card', operation: 'update', task: 't' }],
  });
  assert.equal(r.ok, true);

  const parsed = planDoc.parsePlanDoc(await planDoc.readPlanDoc(task.id));
  const ids = parsed.steps.map((s) => s.id);
  const uniqueIds = new Set(ids);
  assert.equal(ids.length, uniqueIds.size, `id 不应重复,实际:${ids.join(',')}`);
  assert.ok(ids.includes('step-4'), `应包含 step-4,实际:${ids.join(',')}`);

  await planDoc.deletePlanDoc(task.id);
});

test('runParentAgent: dispatch_subagent 软失败时父代理不应推进到 completed', async () => {
  // 准备:计划文档含一个未完成 step;task 切到 executing 模拟已 approved
  const task = taskStore.createTask({ context: {} });
  const md = [
    '# 任务：T', '', '> 状态：executing · 创建时间：x', '',
    '## 用户意图', 'i', '',
    '## 假设与约束', '- 无', '',
    '## 步骤', '',
    '- [ ] **step-1** A（world-card.create）',
    '  - 依赖：无',
    '  - 任务：a',
    '',
    '## 执行日志', '',
  ].join('\n');
  await planDoc.writePlanDoc(task.id, md);
  taskStore.setStatus(task.id, 'executing');

  // 父代理本轮只调一次 dispatch_subagent;不追加 finalize_task,
  // 因为我们的核心断言是"软失败不应误标 completed"
  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([
    { name: 'dispatch_subagent', arguments: { stepId: 'step-1' } },
  ]);
  // 子代理走 llm.completeWithTools 时抛错 → dispatchSubAgent 返回 success:false →
  // 父代理 dispatch_subagent.execute 映射为 {ok:false, error}(Sprint A Task 1)
  process.env.MOCK_LLM_COMPLETE_ERROR = 'subagent boom';
  // Step 2 流式阶段不写任何文本,避免影响断言
  process.env.MOCK_LLM_STREAM = '';

  const events = [];
  taskStore.attachSse(task.id, { write: (l) => events.push(l) });

  await runParentAgent(task, __testables.APPROVED_SENTINEL);

  const parsed = events
    .map((e) => { try { return JSON.parse(e.replace(/^data: /, '').trim()); } catch { return null; } })
    .filter(Boolean);

  // 断言 1: dispatch_subagent 的 tool_call_completed 出现且 success:false
  const dispatchDone = parsed.find(
    (e) => e.type === 'tool_call_completed' && e.toolName === 'dispatch_subagent',
  );
  assert.ok(dispatchDone, '应有 dispatch_subagent 的 tool_call_completed 事件');
  assert.equal(dispatchDone.success, false, 'dispatch_subagent 软失败时 success 应为 false');

  // 断言 2: parent task 不应被标 completed(也不应是其他终态——软失败仍可重试)
  assert.notEqual(taskStore.getTask(task.id).status, 'completed',
    `软失败后 task.status 不应为 completed,实际:${taskStore.getTask(task.id).status}`);

  // 断言 3: 计划文档仍存在,step-1 未被标 done
  const after = planDoc.parsePlanDoc(await planDoc.readPlanDoc(task.id));
  const step1 = after.steps.find((s) => s.id === 'step-1');
  assert.ok(step1, '软失败后 step-1 仍应存在');
  assert.equal(step1.done, false, '软失败时 step-1 不应被标 done');

  await planDoc.deletePlanDoc(task.id).catch(() => {});
  delete process.env.MOCK_LLM_TOOL_CALLS;
  delete process.env.MOCK_LLM_COMPLETE_ERROR;
  delete process.env.MOCK_LLM_STREAM;
});
