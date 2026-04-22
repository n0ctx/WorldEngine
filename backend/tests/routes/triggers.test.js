import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createRouteTestContext } from '../helpers/http.js';
import { insertWorld } from '../helpers/fixtures.js';

const ctx = createRouteTestContext('triggers-route-suite');

after(() => ctx.close());

test('GET /api/worlds/:worldId/triggers — 空世界返回 []', async () => {
  const world = insertWorld(ctx.sandbox.db);

  const res = await ctx.request(`/api/worlds/${world.id}/triggers`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data, []);
});

test('POST /api/worlds/:worldId/triggers — 创建触发器返回完整对象（多动作）', async () => {
  const world = insertWorld(ctx.sandbox.db);
  const conditions = [{ target_field: '凛.好感度', operator: '>', value: '50' }];
  const actions = [
    { action_type: 'notify', params: { text: '触发了！' } },
    { action_type: 'notify', params: { text: '第二个动作' } },
  ];

  const res = await ctx.request(`/api/worlds/${world.id}/triggers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '测试触发器', conditions, actions }),
  });
  assert.equal(res.status, 201);
  const data = await res.json();

  assert.equal(data.name, '测试触发器');
  assert.equal(data.world_id, world.id);
  assert.ok(Array.isArray(data.conditions));
  assert.equal(data.conditions.length, 1);
  assert.equal(data.conditions[0].target_field, '凛.好感度');
  assert.equal(data.conditions[0].operator, '>');
  assert.equal(data.conditions[0].value, '50');
  assert.ok(Array.isArray(data.actions));
  assert.equal(data.actions.length, 2);
  assert.equal(data.actions[0].action_type, 'notify');
  assert.equal(data.actions[1].action_type, 'notify');
});

test('POST — name 缺失时返回 400', async () => {
  const world = insertWorld(ctx.sandbox.db);

  const res = await ctx.request(`/api/worlds/${world.id}/triggers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conditions: [] }),
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.ok(data.error);
});

test('GET — 创建后 list 返回正确数量的触发器', async () => {
  const world = insertWorld(ctx.sandbox.db);

  // 创建两个触发器
  await ctx.request(`/api/worlds/${world.id}/triggers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '触发器A' }),
  });
  await ctx.request(`/api/worlds/${world.id}/triggers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '触发器B' }),
  });

  const res = await ctx.request(`/api/worlds/${world.id}/triggers`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.length, 2);
});

test('PUT /api/triggers/:id — 更新触发器名称、conditions 和 actions', async () => {
  const world = insertWorld(ctx.sandbox.db);

  // 先创建
  const createRes = await ctx.request(`/api/worlds/${world.id}/triggers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '原名称',
      conditions: [{ target_field: '旧字段', operator: '=', value: '0' }],
      actions: [{ action_type: 'notify', params: { text: '旧动作' } }],
    }),
  });
  const created = await createRes.json();

  // 再更新
  const updateRes = await ctx.request(`/api/triggers/${created.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '新名称',
      enabled: 1,
      one_shot: 0,
      conditions: [{ target_field: '凛.好感度', operator: '>', value: '80' }],
      actions: [
        { action_type: 'notify', params: { text: '新动作' } },
        { action_type: 'notify', params: { text: '追加动作' } },
      ],
    }),
  });
  assert.equal(updateRes.status, 200);
  const updated = await updateRes.json();

  assert.equal(updated.name, '新名称');
  assert.equal(updated.conditions.length, 1);
  assert.equal(updated.conditions[0].target_field, '凛.好感度');
  assert.equal(updated.conditions[0].value, '80');
  assert.ok(Array.isArray(updated.actions));
  assert.equal(updated.actions.length, 2);
  assert.equal(updated.actions[0].action_type, 'notify');
});

test('DELETE /api/triggers/:id — 删除后 GET 返回空列表', async () => {
  const world = insertWorld(ctx.sandbox.db);

  const createRes = await ctx.request(`/api/worlds/${world.id}/triggers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '待删除触发器' }),
  });
  const created = await createRes.json();

  const deleteRes = await ctx.request(`/api/triggers/${created.id}`, {
    method: 'DELETE',
  });
  assert.equal(deleteRes.status, 200);
  const deleteData = await deleteRes.json();
  assert.equal(deleteData.ok, true);

  const listRes = await ctx.request(`/api/worlds/${world.id}/triggers`);
  const list = await listRes.json();
  assert.equal(list.length, 0);
});

test('DELETE — 不存在 id 返回 404', async () => {
  const res = await ctx.request('/api/triggers/nonexistent-id-000', {
    method: 'DELETE',
  });
  assert.equal(res.status, 404);
});

test('PUT — 不存在 id 返回 404', async () => {
  const res = await ctx.request('/api/triggers/nonexistent-id-000', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '不存在' }),
  });
  assert.equal(res.status, 404);
});
