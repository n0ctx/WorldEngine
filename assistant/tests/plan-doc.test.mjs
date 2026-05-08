// assistant/tests/plan-doc.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  renderPlanDoc,
  parsePlanDoc,
  pickNextStep,
  markStepDone,
  appendLog,
  writePlanDoc,
  readPlanDoc,
  deletePlanDoc,
  ensurePlanDir,
  planDocPath,
} from '../server/plan-doc.js';

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
    log: [],
  });
  assert.match(md, /# 任务：创建世界卡《X》/);
  assert.match(md, /- \[ \] \*\*step-1\*\* 创建世界卡（world-card\.create）/);
  assert.match(md, /依赖：step-1/);
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

test('appendLog 追加到执行日志小节', () => {
  const md = `## 执行日志\n`;
  const out = appendLog(md, 'step-1 done');
  assert.match(out, /## 执行日志\n.*step-1 done/s);
});

test('renderPlanDoc 可序列化已完成 step 的 completedAt 与日志行', () => {
  const md = renderPlanDoc({
    title: 'T',
    status: 'executing',
    createdAt: 'now',
    intent: 'i',
    assumptions: [],
    steps: [
      { id: 'step-1', title: 'A', targetType: 'world-card', operation: 'create', dependsOn: [], task: 'a', done: true, completedAt: 'ts1' },
    ],
    log: ['line-1', 'line-2'],
  });
  assert.match(md, /- \[x\] \*\*step-1\*\*/);
  assert.match(md, /完成于 ts1/);
  assert.match(md, /line-1\nline-2/);
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

test('writePlanDoc / readPlanDoc / deletePlanDoc 全链路', async () => {
  const taskId = `task-tmp-${Date.now()}`;
  await ensurePlanDir();
  const filePath = planDocPath(taskId);
  assert.match(filePath, /\.temp\/assistant\//);
  await writePlanDoc(taskId, 'hello world');
  const got = await readPlanDoc(taskId);
  assert.equal(got, 'hello world');
  await deletePlanDoc(taskId);
  // 二次删除不抛
  await deletePlanDoc(taskId);
  await assert.rejects(() => fs.stat(filePath));
});
