import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createRouteTestContext } from '../helpers/http.js';
import { insertWorld, insertSession } from '../helpers/fixtures.js';

const ctx = createRouteTestContext('routes-state-memory');
after(() => ctx.close());

function jsonInit(method, body) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function setupSession() {
  const world = insertWorld(ctx.sandbox.db);
  return insertSession(ctx.sandbox.db, { world_id: world.id, mode: 'writing' });
}

async function createEntity(sessionId, body) {
  const res = await ctx.request(`/api/sessions/${sessionId}/state-memory/entities`, jsonInit('POST', body));
  assert.equal(res.status, 200);
  return res.json();
}

test('GET /api/sessions/:sessionId/state-memory 会话不存在 404；空会话返回空结构', async () => {
  const notFound = await ctx.request('/api/sessions/no-such/state-memory');
  assert.equal(notFound.status, 404);

  const session = setupSession();
  const res = await ctx.request(`/api/sessions/${session.id}/state-memory`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data, {
    entities: [], relations: [], threads: [], facts: [],
    world: { time: null, location: null, location_entity_id: null },
    presentIds: [],
  });
});

test('POST /entities 建立实体；重名 409；未知类型 400', async () => {
  const session = setupSession();
  const entity = await createEntity(session.id, { type: 'character', name: '林乔' });
  assert.equal(entity.name, '林乔');
  assert.equal(entity.status, 'active');

  const conflict = await ctx.request(`/api/sessions/${session.id}/state-memory/entities`, jsonInit('POST', { type: 'character', name: '林乔' }));
  assert.equal(conflict.status, 409);

  const badType = await ctx.request(`/api/sessions/${session.id}/state-memory/entities`, jsonInit('POST', { type: 'x', name: 'Y' }));
  assert.equal(badType.status, 400);
});

test('PATCH /entities/:entityId 改动档案与现状；改名冲突 409；实体不存在 404', async () => {
  const session = setupSession();
  const a = await createEntity(session.id, { type: 'character', name: 'A' });
  await createEntity(session.id, { type: 'character', name: 'B' });

  const patched = await ctx.request(
    `/api/sessions/${session.id}/state-memory/entities/${a.entity_id}`,
    jsonInit('PATCH', { profile: { gender: '女' }, dynamic: { 伤势: '轻伤' } }),
  );
  assert.equal(patched.status, 200);
  const patchedBody = await patched.json();
  assert.equal(patchedBody.profile.gender.value, '女');
  assert.equal(patchedBody.profile.gender.evidence, '手动编辑');
  assert.equal(patchedBody.dynamic.伤势, '轻伤');

  const conflict = await ctx.request(
    `/api/sessions/${session.id}/state-memory/entities/${a.entity_id}`,
    jsonInit('PATCH', { name: 'B' }),
  );
  assert.equal(conflict.status, 409);

  const notFound = await ctx.request(
    `/api/sessions/${session.id}/state-memory/entities/no-such`,
    jsonInit('PATCH', { name: 'C' }),
  );
  assert.equal(notFound.status, 404);
});

test('DELETE /entities/:entityId 退场实体', async () => {
  const session = setupSession();
  const a = await createEntity(session.id, { type: 'character', name: 'A' });

  const res = await ctx.request(`/api/sessions/${session.id}/state-memory/entities/${a.entity_id}`, { method: 'DELETE' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'retired');

  const notFound = await ctx.request(`/api/sessions/${session.id}/state-memory/entities/no-such`, { method: 'DELETE' });
  assert.equal(notFound.status, 404);
});

test('PATCH /entities/:entityId/fields/:fieldKey 校验失败 400', async () => {
  const session = setupSession();
  const a = await createEntity(session.id, { type: 'character', name: 'A' });

  const res = await ctx.request(
    `/api/sessions/${session.id}/state-memory/entities/${a.entity_id}/fields/no-such-field`,
    jsonInit('PATCH', { value: 'x' }),
  );
  assert.equal(res.status, 400);
});

test('PATCH /world 时间格式无效 400；地点解析到实体', async () => {
  const session = setupSession();
  const location = await createEntity(session.id, { type: 'location', name: '旧港仓库' });

  const badTime = await ctx.request(`/api/sessions/${session.id}/state-memory/world`, jsonInit('PATCH', { time: '不是日期' }));
  assert.equal(badTime.status, 400);

  const res = await ctx.request(
    `/api/sessions/${session.id}/state-memory/world`,
    jsonInit('PATCH', { time: '1000-03-15T08:00', location: location.entity_id }),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.time, '1000-03-15T08:00');
  assert.equal(body.location_entity_id, location.entity_id);
});

test('关系：POST 创建，DELETE 删除；主体不存在 404', async () => {
  const session = setupSession();
  const a = await createEntity(session.id, { type: 'character', name: 'A' });

  const badSubject = await ctx.request(
    `/api/sessions/${session.id}/state-memory/relations`,
    jsonInit('POST', { subject_id: 'no-such', predicate: '成员', object_value: '组织' }),
  );
  assert.equal(badSubject.status, 404);

  const created = await ctx.request(
    `/api/sessions/${session.id}/state-memory/relations`,
    jsonInit('POST', { subject_id: a.entity_id, predicate: '成员', object_value: '铁匠会' }),
  );
  assert.equal(created.status, 200);
  const relation = await created.json();

  const deleted = await ctx.request(`/api/sessions/${session.id}/state-memory/relations/${relation.relation_id}`, { method: 'DELETE' });
  assert.equal(deleted.status, 200);

  const notFound = await ctx.request(`/api/sessions/${session.id}/state-memory/relations/${relation.relation_id}`, { method: 'DELETE' });
  assert.equal(notFound.status, 404);
});

test('事项：POST 创建，未知类型 400，PATCH 改状态，未知事项 404', async () => {
  const session = setupSession();
  const a = await createEntity(session.id, { type: 'character', name: 'A' });

  const badKind = await ctx.request(
    `/api/sessions/${session.id}/state-memory/threads`,
    jsonInit('POST', { kind: '不存在', content: 'x' }),
  );
  assert.equal(badKind.status, 400);

  const created = await ctx.request(
    `/api/sessions/${session.id}/state-memory/threads`,
    jsonInit('POST', { kind: '承诺', participants: [a.entity_id], content: '三日内归还账本' }),
  );
  assert.equal(created.status, 200);
  const thread = await created.json();

  const updated = await ctx.request(
    `/api/sessions/${session.id}/state-memory/threads/${thread.thread_id}`,
    jsonInit('PATCH', { status: 'resolved' }),
  );
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).status, 'resolved');

  const notFound = await ctx.request(
    `/api/sessions/${session.id}/state-memory/threads/no-such`,
    jsonInit('PATCH', { status: 'active' }),
  );
  assert.equal(notFound.status, 404);
});

test('世界事实：POST 创建，DELETE 删除，缺内容 400', async () => {
  const session = setupSession();

  const badBody = await ctx.request(`/api/sessions/${session.id}/state-memory/facts`, jsonInit('POST', { text: '' }));
  assert.equal(badBody.status, 400);

  const created = await ctx.request(`/api/sessions/${session.id}/state-memory/facts`, jsonInit('POST', { text: '北境已被黑潮会占领' }));
  assert.equal(created.status, 200);
  const fact = await created.json();
  assert.equal(fact.evidence, '手动编辑');

  const deleted = await ctx.request(`/api/sessions/${session.id}/state-memory/facts/${fact.fact_id}`, { method: 'DELETE' });
  assert.equal(deleted.status, 200);

  const notFound = await ctx.request(`/api/sessions/${session.id}/state-memory/facts/${fact.fact_id}`, { method: 'DELETE' });
  assert.equal(notFound.status, 404);
});
