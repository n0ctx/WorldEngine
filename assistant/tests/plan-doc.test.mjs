import test from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../../backend/tests/helpers/test-env.js';

const sandbox = createTestSandbox('assistant-plan-doc');
sandbox.setEnv();

const taskStore = await freshImport('assistant/server/task-store.js');
const {
  renderPlanDoc,
  parsePlanDoc,
  pickNextStep,
  markStepDone,
  normalizePlanDocList,
  writePlanDoc,
  readPlanDoc,
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

test('parsePlanDoc 还原 steps + done 状态', () => {
  const md = `# 任务：T

> 状态：executing · 创建时间：2026-05-07T14:32

## 用户意图
intent

## 步骤

- [x] **step-1** A（world-card.create）
  - 依赖：无
  - 任务：a
- [ ] **step-2** B（character-card.create）
  - 依赖：step-1
  - 任务：b
`;
  const parsed = parsePlanDoc(md);
  assert.equal(parsed.steps.length, 2);
  assert.equal(parsed.steps[0].done, true);
  assert.equal(parsed.steps[1].done, false);
  assert.deepEqual(parsed.steps[1].dependsOn, ['step-1']);
  assert.equal(parsed.steps[1].targetType, 'character-card');
});

test('pickNextStep 跳过已完成与未满足依赖', () => {
  const steps = [
    { id: 'step-1', done: true, dependsOn: [] },
    { id: 'step-2', done: false, dependsOn: ['step-1'] },
    { id: 'step-3', done: false, dependsOn: ['step-2'] },
  ];
  assert.equal(pickNextStep(steps).id, 'step-2');
});

test('markStepDone 把 [ ] 改成 [x] 并追加完成时间', () => {
  const md = `## 步骤

- [ ] **step-1** A（world-card.create）
  - 依赖：无
  - 任务：a
`;
  const out = markStepDone(md, 'step-1', '14:33:05');
  assert.match(out, /- \[x\] \*\*step-1\*\*/);
  assert.match(out, /完成于 14:33:05/);
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

test('parsePlanDoc 处理空文档与无意义首行', () => {
  const parsed = parsePlanDoc('# 不匹配\n');
  assert.equal(parsed.title, '');
  assert.equal(parsed.status, 'planning');
  assert.deepEqual(parsed.steps, []);
});

test('pickNextStep 全部完成时返回 null', () => {
  assert.equal(pickNextStep([{ id: 's1', done: true, dependsOn: [] }]), null);
});

test('writePlanDoc / readPlanDoc / deletePlanDoc 走 assistant_tasks 持久化', async () => {
  const task = taskStore.createTask({ context: {} });
  await ensurePlanDir();
  assert.match(planDocPath(task.id), /\.temp\/assistant\//);

  await writePlanDoc(task.id, 'hello world');
  assert.equal(await readPlanDoc(task.id), 'hello world');
  assert.equal(taskStore.getTask(task.id).planDocContent, 'hello world');

  const row = sandbox.db.prepare('SELECT plan_doc_content FROM assistant_tasks WHERE id = ?').get(task.id);
  assert.equal(row.plan_doc_content, 'hello world');

  await deletePlanDoc(task.id);
  assert.equal(await readPlanDoc(task.id), '');
  const afterDelete = sandbox.db.prepare('SELECT plan_doc_content FROM assistant_tasks WHERE id = ?').get(task.id);
  assert.equal(afterDelete.plan_doc_content, '');
});
