import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../../backend/tests/helpers/test-env.js';
import { insertWorld } from '../../backend/tests/helpers/fixtures.js';

const sandbox = createTestSandbox('assistant-route-suite');
sandbox.setEnv();

let server;

async function ensureServer() {
  if (server) return server;
  const { createApp } = await freshImport('backend/server.js');
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  return server;
}

async function request(path, init = {}) {
  const appServer = await ensureServer();
  return fetch(`http://127.0.0.1:${appServer.address().port}${path}`, init);
}

after(async () => {
  resetMockEnv();
  if (server) {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
  sandbox.cleanup();
});

function parseSsePayloads(raw) {
  return raw
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const line = block.split('\n').find((item) => item.startsWith('data: '));
      return line ? JSON.parse(line.slice(6)) : null;
    })
    .filter(Boolean);
}

test('POST /api/assistant/chat 对空 message 返回 400', async () => {
  const res = await request('/api/assistant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '   ' }),
  });

  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /message 为必填项/);
});

test('POST /api/assistant/execute 会消费 token 并落库 world-card create', async () => {
  const { __testables } = await import('../server/routes.js');
  __testables.proposalStore.set('token-create-world', {
    expiresAt: Date.now() + 60_000,
    proposal: {
      type: 'world-card',
      operation: 'create',
      explanation: '创建世界',
      changes: {
        name: '新世界',
        system_prompt: '世界设定',
        post_prompt: '后置',
      },
      entryOps: [],
      stateFieldOps: [],
    },
  });

  const res = await request('/api/assistant/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'token-create-world' }),
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.result.name, '新世界');

  const worlds = sandbox.db.prepare('SELECT name, system_prompt, post_prompt FROM worlds').all();
  assert.deepEqual(worlds, [{
    name: '新世界',
    system_prompt: '',
    post_prompt: '',
  }]);
  assert.equal(__testables.proposalStore.has('token-create-world'), false);
});

test('POST /api/assistant/chat 支持多轮 history，并在读取类工具调用时发出 tool_call 事件', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([
    { name: 'preview_card', arguments: { target: 'world-card', operation: 'create' } },
  ]);
  process.env.MOCK_LLM_STREAM_CHUNKS = JSON.stringify(['我', '已经整理好了']);

  const res = await request('/api/assistant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: '继续整理',
      history: [
        { role: 'user', content: '先看一下现状' },
        { role: 'proposal', proposal: { type: 'world-card', operation: 'update', changes: { name: '旧世界' } } },
        { role: 'assistant', content: '上一轮我给过方案。' },
      ],
      context: {},
    }),
  });

  assert.equal(res.status, 200);
  const events = parseSsePayloads(await res.text());
  assert.ok(events.some((event) => event.type === 'tool_call' && event.name === 'preview_card'));
  assert.ok(events.some((event) => event.delta === '我'));
  assert.ok(events.some((event) => event.done === true));
});

test('POST /api/assistant/chat 在子代理工具失败时返回 error 事件，同时保留最终 done', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_TOOL_CALLS = JSON.stringify([
    { name: 'world_card_agent', arguments: { task: '把世界改得更完整', operation: 'update' } },
  ]);
  process.env.MOCK_LLM_COMPLETE_ERROR = 'tool exploded';
  process.env.MOCK_LLM_STREAM_CHUNKS = JSON.stringify(['最终', '回复']);

  const res = await request('/api/assistant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '处理失败场景', context: {} }),
  });

  assert.equal(res.status, 200);
  const events = parseSsePayloads(await res.text());
  assert.ok(events.some((event) => event.type === 'routing' && event.target === 'world-card'));
  assert.ok(events.some((event) => event.type === 'error' && event.error === 'tool exploded'));
  assert.ok(events.some((event) => event.done === true));
});

test('POST /api/assistant/tasks 会返回 plan_ready 任务事件', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE = JSON.stringify({
    mode: 'plan',
    summary: '生成完整计划',
    assumptions: ['默认按简体中文写卡'],
    steps: [
      {
        id: 'step-create-world',
        title: '创建世界卡',
        targetType: 'world-card',
        operation: 'create',
        entityRef: null,
        dependsOn: [],
        task: '创建一个基础世界卡骨架',
        riskLevel: 'low',
      },
    ],
  });

  const res = await request('/api/assistant/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '创建一个蒸汽朋克世界', context: {} }),
  });

  assert.equal(res.status, 200);
  const events = parseSsePayloads(await res.text());
  const taskCreated = events.find((event) => event.type === 'task_created');
  const planReady = events.find((event) => event.type === 'plan_ready');
  assert.ok(taskCreated);
  assert.ok(planReady);
  assert.equal(planReady.task.status, 'awaiting_plan_approval');
  assert.equal(planReady.plan.steps[0].targetType, 'world-card');
});

test('POST /api/assistant/tasks/:taskId/approve-plan 会执行步骤并完成任务', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE = JSON.stringify({
    mode: 'plan',
    summary: '创建世界计划',
    assumptions: [],
    steps: [
      {
        id: 'step-create-world',
        title: '创建世界卡',
        targetType: 'world-card',
        operation: 'create',
        entityRef: null,
        dependsOn: [],
        task: '创建一个名为白港的世界卡',
        riskLevel: 'low',
      },
    ],
  });

  const startRes = await request('/api/assistant/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '创建白港世界', context: {} }),
  });
  const startEvents = parseSsePayloads(await startRes.text());
  const taskId = startEvents.find((event) => event.type === 'task_created')?.task?.id;
  assert.ok(taskId);

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({
    type: 'world-card',
    operation: 'create',
    changes: { name: '白港', description: '港口都市' },
    entryOps: [],
    stateFieldOps: [],
    explanation: '创建世界卡',
  });

  const approveRes = await request(`/api/assistant/tasks/${taskId}/approve-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const approveEvents = parseSsePayloads(await approveRes.text());
  assert.ok(approveEvents.some((event) => event.type === 'plan_approved'));
  assert.ok(approveEvents.some((event) => event.type === 'step_started' && event.stepId === 'step-create-world'));
  assert.ok(approveEvents.some((event) => event.type === 'step_completed' && event.stepId === 'step-create-world'));
  assert.ok(approveEvents.some((event) => event.type === 'task_completed'));

  const worlds = sandbox.db.prepare('SELECT name FROM worlds ORDER BY created_at').all();
  assert.ok(worlds.some((world) => world.name === '白港'));
});

test('高风险步骤会先返回完整 proposal，并允许 approve-step 携带 editedProposal 后再执行', async () => {
  resetMockEnv();
  const world = insertWorld(sandbox.db, { name: '旧世界' });
  process.env.MOCK_LLM_COMPLETE = JSON.stringify({
    mode: 'plan',
    summary: '删除世界前先审阅',
    assumptions: [],
    steps: [
      {
        id: 'step-delete-world',
        title: '删除世界',
        targetType: 'world-card',
        operation: 'delete',
        entityRef: 'context.worldId',
        dependsOn: [],
        task: '删除当前世界',
        riskLevel: 'high',
      },
    ],
  });

  const startRes = await request('/api/assistant/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '删除这个世界', context: { worldId: world.id } }),
  });
  const startEvents = parseSsePayloads(await startRes.text());
  const taskId = startEvents.find((event) => event.type === 'task_created')?.task?.id;
  assert.ok(taskId);

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({
    type: 'world-card',
    operation: 'delete',
    entityId: world.id,
    changes: {},
    explanation: '删除世界卡',
  });

  const approvePlanRes = await request(`/api/assistant/tasks/${taskId}/approve-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const approvePlanEvents = parseSsePayloads(await approvePlanRes.text());
  const proposalReady = approvePlanEvents.find((event) => event.type === 'step_proposal_ready');
  assert.ok(proposalReady);
  assert.equal(proposalReady.proposal.type, 'world-card');
  assert.equal(proposalReady.proposal.operation, 'delete');
  assert.ok(approvePlanEvents.some((event) => event.type === 'step_approval_requested' && event.stepId === 'step-delete-world'));

  const approveStepRes = await request(`/api/assistant/tasks/${taskId}/approve-step`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stepId: 'step-delete-world',
      editedProposal: {
        type: 'character-card',
        operation: 'update',
        entityId: 'evil-id',
        explanation: '用户只改说明，锁定元信息仍应保留',
        changes: { name: '不会生效' },
      },
    }),
  });
  const approveStepEvents = parseSsePayloads(await approveStepRes.text());
  assert.ok(approveStepEvents.some((event) => event.type === 'step_approved' && event.stepId === 'step-delete-world'));
  assert.ok(approveStepEvents.some((event) => event.type === 'step_completed' && event.stepId === 'step-delete-world'));
  assert.ok(approveStepEvents.some((event) => event.type === 'task_completed'));
  assert.equal(sandbox.db.prepare('SELECT COUNT(*) AS count FROM worlds WHERE id = ?').get(world.id).count, 0);
});

test('POST /api/assistant/execute 对缺 token 与过期 token 返回 400', async () => {
  const missingTokenRes = await request('/api/assistant/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(missingTokenRes.status, 400);
  assert.match((await missingTokenRes.json()).error, /token 为必填项/);

  const { __testables } = await import('../server/routes.js');
  __testables.proposalStore.set('token-expired', {
    expiresAt: Date.now() - 1000,
    proposal: { type: 'world-card', operation: 'update', entityId: 'world-1', changes: {} },
  });

  const expiredRes = await request('/api/assistant/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'token-expired' }),
  });

  assert.equal(expiredRes.status, 400);
  assert.match((await expiredRes.json()).error, /提案已过期/);
  assert.equal(__testables.proposalStore.has('token-expired'), false);
});

test('POST /api/assistant/execute 在缺少必要 worldRefId 时返回 500', async () => {
  const world = insertWorld(sandbox.db, { name: '执行世界' });
  const { __testables } = await import('../server/routes.js');
  __testables.proposalStore.set('token-create-character', {
    expiresAt: Date.now() + 60_000,
    proposal: {
      type: 'character-card',
      operation: 'create',
      entityId: null,
      explanation: '创建角色',
      changes: { name: '新角色' },
      entryOps: [],
      stateFieldOps: [],
    },
  });

  const res = await request('/api/assistant/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'token-create-character', worldId: world.id }),
  });

  assert.equal(res.status, 500);
  const body = await res.json();
  assert.match(body.error, /character-card create 需要 worldId/);
});

test('POST /api/assistant/execute 使用 worldRefId 时会成功创建 character-card', async () => {
  const world = insertWorld(sandbox.db, { name: '落地世界' });
  const { __testables } = await import('../server/routes.js');
  __testables.proposalStore.set('token-create-character-ok', {
    expiresAt: Date.now() + 60_000,
    proposal: {
      type: 'character-card',
      operation: 'create',
      entityId: null,
      explanation: '创建角色',
      changes: { name: '新角色', description: '一句话简介', system_prompt: '角色设定' },
      entryOps: [],
      stateFieldOps: [],
    },
  });

  const res = await request('/api/assistant/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'token-create-character-ok', worldRefId: world.id }),
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.result.world_id, world.id);
  assert.equal(body.result.name, '新角色');

  const row = sandbox.db.prepare('SELECT world_id, name, description, system_prompt FROM characters WHERE id = ?').get(body.result.id);
  assert.deepEqual(row, {
    world_id: world.id,
    name: '新角色',
    description: '一句话简介',
    system_prompt: '角色设定',
  });
});

test('POST /api/assistant/execute 会创建包含 description 的 persona-card', async () => {
  const world = insertWorld(sandbox.db, { name: '玩家世界' });
  const { __testables } = await import('../server/routes.js');
  __testables.proposalStore.set('token-create-persona', {
    expiresAt: Date.now() + 60_000,
    proposal: {
      type: 'persona-card',
      operation: 'create',
      entityId: world.id,
      explanation: '创建玩家',
      changes: { name: '旅者', description: '一句话简介', system_prompt: '流亡审判官' },
      stateFieldOps: [],
    },
  });

  const res = await request('/api/assistant/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'token-create-persona' }),
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);

  const row = sandbox.db.prepare('SELECT world_id, name, description, system_prompt FROM personas WHERE id = ?').get(body.result.id);
  assert.deepEqual(row, {
    world_id: world.id,
    name: '旅者',
    description: '一句话简介',
    system_prompt: '流亡审判官',
  });
});

test('POST /api/assistant/execute 对重复 stateField 幂等跳过而非报错（多步骤创建场景）', async () => {
  const world = insertWorld(sandbox.db, { name: '字段冲突世界' });
  // 先通过 fixtures 直接插入一个状态字段
  const { insertWorldStateField } = await import('../../backend/tests/helpers/fixtures.js');
  insertWorldStateField(sandbox.db, world.id, { field_key: 'hp', label: '生命值' });

  const { __testables } = await import('../server/routes.js');
  __testables.proposalStore.set('token-duplicate-sf', {
    expiresAt: Date.now() + 60_000,
    proposal: {
      type: 'world-card',
      operation: 'update',
      entityId: world.id,
      explanation: '重复创建字段（多步骤场景幂等）',
      changes: {},
      entryOps: [],
      stateFieldOps: [
        { op: 'create', target: 'world', field_key: 'hp', label: '生命值2', type: 'number', default_value: '100' },
      ],
    },
  });

  const res = await request('/api/assistant/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'token-duplicate-sf' }),
  });

  // 重复字段幂等跳过，整体执行成功
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  // 原始字段保持不变（新 label 未覆盖）
  const field = sandbox.db.prepare('SELECT label FROM world_state_fields WHERE world_id = ? AND field_key = ?').get(world.id, 'hp');
  assert.equal(field.label, '生命值');
});

test('POST /api/assistant/execute 对 editedProposal 只接受内容覆盖，不允许改写锁定元信息', async () => {
  const world = insertWorld(sandbox.db, {
    name: '旧世界',
    system_prompt: '旧设定',
    post_prompt: '旧后置',
  });
  const { __testables } = await import('../server/routes.js');
  __testables.proposalStore.set('token-edit-world', {
    expiresAt: Date.now() + 60_000,
    proposal: {
      type: 'world-card',
      operation: 'update',
      entityId: world.id,
      explanation: '更新世界',
      changes: { name: '基础世界' },
      entryOps: [],
      stateFieldOps: [],
    },
  });

  const res = await request('/api/assistant/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: 'token-edit-world',
      editedProposal: {
        type: 'character-card',
        operation: 'delete',
        entityId: 'evil-id',
        changes: {
          name: '新世界名',
          system_prompt: '新系统设定',
          post_prompt: '新后置提示',
        },
        entryOps: [
          {
            op: 'create',
            title: '新增条目',
            description: '条目描述',
            content: '条目内容',
            keywords: ['线索'],
            keyword_scope: 'user',
          },
        ],
      },
    }),
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.result.id, world.id);

  const worldRow = sandbox.db.prepare(
    'SELECT id, name, system_prompt, post_prompt FROM worlds WHERE id = ?',
  ).get(world.id);
  assert.deepEqual(worldRow, {
    id: world.id,
    name: '新世界名',
    system_prompt: '旧设定',
    post_prompt: '旧后置',
  });

  const entries = sandbox.db.prepare(
    'SELECT title, description, content, keyword_scope FROM world_prompt_entries WHERE world_id = ?',
  ).all(world.id);
  assert.deepEqual(entries, [{
    title: '新增条目',
    description: '条目描述',
    content: '条目内容',
    keyword_scope: 'user',
  }]);
});
