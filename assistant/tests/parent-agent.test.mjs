// assistant/tests/parent-agent.test.mjs
import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../../backend/tests/helpers/test-env.js';
import { isToolLoopControlSignal } from '../../backend/llm/tool-loop-control.js';

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

function parseEventLine(line) {
  try {
    return JSON.parse(line.replace(/^data: /, '').trim());
  } catch {
    return null;
  }
}

function setReplyToUser(message, opts = {}) {
  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([
    { name: 'reply_to_user', arguments: { message, ...opts } },
  ]);
  // 工具循环跑完后 mock 仍要返回一段文本（被 mock 用作 completeWithTools 的 text）
  process.env.MOCK_LLM_COMPLETE = '';
}

function clearMockEnv() {
  delete process.env.MOCK_LLM_TOOL_CALLS;
  delete process.env.MOCK_LLM_TOOL_CALLS_QUEUE;
  delete process.env.MOCK_LLM_COMPLETE;
  delete process.env.MOCK_LLM_COMPLETE_QUEUE;
  delete process.env.MOCK_LLM_COMPLETE_ERROR;
  delete process.env.MOCK_LLM_ACTION;
  delete process.env.MOCK_LLM_ACTION_QUEUE;
}

test('plan_doc_updated 事件携带文档全文', async () => {
  const task = taskStore.createTask({ context: { worldId: null } });
  const events = [];
  const fakeRes = { write: (line) => events.push(line) };
  taskStore.attachSse(task.id, fakeRes);
  await planDoc.writePlanDoc(task.id,
    '# 任务：T\n\n> 状态：planning · 创建时间：x\n\n## 用户意图\nx\n\n## 假设与约束\n- 无\n\n## 步骤\n\n- [ ] **step-1** A（world-card.create）\n  - 依赖：无\n  - 任务：a\n');
  taskStore.emit(task.id, { type: 'plan_doc_updated', taskId: task.id, content: 'demo' });
  assert.match(events.at(-1), /plan_doc_updated/);
  assert.match(events.at(-1), /demo/);
  await planDoc.deletePlanDoc(task.id);
});

test('toLLMTool / reply_to_user 工具构造', async () => {
  const exec = async () => 'ok';
  const a = __testables.toLLMTool({ definition: { name: 'foo' }, execute: exec });
  assert.equal(a.function.name, 'foo');
  const b = __testables.toLLMTool({ definition: { type: 'function', function: { name: 'bar' } }, execute: exec });
  assert.equal(b.function.name, 'bar');
  const t = { type: 'function', function: { name: 'baz' }, execute: exec };
  assert.equal(__testables.toLLMTool(t), t);

  const reply = __testables.buildReplyToUserTool();
  assert.equal(reply.definition.name, 'reply_to_user');
  await assert.rejects(
    () => reply.execute({ message: 'done' }),
    (err) => isToolLoopControlSignal(err) && err.kind === 'terminal',
  );
  const empty = await reply.execute({ message: '' });
  assert.equal(empty.success, false);
});

test('buildContextBlock 反映 task 状态与 appliedResources', () => {
  const task = {
    id: 'task-1',
    status: 'running',
    context: { worldId: 'w1', characterId: null },
    appliedResources: [{ kind: 'persona-card', op: 'create', name: 'A', refId: 'p1', at: Date.now() }],
  };
  const block = __testables.buildContextBlock(task, '');
  assert.match(block, /尚未生成/);
  assert.match(block, /本轮已落地变更/);
  assert.match(block, /persona-card/);
  const empty = __testables.buildContextBlock({ id: 't', status: 'running', context: {} }, '');
  assert.match(empty, /本轮尚未落地任何资源/);
});

test('detectPlanFirstPolicy 会识别通用计划边界', () => {
  assert.equal(__testables.detectPlanFirstPolicy('创建一个玩家卡').requiresPlanFirst, true);
  assert.equal(__testables.detectPlanFirstPolicy('新建一个角色').requiresPlanFirst, true);
  assert.equal(__testables.detectPlanFirstPolicy('创建一个世界卡，包含基础状态和世界观条目').requiresPlanFirst, true);
  assert.equal(__testables.detectPlanFirstPolicy('给新的角色卡补全全部状态字段').requiresPlanFirst, true);
  assert.equal(__testables.detectPlanFirstPolicy('删除所有旧的关键词条目').requiresPlanFirst, true);
  assert.equal(__testables.detectPlanFirstPolicy('从零设计一套 lore 和 AI召回条目').requiresPlanFirst, true);
  assert.equal(__testables.detectPlanFirstPolicy('只建一个空白玩家卡，暂不填状态').requiresPlanFirst, false);
  assert.equal(__testables.detectPlanFirstPolicy('创建一个 CSS 片段').requiresPlanFirst, false);
  assert.equal(__testables.detectPlanFirstPolicy('把当前玩家卡金币改成120').requiresPlanFirst, false);
  const task = { id: 't', status: 'running', context: {}, appliedResources: [] };
  const block = __testables.buildContextBlock(task, '', __testables.detectPlanFirstPolicy('从零创建一个角色卡并补全状态').hints);
  assert.match(block, /本轮强制编排提示/);
  assert.match(block, /必须先调用 write_plan_doc/);
});

test('detectPlanFirstPolicy 排除纯查询动词', () => {
  assert.equal(__testables.detectPlanFirstPolicy('完整地展示一下我的角色卡').requiresPlanFirst, false);
  assert.equal(__testables.detectPlanFirstPolicy('告诉我现在有哪些条目').requiresPlanFirst, false);
  assert.equal(__testables.detectPlanFirstPolicy('帮我查看一下全部世界卡').requiresPlanFirst, false);
  // 含写入意图时即使有"展示"字样也应触发
  assert.equal(__testables.detectPlanFirstPolicy('展示完整角色卡，再补全所有字段').requiresPlanFirst, true);
});

test('claimedExecutionWithoutRealAction 在无 tool_call 时不再误伤纯解释回复', () => {
  const task = { id: 't', messages: [], appliedResources: [] };
  assert.equal(
    __testables.claimedExecutionWithoutRealAction(task, 0, 0, '调用子代理是 agent loop 中的派发机制，下面解释 dispatch_subagent 流程。'),
    false,
    '纯解释 + 零工具调用应直接放行',
  );
  // 模型曾尝试工具但什么也没做，又声称已经派发：仍应识别
  const taskWithCall = {
    id: 't2',
    messages: [{ id: 'c1', role: 'tool_call', toolName: 'preview_card', status: 'done' }],
    appliedResources: [],
  };
  assert.equal(
    __testables.claimedExecutionWithoutRealAction(taskWithCall, 0, 0, '我已经派发子代理完成了写入。'),
    true,
    '有 tool_call 但无 dispatch + 无 applied → 仍触发',
  );
});

test('buildModelMessages 过滤工具、步骤、计划 UI 记录', () => {
  const task = {
    id: 'task-1',
    messages: [
      { id: 'u1', role: 'user', content: '需求' },
      { id: 'call-1', role: 'tool_call', toolName: 'preview_card', status: 'done' },
      { id: 'step-1', role: 'step', title: '执行', status: 'done' },
      { id: 'plan-doc-task-1', role: 'plan_doc', content: '# plan' },
      { id: 'a1', role: 'assistant', content: '回复' },
    ],
  };
  const history = __testables.getModelHistoryMessages(task);
  assert.deepEqual(history.map((m) => m.role), ['user', 'assistant']);
  const payload = __testables.buildModelMessages(task, 'system', 'ctx');
  assert.deepEqual(payload.messages.map((m) => m.role), ['system', 'user', 'assistant', 'user']);
  assert.equal(payload.tailMessageCount, 2);
});

test('buildMetaTools：5 个工具与各分支', async () => {
  const task = taskStore.createTask({ context: {} });
  const events = [];
  taskStore.attachSse(task.id, { write: (l) => events.push(l) });
  const tools = __testables.buildMetaTools(task, (e) => taskStore.emit(task.id, e));
  assert.equal(tools.length, 5);

  const writePlan = tools[0];
  assert.equal(writePlan.definition.name, 'write_plan_doc');
  await assert.rejects(
    () => writePlan.execute({
      title: 'T',
      intent: '描述',
      steps: [{ title: '建世界', targetType: 'world-card', operation: 'create', task: '...' }],
    }),
    (err) => isToolLoopControlSignal(err) && err.kind === 'awaiting_approval',
  );
  assert.equal(task.status, 'awaiting_approval');
  const types = events.map((e) => parseEventLine(e)?.type);
  assert.ok(types.includes('plan_doc_updated'));
  assert.ok(types.includes('awaiting_approval'));

  const editPlan = tools[1];
  assert.equal((await editPlan.execute({ op: 'append_log', line: 'log-1' })).success, false);
  assert.equal((await editPlan.execute({ op: 'mark_done' })).success, false);
});

test('dispatch_subagent: 已 applied 过 create 时拒绝重复', async () => {
  const task = taskStore.createTask({ context: {} });
  taskStore.recordAppliedResource(task.id, { kind: 'persona-card', op: 'create', name: 'A', refId: 'p1' });
  const tools = __testables.buildMetaTools(task, () => {});
  const dispatch = tools[2];
  const r = await dispatch.execute({ targetType: 'persona-card', operation: 'create', task: '再建一个' });
  assert.equal(r.success, false);
  assert.match(r.error, /本轮已经成功创建过/);
  const r2 = await dispatch.execute({ targetType: 'persona-card', operation: 'create', task: '再建一个', force: true });
  // force:true 通过去重，但因 mock LLM 没装备工具调用流水，依然以 ok:true/false 形式返回（这里只验证不被去重拦住）
  assert.notEqual(r2.error, r.error);
});

test('dispatch_subagent: 状态密集型任务未写计划时拒绝直接派发', async () => {
  const task = taskStore.createTask({ context: {} });
  const tools = __testables.buildMetaTools(task, () => {}, null, { requiresPlanFirst: true, planDocExists: false });
  const dispatch = tools[2];
  const r = await dispatch.execute({ targetType: 'persona-card', operation: 'create', task: '创建玩家卡并填写全部状态字段' });
  assert.equal(r.success, false);
  assert.match(r.error, /必须先调用 write_plan_doc/);
});

test('runParentAgent: reply_to_user 终态走 task_completed', async () => {
  setReplyToUser('hello');
  const task = taskStore.createTask({ context: { worldId: null } });
  const events = [];
  taskStore.attachSse(task.id, { write: (l) => events.push(l) });
  await runParentAgent(task, '你好');
  const parsed = events.map(parseEventLine).filter(Boolean);
  assert.ok(parsed.some((e) => e.type === 'task_completed'));
  assert.ok(parsed.some((e) => e.done === true));
  assert.equal(task.status, 'completed');
  assert.equal(task.messages.at(-1).content, 'hello');
  clearMockEnv();
});

test('runParentAgent: reply_to_user(status="failed") 走 task_failed（非软失败）', async () => {
  setReplyToUser('搞砸了', { status: 'failed' });
  const task = taskStore.createTask({ context: {} });
  const events = [];
  taskStore.attachSse(task.id, { write: (l) => events.push(l) });
  await runParentAgent(task, '试一下');
  const parsed = events.map(parseEventLine).filter(Boolean);
  assert.ok(parsed.some((e) => e.type === 'task_failed'));
  assert.equal(task.status, 'failed');
  assert.ok(!String(task.error ?? '').startsWith(taskStore.HARNESS_ERROR_PREFIX));
  clearMockEnv();
});

test('runParentAgent: 模型空返回 → 暂停并给出可继续提示', async () => {
  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([]);
  process.env.MOCK_LLM_COMPLETE = '';
  const task = taskStore.createTask({ context: {} });
  const events = [];
  taskStore.attachSse(task.id, { write: (line) => events.push(line) });
  await runParentAgent(task, '没回应试试');
  const parsed = events.map(parseEventLine).filter(Boolean);
  assert.equal(task.status, 'paused');
  assert.equal(task.error, undefined);
  assert.ok(parsed.some((e) => e.type === 'paused'));
  assert.ok(parsed.some((e) => e.done === true));
  assert.match(task.messages.at(-1).content, /没有拿到有效的模型回复/);
  clearMockEnv();
});

test('runParentAgent: 自然文本回复（无工具调用）也算 completed', async () => {
  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([]);
  process.env.MOCK_LLM_COMPLETE = '这是直接回答，不需要修改任何卡片。';
  const task = taskStore.createTask({ context: {} });
  taskStore.attachSse(task.id, { write: () => {} });
  await runParentAgent(task, '问个问题');
  assert.equal(task.status, 'completed');
  assert.equal(task.messages.at(-1).content, '这是直接回答，不需要修改任何卡片。');
  clearMockEnv();
});

test('runParentAgent: 口头声称派发子代理但本轮没真实 dispatch → 暂停且不误报完成', async () => {
  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([
    { name: 'preview_card', arguments: { target: 'global-prompt' } },
  ]);
  process.env.MOCK_LLM_COMPLETE = '已确认现状。现在派发子代理为当前玩家卡填入全部初始状态值。';
  const task = taskStore.createTask({ context: {} });
  const events = [];
  taskStore.attachSse(task.id, { write: (line) => events.push(line) });
  await runParentAgent(task, '填入所有初始值');
  const parsed = events.map(parseEventLine).filter(Boolean);
  assert.equal(task.status, 'paused');
  assert.equal(task.error, undefined);
  assert.ok(parsed.some((e) => e.type === 'paused'));
  assert.ok(parsed.some((e) => e.done === true));
  assert.equal(task.messages.some((m) => m.role === 'step'), false);
  assert.match(task.messages.at(-1).content, /没有拿到真实的子代理执行记录/);
  clearMockEnv();
});

test('runParentAgent: write_plan_doc 后停在 awaiting_approval（不发 done）', async () => {
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
  process.env.MOCK_LLM_COMPLETE = '';
  const task = taskStore.createTask({ context: {} });
  const events = [];
  taskStore.attachSse(task.id, { write: (l) => events.push(l) });
  await runParentAgent(task, '帮我建个世界');
  assert.equal(task.status, 'awaiting_approval');
  const types = events.map((e) => parseEventLine(e)?.type);
  assert.ok(types.includes('awaiting_approval'));
  assert.equal(events.some((e) => /"done":\s*true/.test(e)), false);
  assert.equal(events.some((e) => /"type":"delta"/.test(e)), false);
  await planDoc.deletePlanDoc(task.id);
  clearMockEnv();
});

test('runParentAgent: approved sentinel 不写入可见 user 消息', async () => {
  setReplyToUser('ok');
  const task = taskStore.createTask({ context: {} });
  taskStore.attachSse(task.id, { write: () => {} });
  await runParentAgent(task, __testables.APPROVED_SENTINEL);
  const firstUser = task.messages.find((m) => m.role === 'user');
  assert.equal(firstUser, undefined);
  clearMockEnv();
});

test('runParentAgent: resume sentinel 不写入可见 user 消息', async () => {
  setReplyToUser('继续执行');
  const task = taskStore.createTask({ context: {} });
  taskStore.attachSse(task.id, { write: () => {} });
  await runParentAgent(task, __testables.RESUME_SENTINEL);
  const firstUser = task.messages.find((m) => m.role === 'user');
  assert.equal(firstUser, undefined);
  clearMockEnv();
});

test('runParentAgent: 新一轮 user 输入清空 appliedResources', async () => {
  setReplyToUser('done');
  const task = taskStore.createTask({ context: {} });
  taskStore.recordAppliedResource(task.id, { kind: 'persona-card', op: 'create', name: 'A' });
  assert.equal(task.appliedResources.length, 1);
  taskStore.attachSse(task.id, { write: () => {} });
  await runParentAgent(task, '新的一轮');
  assert.equal(task.appliedResources.length, 0);
  clearMockEnv();
});

test('runParentAgent: 启动时 drain pendingUserMessages 写入历史', async () => {
  setReplyToUser('all read');
  const task = taskStore.createTask({ context: {} });
  taskStore.queueUserMessage(task.id, '中途追问1');
  taskStore.queueUserMessage(task.id, '中途追问2');
  taskStore.attachSse(task.id, { write: () => {} });
  await runParentAgent(task, '本轮主消息');
  const userContents = task.messages.filter((m) => m.role === 'user').map((m) => m.content);
  assert.ok(userContents.includes('本轮主消息'));
  assert.ok(userContents.includes('中途追问1'));
  assert.ok(userContents.includes('中途追问2'));
  assert.equal(task.pendingUserMessages.length, 0);
  clearMockEnv();
});

test('runParentAgent: SSE 事件携带 runId', async () => {
  setReplyToUser('hi');
  const task = taskStore.createTask({ context: {} });
  const events = [];
  taskStore.attachSse(task.id, { write: (l) => events.push(l) });
  await runParentAgent(task, '你好');
  const parsed = events.map(parseEventLine).filter(Boolean);
  const withoutRun = parsed.filter((e) => typeof e.runId !== 'string' || e.runId.length === 0);
  assert.equal(withoutRun.length, 0);
  const ids = new Set(parsed.map((e) => e.runId));
  assert.equal(ids.size, 1);
  clearMockEnv();
});

test('runParentAgent: 伪流式 delta 之间让出事件循环，cancel 可中断', async () => {
  setReplyToUser('a'.repeat(220));
  const task = taskStore.createTask({ context: {} });
  const events = [];
  let cancelScheduled = false;
  taskStore.attachSse(task.id, {
    write: (line) => {
      events.push(line);
      if (!cancelScheduled && /"type":"delta"/.test(line)) {
        cancelScheduled = true;
        setImmediate(() => taskStore.setStatus(task.id, 'cancelled'));
      }
    },
  });

  await runParentAgent(task, '长回复');

  const deltas = events.filter((e) => /"type":"delta"/.test(e));
  assert.ok(deltas.length >= 1);
  assert.ok(deltas.length < 5);
  assert.equal(task.status, 'cancelled');
  clearMockEnv();
});

test('runParentAgent: provider 抛错 → 暂停保留上下文并允许继续', async () => {
  process.env.MOCK_LLM_COMPLETE_ERROR = 'provider exploded';
  const task = taskStore.createTask({ context: {} });
  const events = [];
  taskStore.attachSse(task.id, { write: (l) => events.push(l) });
  await runParentAgent(task, '试一下');
  const parsed = events.map(parseEventLine).filter(Boolean);
  assert.equal(task.status, 'paused');
  assert.equal(task.error, undefined);
  assert.ok(parsed.some((e) => e.type === 'paused'));
  assert.ok(parsed.some((e) => e.done === true));
  assert.match(task.messages.at(-1).content, /模型调用没有成功/);
  clearMockEnv();
});

test('runParentAgent: happy path（write_plan_doc → approve → dispatch_subagent → reply_to_user）', async () => {
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
  process.env.MOCK_LLM_COMPLETE = '';

  const task = taskStore.createTask({ context: { worldId: null } });
  const events = [];
  taskStore.attachSse(task.id, { write: (l) => events.push(l) });

  await runParentAgent(task, '帮我建个世界');
  assert.equal(task.status, 'awaiting_approval');

  taskStore.setStatus(task.id, 'running');
  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([
    { name: 'dispatch_subagent', arguments: { stepId: 'step-1' } },
    { name: 'reply_to_user', arguments: { message: '世界已创建' } },
  ]);
  process.env.MOCK_LLM_COMPLETE = '';

  const phase2Start = events.length;
  await runParentAgent(task, __testables.APPROVED_SENTINEL);
  assert.equal(task.status, 'completed');

  const phase2Events = events.slice(phase2Start).map(parseEventLine).filter(Boolean);
  const phase2Types = phase2Events.map((e) => e.type);
  assert.ok(phase2Types.includes('step_started'));
  assert.ok(phase2Types.includes('task_completed'));
  assert.equal(phase2Events.some((e) => e.type === 'delta'), true);
  assert.ok(task.messages.find((m) => m.role === 'assistant' && m.content === '世界已创建'));

  await planDoc.deletePlanDoc(task.id).catch(() => {});
  clearMockEnv();
});

test('edit_plan_doc.replace_steps: 已完成步骤被强制保留', async () => {
  const task = taskStore.createTask({ context: {} });
  taskStore.attachSse(task.id, { write: () => {} });
  const tools = __testables.buildMetaTools(task, () => {});

  const md = [
    '# 任务：T',
    '',
    '> 状态：running · 创建时间：x',
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
  ].join('\n');
  await planDoc.writePlanDoc(task.id, md);

  const editPlan = tools[1];
  const r = await editPlan.execute({
    op: 'replace_steps',
    steps: [{ title: '只剩这个', targetType: 'character-card', operation: 'update', task: 't' }],
  });
  assert.equal(r.success, true);

  const newMd = await planDoc.readPlanDoc(task.id);
  const parsed = planDoc.parsePlanDoc(newMd);
  const doneStep = parsed.steps.find((s) => s.id === 'step-1');
  assert.ok(doneStep);
  assert.equal(doneStep.done, true);
  assert.match(newMd, /完成于 12:00:00/);

  await planDoc.deletePlanDoc(task.id);
});
