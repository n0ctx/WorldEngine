import test from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../backend/tests/helpers/test-env.js';

const sandbox = createTestSandbox('assistant-plan-doc');
sandbox.setEnv();

const taskStore = await freshImport('assistant/server/task-store.js');
const {
  renderPlanDoc,
  pickNextStep,
  markStepDone,
  normalizePlanDocList,
  writePlanDoc,
  readPlanDoc,
  readPlanData,
  deletePlanDoc,
  ensurePlanDir,
  planDocPath,
} = await freshImport('assistant/server/plan-doc.js');

test.after(() => {
  sandbox.cleanup();
});

test('renderPlanDoc 生成符合 spec §5 模板', () => {
  const md = renderPlanDoc({
    title: '创建世界卡《X》',
    status: 'planning',
    createdAt: '2026-05-07T14:32:00',
    intent: '创建 X 世界',
    assumptions: ['世界已存在 persona Y'],
    steps: [
      { id: 'step-1', title: '创建世界卡', targetType: 'world-card', operation: 'create', dependsOn: [], task: '...' },
      { id: 'step-2', title: '加状态字段', targetType: 'world-card', operation: 'update', dependsOn: ['step-1'], task: '...' },
    ],
  });
  assert.match(md, /# 任务：创建世界卡《X》/);
  assert.match(md, /- \[ \] \*\*step-1\*\* 创建世界卡（world-card\.create）/);
  assert.match(md, /依赖：step-1/);
  assert.doesNotMatch(md, /执行日志/);
});

test('renderPlanDoc 清洗对象形态的假设与约束', () => {
  const assumptions = [
    { fact: '世界卡已存在', source: 'preview_card' },
    { description: '状态机字段缺少结算枚举' },
    { foo: 'bar', nested: { value: 'baz' } },
  ];
  assert.deepEqual(normalizePlanDocList(assumptions), [
    '世界卡已存在；来源：preview_card',
    '状态机字段缺少结算枚举',
    'foo: bar；nested: baz',
  ]);

  const md = renderPlanDoc({
    title: 'T',
    status: 'planning',
    createdAt: 'now',
    intent: 'i',
    assumptions,
    steps: [
      { id: 'step-1', title: 'A', targetType: 'world-card', operation: 'update', dependsOn: [], task: 'a' },
    ],
  });
  assert.doesNotMatch(md, /\[object Object\]/);
  assert.match(md, /- 世界卡已存在；来源：preview_card/);
  assert.match(md, /- foo: bar；nested: baz/);
});

test('renderPlanDoc 把 intent / assumptions / createdAt / updatedAt 写入对应段落', () => {
  const md = renderPlanDoc({
    title: 'T',
    status: 'planning',
    createdAt: '2026-05-13T10:00:00Z',
    updatedAt: '2026-05-13T11:00:00Z',
    intent: '希望补全角色卡',
    assumptions: ['世界 X 已存在', '角色 Y 没有状态字段'],
    steps: [
      { id: 'step-1', title: 'A', targetType: 'world-card', operation: 'update', dependsOn: [], task: 'a' },
    ],
  });
  assert.match(md, /创建时间：2026-05-13T10:00:00Z/);
  assert.match(md, /更新时间：2026-05-13T11:00:00Z/);
  assert.match(md, /## 用户意图\n希望补全角色卡/);
  assert.match(md, /- 世界 X 已存在/);
  assert.match(md, /- 角色 Y 没有状态字段/);
});

test('pickNextStep 跳过已完成与未满足依赖', () => {
  const steps = [
    { id: 'step-1', done: true, dependsOn: [] },
    { id: 'step-2', done: false, dependsOn: ['step-1'] },
    { id: 'step-3', done: false, dependsOn: ['step-2'] },
  ];
  assert.equal(pickNextStep(steps).id, 'step-2');
});

test('markStepDone（结构级）把 step.done 置 true 并写上 completedAt', () => {
  const plan = {
    title: 'T',
    status: 'executing',
    createdAt: 'now',
    intent: 'i',
    assumptions: [],
    steps: [
      { id: 'step-1', title: 'A', targetType: 'world-card', operation: 'create', dependsOn: [], task: 'a', done: false, completedAt: null },
      { id: 'step-2', title: 'B', targetType: 'world-card', operation: 'update', dependsOn: ['step-1'], task: 'b', done: false, completedAt: null },
    ],
  };
  const updated = markStepDone(plan, 'step-1', '14:33:05');
  assert.notEqual(updated, plan, 'markStepDone 应返回新对象，不改动原 plan');
  assert.equal(updated.steps[0].done, true);
  assert.equal(updated.steps[0].completedAt, '14:33:05');
  assert.equal(updated.steps[1].done, false, '不应影响其它 step');
  assert.equal(plan.steps[0].done, false, '原 plan 不应被就地修改');

  const md = renderPlanDoc(updated);
  assert.match(md, /- \[x\] \*\*step-1\*\*/);
  assert.match(md, /完成于 14:33:05/);
});

test('renderPlanDoc 可序列化已完成 step 的 completedAt', () => {
  const md = renderPlanDoc({
    title: 'T',
    status: 'executing',
    createdAt: 'now',
    intent: 'i',
    assumptions: [],
    steps: [
      { id: 'step-1', title: 'A', targetType: 'world-card', operation: 'create', dependsOn: [], task: 'a', done: true, completedAt: 'ts1' },
    ],
  });
  assert.match(md, /- \[x\] \*\*step-1\*\*/);
  assert.match(md, /完成于 ts1/);
  assert.doesNotMatch(md, /执行日志/);
});

test('pickNextStep 全部完成时返回 null', () => {
  assert.equal(pickNextStep([{ id: 's1', done: true, dependsOn: [] }]), null);
});

test('writePlanDoc / readPlanDoc / readPlanData / deletePlanDoc 走 assistant_tasks 持久化', async () => {
  const task = taskStore.createTask({ context: {} });
  await ensurePlanDir();
  assert.match(planDocPath(task.id), /\.temp\/assistant\//);

  const plan = {
    title: '创建世界卡《X》',
    status: 'awaiting_approval',
    createdAt: '2026-05-07T14:32:00',
    updatedAt: '2026-05-07T14:32:00',
    intent: '创建 X 世界',
    assumptions: ['世界已存在 persona Y'],
    steps: [
      { id: 'step-1', title: '创建世界卡', targetType: 'world-card', operation: 'create', dependsOn: [], task: '...', done: false },
      { id: 'step-2', title: '加状态字段', targetType: 'world-card', operation: 'update', dependsOn: ['step-1'], task: '...', done: false },
    ],
  };

  await writePlanDoc(task.id, plan);
  const expectedMd = renderPlanDoc(plan);
  assert.equal(await readPlanDoc(task.id), expectedMd);
  assert.deepEqual(await readPlanData(task.id), plan);
  assert.equal(taskStore.getTask(task.id).planDocContent, expectedMd);
  assert.deepEqual(taskStore.getTask(task.id).planDocData, plan);

  const row = sandbox.db.prepare('SELECT plan_doc_content, plan_doc_data_json FROM assistant_tasks WHERE id = ?').get(task.id);
  assert.equal(row.plan_doc_content, expectedMd);
  assert.deepEqual(JSON.parse(row.plan_doc_data_json), plan);

  await deletePlanDoc(task.id);
  assert.equal(await readPlanDoc(task.id), '');
  assert.equal(await readPlanData(task.id), null);
  const afterDelete = sandbox.db.prepare('SELECT plan_doc_content, plan_doc_data_json FROM assistant_tasks WHERE id = ?').get(task.id);
  assert.equal(afterDelete.plan_doc_content, '');
  assert.equal(afterDelete.plan_doc_data_json, null);
});

test('不变量：readPlanData 与写入结构一致，且 readPlanDoc 的 md 与 renderPlanDoc(结构) 逐字相等（md 与结构永不分叉）', async () => {
  const task = taskStore.createTask({ context: {} });
  const plan = {
    title: '不变量校验任务',
    status: 'planning',
    createdAt: '2026-05-13T10:00:00Z',
    updatedAt: '2026-05-13T11:00:00Z',
    intent: '验证结构与 md 同步',
    assumptions: ['前提 A', { fact: '前提 B', source: 'preview_card' }],
    steps: [
      { id: 'step-1', title: '读取现状', targetType: 'world-card', operation: 'update', dependsOn: [], task: '先读现状', done: false, completedAt: null },
      { id: 'step-2', title: '写入变更', targetType: 'world-card', operation: 'update', dependsOn: ['step-1'], task: '再写入', done: true, completedAt: '10:00:00' },
    ],
  };

  await writePlanDoc(task.id, plan);

  const roundTrippedPlan = await readPlanData(task.id);
  assert.deepEqual(roundTrippedPlan, plan, 'readPlanData 拿回的结构必须与写入时一致');

  const persistedMd = await readPlanDoc(task.id);
  assert.equal(persistedMd, renderPlanDoc(roundTrippedPlan), 'readPlanDoc 的 md 必须与 renderPlanDoc(该结构) 逐字相等');
});
