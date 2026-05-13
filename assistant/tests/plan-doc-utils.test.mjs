import test from 'node:test';
import assert from 'node:assert/strict';

import { countCheckboxes, parseTaskLines } from '../client/plan-doc-utils.js';

const SAMPLE = `# 计划

意图：xxx

## 步骤
- [x] 读取角色卡草稿
- [ ] 拉取世界设定
- [x] 整理大纲
- [ ] 写入提示词模板
`;

test('countCheckboxes 统计 done/total', () => {
  const { total, done } = countCheckboxes(SAMPLE);
  assert.equal(total, 4);
  assert.equal(done, 2);
});

test('countCheckboxes 空输入返回 0/0', () => {
  assert.deepEqual(countCheckboxes(''), { total: 0, done: 0 });
  assert.deepEqual(countCheckboxes(null), { total: 0, done: 0 });
  assert.deepEqual(countCheckboxes(undefined), { total: 0, done: 0 });
});

test('parseTaskLines 按顺序返回任务列表', () => {
  const tasks = parseTaskLines(SAMPLE);
  assert.deepEqual(tasks, [
    { checked: true, text: '读取角色卡草稿' },
    { checked: false, text: '拉取世界设定' },
    { checked: true, text: '整理大纲' },
    { checked: false, text: '写入提示词模板' },
  ]);
});

test('parseTaskLines 忽略非任务行', () => {
  const md = '普通段落\n- 非任务列表\n- [ ] 任务一\n## 标题\n- [x] 任务二';
  const tasks = parseTaskLines(md);
  assert.deepEqual(tasks, [
    { checked: false, text: '任务一' },
    { checked: true, text: '任务二' },
  ]);
});
