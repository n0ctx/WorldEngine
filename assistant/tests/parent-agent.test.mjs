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

function threePlanSteps(prefix = '步骤') {
  return [
    { title: `${prefix}一`, targetType: 'world-card', operation: 'update', task: `${prefix}一` },
    { title: `${prefix}二`, targetType: 'world-card', operation: 'update', task: `${prefix}二` },
    { title: `${prefix}三`, targetType: 'world-card', operation: 'update', task: `${prefix}三` },
  ];
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

test('extractHardConstraints 抽取字段名/ID/必须禁止类硬约束', () => {
  const messages = [
    { role: 'user', content: '字段名必须用 player_hp，不能用别的拼法' },
    { role: 'user', content: '目标世界 ID = world-abc' },
    { role: 'user', content: '不要删除任何已有条目，只新增' },
    { role: 'user', content: '随便聊聊天气和心情' },
  ];
  const out = __testables.extractHardConstraints(messages);
  const joined = out.join(' | ');
  assert.match(joined, /字段名必须用 player_hp/);
  assert.match(joined, /world-abc/);
  assert.match(joined, /不要删除/);
  assert.ok(!joined.includes('随便聊聊天气'), '纯闲聊不应被当成硬约束');
});

test('extractHardConstraints 去重并限制条数', () => {
  const messages = [
    { role: 'user', content: '必须用 player_hp' },
    { role: 'user', content: '必须用 player_hp' },
  ];
  const out = __testables.extractHardConstraints(messages);
  assert.equal(out.length, 1);
});

test('恢复文案不再含技术术语', () => {
  const empty = __testables.buildEmptyReplyRecoveryMessage();
  const claimed = __testables.buildClaimedExecutionRecoveryMessage();
  const provider = __testables.buildProviderErrorRecoveryMessage(new Error('boom'));
  for (const text of [empty, claimed, provider]) {
    assert.ok(!/模型调用|子代理执行记录|harness/i.test(text), `不应露技术术语：${text}`);
    assert.ok(text.length > 0);
  }
  assert.match(provider, /boom/, 'provider 错误消息中应保留底层 error');
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

test('buildMetaTools：4 个工具与各分支', async () => {
  const task = taskStore.createTask({ context: {} });
  const events = [];
  taskStore.attachSse(task.id, { write: (l) => events.push(l) });
  const tools = __testables.buildMetaTools(task, (e) => taskStore.emit(task.id, e));
  assert.equal(tools.length, 4);

  const writePlan = tools[0];
  assert.equal(writePlan.definition.name, 'write_plan_doc');
  await assert.rejects(
    () => writePlan.execute({
      title: 'T',
      intent: '描述',
      steps: threePlanSteps('建世界'),
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

test('write_plan_doc: 少于 3 个 step 时拒绝且不进入审批态', async () => {
  const task = taskStore.createTask({ context: {} });
  const events = [];
  const tools = __testables.buildMetaTools(task, (e) => events.push(e));
  const writePlan = tools[0];
  const r = await writePlan.execute({
    title: '单步计划',
    intent: '只做一件事',
    steps: [{ title: '建世界', targetType: 'world-card', operation: 'create', task: '创建空世界卡' }],
  });
  assert.equal(r.success, false);
  assert.match(r.error, /至少需要 3 个/);
  assert.equal(task.status, 'idle');
  assert.equal(task.approvalCheckpoint, null);
  assert.equal(await planDoc.readPlanDoc(task.id), '');
  assert.deepEqual(events.map((e) => e.type), []);
});

test('write_plan_doc: 已批准续跑阶段拒绝二次计划', async () => {
  const task = taskStore.createTask({ context: {} });
  taskStore.setStatus(task.id, 'running');
  const tools = __testables.buildMetaTools(task, () => {}, null, { planAlreadyApproved: true });
  const writePlan = tools[0];
  const r = await writePlan.execute({
    title: '重复计划',
    intent: '重复确认',
    steps: threePlanSteps('重复'),
  });
  assert.equal(r.success, false);
  assert.match(r.error, /当前计划已批准/);
  assert.equal(task.status, 'running');
  assert.equal(await planDoc.readPlanDoc(task.id), '');
});

test('dispatch_subagent: 已 applied 过 create 时拒绝重复', async () => {
  const task = taskStore.createTask({ context: {} });
  taskStore.recordAppliedResource(task.id, { kind: 'persona-card', op: 'create', name: 'A', refId: 'p1' });
  const tools = __testables.buildMetaTools(task, () => {});
  const dispatch = tools[2];
  const r = await dispatch.execute({ targetType: 'persona-card', operation: 'create', task: '再建一个' });
  assert.equal(r.success, false);
  assert.match(r.error, /本轮已经成功创建过/);
  await assert.rejects(
    dispatch.execute({ targetType: 'persona-card', operation: 'create', task: '再建一个', force: true }),
    (err) => err?.kind === 'paused' && /子代理未成功/.test(String(err?.payload?.error ?? '')),
  );
});

test('dispatch_subagent: 状态密集型任务未写计划时拒绝直接派发', async () => {
  const task = taskStore.createTask({ context: {} });
  const tools = __testables.buildMetaTools(task, () => {}, null, { requiresPlanFirst: true, planDocExists: false });
  const dispatch = tools[2];
  const r = await dispatch.execute({ targetType: 'persona-card', operation: 'create', task: '创建玩家卡并填写全部状态字段' });
  assert.equal(r.success, false);
  assert.match(r.error, /必须先调用 write_plan_doc/);
});

test('dispatch_subagent: awaiting_approval 阶段拒绝直接执行，必须先等用户确认', async () => {
  const task = taskStore.createTask({ context: {} });
  taskStore.setStatus(task.id, 'awaiting_approval');
  taskStore.setApprovalCheckpoint(task.id, { title: '待确认计划', stepCount: 3, status: 'pending' });
  const tools = __testables.buildMetaTools(task, () => {}, null, { planDocExists: true, planApprovalPending: true });
  const dispatch = tools[2];
  const r = await dispatch.execute({ stepId: 'step-1' });
  assert.equal(r.success, false);
  assert.match(r.error, /还在等待用户审批/);
});

test('dispatch_subagent: 计划被拒后保留旧 plan doc 时，必须先重提方案再审批', async () => {
  const task = taskStore.createTask({ context: {} });
  await planDoc.writePlanDoc(task.id, planDoc.renderPlanDoc({
    title: '旧计划',
    status: 'paused',
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
    intent: '测试 reject 后绕过审批',
    assumptions: [],
    steps: threePlanSteps('旧步骤'),
  }));
  const tools = __testables.buildMetaTools(task, () => {}, null, {
    requiresPlanFirst: true,
    planDocExists: true,
    planRejectedNeedsRewrite: true,
  });
  const dispatch = tools[2];
  const r = await dispatch.execute({ stepId: 'step-1' });
  assert.equal(r.success, false);
  assert.match(r.error, /上一版计划已被用户拒绝/);
  await planDoc.deletePlanDoc(task.id);
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
  // 暂停时 task.error 打 harness 恢复暂停标记，客户端依此跳过自动 resume。
  assert.equal(task.error, 'harness recoverable pause');
  assert.ok(parsed.some((e) => e.type === 'paused'));
  assert.ok(parsed.some((e) => e.done === true));
  // 恢复文案以紧凑 step 条目渲染而非完整 assistant 气泡。
  const harnessStep = task.messages.find((m) => m.role === 'step' && typeof m.stepId === 'string' && m.stepId.startsWith('harness-'));
  assert.ok(harnessStep, '应有一条 harness step 记录');
  assert.match(harnessStep.title, /没拿到完整回复/);
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
  assert.equal(task.error, 'harness recoverable pause');
  assert.ok(parsed.some((e) => e.type === 'paused'));
  assert.ok(parsed.some((e) => e.done === true));
  // harness step 之外不应留下真正的执行 step；仅 dispatch 派发或 sub-agent 才会写 step
  assert.equal(
    task.messages.some((m) => m.role === 'step' && typeof m.stepId === 'string' && !m.stepId.startsWith('harness-')),
    false,
  );
  const harnessStep = task.messages.find((m) => m.role === 'step' && typeof m.stepId === 'string' && m.stepId.startsWith('harness-'));
  assert.ok(harnessStep, '应有一条 harness step 记录');
  assert.match(harnessStep.title, /没真正落库/);
  clearMockEnv();
});

test('runParentAgent: write_plan_doc 后停在 awaiting_approval（不发 done）', async () => {
  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([
    {
      name: 'write_plan_doc',
      arguments: {
        title: 'T',
        intent: '建一个世界',
        steps: threePlanSteps('建世界'),
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

test('runParentAgent: 用户拒绝旧计划后写新计划 → 旧 plan_doc 文件被清掉、PLAN_REJECTED 标记清零', async () => {
  // 先模拟一份旧计划被拒绝的状态
  const task = taskStore.createTask({ context: {} });
  await planDoc.writePlanDoc(task.id, '# 旧方案\n\n- [ ] 旧步骤一\n- [ ] 旧步骤二');
  taskStore.setStatus(task.id, 'paused', { error: 'plan rejected by user' });
  assert.equal(await planDoc.readPlanDoc(task.id), '# 旧方案\n\n- [ ] 旧步骤一\n- [ ] 旧步骤二');

  // LLM 在下一轮调用 write_plan_doc 提交全新方案
  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([
    {
      name: 'write_plan_doc',
      arguments: {
        title: '新方案',
        intent: '换个方向',
        steps: threePlanSteps('新步骤'),
      },
    },
  ]);
  process.env.MOCK_LLM_COMPLETE = '';
  taskStore.attachSse(task.id, { write: () => {} });
  await runParentAgent(task, '换个方向重写');

  // 新方案进入 awaiting_approval；旧的 PLAN_REJECTED 错误标记被清除
  assert.equal(task.status, 'awaiting_approval');
  assert.equal(task.error, undefined);
  // 计划文件只保留新方案的内容（write 之前显式 delete 过，确保旧内容彻底覆盖）
  const md = await planDoc.readPlanDoc(task.id);
  assert.ok(!md.includes('旧步骤一'));
  assert.ok(!md.includes('旧方案'));
  assert.match(md, /新方案/);
  assert.match(md, /新步骤/);

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

test('runParentAgent: 连续工具失败暂停会持久化 pause reason，供前端跳过自动恢复', async () => {
  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([
    { name: 'write_plan_doc', arguments: { title: 'T1', intent: 'i1', steps: [{ title: '短计划', targetType: 'world-card', operation: 'create', task: 'a' }] } },
    { name: 'write_plan_doc', arguments: { title: 'T2', intent: 'i2', steps: [{ title: '短计划', targetType: 'world-card', operation: 'create', task: 'a' }] } },
    { name: 'write_plan_doc', arguments: { title: 'T3', intent: 'i3', steps: [{ title: '短计划', targetType: 'world-card', operation: 'create', task: 'a' }] } },
  ]);
  process.env.MOCK_LLM_COMPLETE = '';
  const task = taskStore.createTask({ context: {} });
  const events = [];
  taskStore.attachSse(task.id, { write: (line) => events.push(line) });
  await runParentAgent(task, '连续失败试一下');
  const parsed = events.map(parseEventLine).filter(Boolean);
  assert.equal(task.status, 'paused');
  assert.equal(task.error, __testables.CONSECUTIVE_TOOL_FAILURES_PAUSE_REASON);
  assert.ok(parsed.some((e) => e.type === 'paused' && e.reason === __testables.CONSECUTIVE_TOOL_FAILURES_PAUSE_REASON));
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
  assert.equal(task.error, 'harness recoverable pause');
  assert.ok(parsed.some((e) => e.type === 'paused'));
  assert.ok(parsed.some((e) => e.done === true));
  const harnessStep = task.messages.find((m) => m.role === 'step' && typeof m.stepId === 'string' && m.stepId.startsWith('harness-'));
  assert.ok(harnessStep, '应有一条 harness step 记录');
  assert.match(harnessStep.title, /刚才处理时出了点问题/);
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
          { title: '补条目', targetType: 'world-card', operation: 'update', task: '补充基础条目' },
          { title: '核对', targetType: 'world-card', operation: 'update', task: '核对世界卡内容' },
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
  process.env.MOCK_LLM_TOOL_CALLS_QUEUE = JSON.stringify([
    [
      { name: 'dispatch_subagent', arguments: { stepId: 'step-1' } },
      { name: 'reply_to_user', arguments: { message: '世界已创建' } },
    ],
    [
      {
        name: 'apply_world_card',
        arguments: {
          operation: 'create',
          changes: { name: '测试世界', description: '描述' },
        },
      },
    ],
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

test('runParentAgent: 子代理失败时立即暂停，不再继续输出完成口径', async () => {
  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([
    {
      name: 'write_plan_doc',
      arguments: {
        title: '建一个世界',
        intent: '用户想要新建一个世界卡',
        steps: [
          { title: '建世界', targetType: 'world-card', operation: 'create', task: '创建空世界卡' },
          { title: '补条目', targetType: 'world-card', operation: 'update', task: '补充基础条目' },
          { title: '核对', targetType: 'world-card', operation: 'update', task: '核对世界卡内容' },
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
  process.env.MOCK_LLM_TOOL_CALLS_QUEUE = JSON.stringify([
    [
      { name: 'dispatch_subagent', arguments: { stepId: 'step-1' } },
      { name: 'reply_to_user', arguments: { message: '世界已创建' } },
    ],
    [],
  ]);
  process.env.MOCK_LLM_COMPLETE = '子代理嘴上说已经做完，但实际上没有落库。';

  const phaseStart = events.length;
  await runParentAgent(task, __testables.APPROVED_SENTINEL);

  const phaseEvents = events.slice(phaseStart).map(parseEventLine).filter(Boolean);
  assert.equal(task.status, 'paused');
  assert.equal(task.error, 'harness recoverable pause');
  assert.ok(phaseEvents.some((e) => e.type === 'paused'));
  assert.equal(phaseEvents.some((e) => e.type === 'task_completed'), false);
  assert.equal(task.messages.some((m) => m.role === 'assistant' && m.content === '世界已创建'), false);
  assert.match(task.messages.at(-1).content, /执行失败/);

  await planDoc.deletePlanDoc(task.id).catch(() => {});
  clearMockEnv();
});

test('runParentAgent: approve 后模型再次 write_plan_doc 会被拒绝且不回到 awaiting_approval', async () => {
  const task = taskStore.createTask({ context: {} });
  await planDoc.writePlanDoc(task.id, planDoc.renderPlanDoc({
    title: '已确认计划',
    status: 'awaiting_approval',
    createdAt: '2026-05-13T00:00:00.000Z',
    updatedAt: '2026-05-13T00:00:00.000Z',
    intent: '测试重复确认',
    assumptions: [],
    steps: threePlanSteps('已确认'),
  }));
  taskStore.setStatus(task.id, 'running');
  const events = [];
  taskStore.attachSse(task.id, { write: (l) => events.push(l) });

  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([
    {
      name: 'write_plan_doc',
      arguments: {
        title: '重复计划',
        intent: '模型误要求二次确认',
        steps: threePlanSteps('重复'),
      },
    },
    { name: 'reply_to_user', arguments: { message: '继续执行，不再重复确认。' } },
  ]);
  process.env.MOCK_LLM_COMPLETE = '';

  const phaseStart = events.length;
  await runParentAgent(task, __testables.APPROVED_SENTINEL);
  assert.equal(task.status, 'completed');
  const phaseEvents = events.slice(phaseStart).map(parseEventLine).filter(Boolean);
  assert.equal(phaseEvents.some((e) => e.type === 'awaiting_approval'), false);
  assert.equal(phaseEvents.some((e) => e.type === 'plan_doc_updated'), false);
  assert.ok(task.messages.find((m) => m.role === 'assistant' && m.content === '继续执行，不再重复确认。'));

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
  const tooShort = await editPlan.execute({
    op: 'replace_steps',
    steps: [{ title: '只剩这个', targetType: 'character-card', operation: 'update', task: 't' }],
  });
  assert.equal(tooShort.success, false);
  assert.match(tooShort.error, /replace_steps 至少需要 3 个未完成步骤/);

  await assert.rejects(
    editPlan.execute({
      op: 'replace_steps',
      steps: [
        { title: '只剩这个-1', targetType: 'character-card', operation: 'update', task: 't1' },
        { title: '只剩这个-2', targetType: 'character-card', operation: 'update', task: 't2' },
        { title: '只剩这个-3', targetType: 'character-card', operation: 'update', task: 't3' },
      ],
    }),
    (err) => err?.kind === 'awaiting_approval',
  );

  const newMd = await planDoc.readPlanDoc(task.id);
  const parsed = planDoc.parsePlanDoc(newMd);
  const doneStep = parsed.steps.find((s) => s.id === 'step-1');
  assert.ok(doneStep);
  assert.equal(doneStep.done, true);
  assert.match(newMd, /完成于 12:00:00/);

  await planDoc.deletePlanDoc(task.id);
});

test('edit_plan_doc.replace_steps: 保留 intent / assumptions / createdAt，仅刷新 updatedAt', async () => {
  const task = taskStore.createTask({ context: {} });
  taskStore.attachSse(task.id, { write: () => {} });

  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([
    {
      name: 'write_plan_doc',
      arguments: {
        title: '建世界 X',
        intent: '用户要建一个完整的赛博朋克世界',
        assumptions: ['世界尚未存在', 'persona 已就位'],
        steps: threePlanSteps('建世界'),
      },
    },
  ]);
  process.env.MOCK_LLM_COMPLETE = '';
  await runParentAgent(task, '建一个赛博朋克世界');
  assert.equal(task.status, 'awaiting_approval');
  const before = planDoc.parsePlanDoc(await planDoc.readPlanDoc(task.id));
  assert.equal(before.intent, '用户要建一个完整的赛博朋克世界');
  assert.deepEqual(before.assumptions, ['世界尚未存在', 'persona 已就位']);
  assert.ok(before.createdAt);

  const tools = __testables.buildMetaTools(task, () => {});
  const editPlan = tools[1];
  await assert.rejects(
    editPlan.execute({
      op: 'replace_steps',
      steps: [
        { title: '改后步骤-1', targetType: 'world-card', operation: 'create', task: '重新建 1' },
        { title: '改后步骤-2', targetType: 'world-card', operation: 'update', task: '重新建 2' },
        { title: '改后步骤-3', targetType: 'world-card', operation: 'update', task: '重新建 3' },
      ],
    }),
    (err) => err?.kind === 'awaiting_approval',
  );

  const after = planDoc.parsePlanDoc(await planDoc.readPlanDoc(task.id));
  assert.equal(after.intent, before.intent);
  assert.deepEqual(after.assumptions, before.assumptions);
  assert.equal(after.createdAt, before.createdAt);
  assert.ok(after.updatedAt);

  await planDoc.deletePlanDoc(task.id);
  clearMockEnv();
});

test('edit_plan_doc.replace_steps: 计划批准后禁止执行中重写并重新进入审批', async () => {
  const task = taskStore.createTask({ context: {} });
  const md = planDoc.renderPlanDoc({
    title: '已批准计划',
    status: 'running',
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
    intent: '执行中禁止改计划',
    assumptions: [],
    steps: threePlanSteps('执行中步骤'),
  });
  await planDoc.writePlanDoc(task.id, md);
  taskStore.setStatus(task.id, 'running');
  taskStore.setApprovalCheckpoint(task.id, {
    title: '已批准计划',
    stepCount: 3,
    status: 'approved',
    approvedAt: Date.now(),
  });

  const tools = __testables.buildMetaTools(task, () => {}, null, { planExecutionApproved: true });
  const editPlan = tools[1];
  const r = await editPlan.execute({
    op: 'replace_steps',
    steps: [
      { title: '改后步骤-1', targetType: 'world-card', operation: 'update', task: '改后 1' },
      { title: '改后步骤-2', targetType: 'world-card', operation: 'update', task: '改后 2' },
      { title: '改后步骤-3', targetType: 'world-card', operation: 'update', task: '改后 3' },
    ],
  });
  assert.equal(r.success, false);
  assert.match(r.error, /执行中重写未完成步骤/);
  assert.equal(await planDoc.readPlanDoc(task.id), md);
  await planDoc.deletePlanDoc(task.id);
});

test('runParentAgent: 终态收尾时清空 approvalCheckpoint，避免旧计划污染下一轮', async () => {
  setReplyToUser('执行完成');
  const task = taskStore.createTask({ context: {} });
  taskStore.setApprovalCheckpoint(task.id, {
    title: '旧计划',
    stepCount: 3,
    status: 'approved',
    approvedAt: Date.now(),
  });
  await runParentAgent(task, '继续执行');
  assert.equal(task.status, 'completed');
  assert.equal(task.approvalCheckpoint, null);
  clearMockEnv();
});

test('normalizeVisibleAssistantText: 仅归一化普通文案中的字面量换行', () => {
  assert.equal(
    __testables.normalizeVisibleAssistantText('第一行\\n第二行'),
    '第一行\n第二行',
  );
  assert.equal(
    __testables.normalizeVisibleAssistantText('正则 /foo\\nbar/ 不应被改写'),
    '正则 /foo\\nbar/ 不应被改写',
  );
  assert.equal(
    __testables.normalizeVisibleAssistantText('```json\\n{\"a\":1}\\n```'),
    '```json\\n{"a":1}\\n```',
  );
});

test('edit_plan_doc.replace_steps: 校验失败时拒绝写入', async () => {
  const task = taskStore.createTask({ context: {} });
  taskStore.attachSse(task.id, { write: () => {} });

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
    '- [ ] **step-1** A（world-card.create）',
    '  - 依赖：无',
    '  - 任务：a',
    '',
  ].join('\n');
  await planDoc.writePlanDoc(task.id, md);

  const tools = __testables.buildMetaTools(task, () => {});
  const editPlan = tools[1];
  // 步骤缺少 task 字段 → validatePlanDoc 应失败
  const r = await editPlan.execute({
    op: 'replace_steps',
    steps: [
      { title: '不完整-1', targetType: 'world-card', operation: 'update' },
      { title: '不完整-2', targetType: 'world-card', operation: 'update' },
      { title: '不完整-3', targetType: 'world-card', operation: 'update' },
    ],
  });
  assert.equal(r.success, false);
  assert.match(r.error, /校验失败|缺少/);

  await planDoc.deletePlanDoc(task.id);
});
