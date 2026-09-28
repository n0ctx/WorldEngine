import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createRouteTestContext } from '../helpers/http.js';

const ctx = createRouteTestContext('routes-state-memory-schema');
after(() => ctx.close());

test('GET /api/state-memory/schema 返回实体类型、档案字段与相关常量', async () => {
  const res = await ctx.request('/api/state-memory/schema');
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.deepEqual(body.entityTypes, ['character', 'location', 'item', 'faction', 'other', 'player']);
  assert.deepEqual(Object.keys(body.profileFields).sort(), [...body.entityTypes].sort());
  assert.deepEqual(body.profileFields.player, []);
  assert.ok(body.profileFields.character.some((field) => field.key === 'core_traits'));
  assert.deepEqual(body.threadKinds, ['承诺', '任务', '债务', '冲突', '谜团', '威胁', '计划', '目标']);
  assert.deepEqual(body.exclusivePredicates, ['持有者', '控制者']);
  assert.deepEqual(body.reservedWorldFieldLabels, ['时间', '地点']);
  assert.equal(body.dynamicLocationKey, '位置');
});
