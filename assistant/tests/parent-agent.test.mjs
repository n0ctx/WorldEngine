// assistant/tests/parent-agent.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as taskStore from '../server/task-store.js';
import * as planDoc from '../server/plan-doc.js';

test('plan_doc_updated 事件携带文档全文', async () => {
  const task = taskStore.createTask({ context: { worldId: null } });
  const events = [];
  const fakeRes = { write: (line) => events.push(line) };
  taskStore.attachSse(task.id, fakeRes);
  await planDoc.writePlanDoc(task.id, '# 任务：T\n\n> 状态：planning · 创建时间：x\n\n## 用户意图\nx\n\n## 假设与约束\n- 无\n\n## 步骤\n\n- [ ] **step-1** A（world-card.create）\n  - 依赖：无\n  - 任务：a\n\n## 执行日志\n');
  taskStore.emit(task.id, { type: 'plan_doc_updated', taskId: task.id, content: 'demo' });
  assert.match(events.at(-1), /plan_doc_updated/);
  assert.match(events.at(-1), /demo/);
  await planDoc.deletePlanDoc(task.id);
});
