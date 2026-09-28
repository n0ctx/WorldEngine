import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createRouteTestContext } from '../helpers/http.js';
import { resetMockEnv } from '../helpers/test-env.js';
import {
  insertWorld, insertSession, insertCharacter, insertCharacterStateField, insertCharacterStateValue,
} from '../helpers/fixtures.js';

const ctx = createRouteTestContext('routes-state-memory');
after(() => ctx.close());

function jsonInit(method, body) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function setupSession() {
  const world = insertWorld(ctx.sandbox.db);
  return insertSession(ctx.sandbox.db, { world_id: world.id, mode: 'writing' });
}

function setupSessionWithWorld() {
  const world = insertWorld(ctx.sandbox.db);
  const session = insertSession(ctx.sandbox.db, { world_id: world.id, mode: 'writing' });
  return { world, session };
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
    entities: [], relations: [], threads: [],
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

test('POST /entities/from-card 从角色卡建置顶关联实体并复制默认值与档案初始值；重复 409；卡片不属于本世界 400', async () => {
  const { world, session } = setupSessionWithWorld();
  insertCharacterStateField(ctx.sandbox.db, world.id, { field_key: 'mood', label: '心情', type: 'text' });

  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '阿绪' });
  insertCharacterStateValue(ctx.sandbox.db, character.id, {
    field_key: 'mood', default_value_json: JSON.stringify('沉静'),
  });
  ctx.sandbox.db.prepare('UPDATE characters SET profile_defaults_json = ? WHERE id = ?')
    .run(JSON.stringify({ gender: '男', core_traits: ['寡言'] }), character.id);

  const res = await ctx.request(
    `/api/sessions/${session.id}/state-memory/entities/from-card`,
    jsonInit('POST', { character_id: character.id }),
  );
  assert.equal(res.status, 200);
  const entity = await res.json();
  assert.equal(entity.name, '阿绪');
  assert.equal(entity.card_id, character.id);
  assert.equal(entity.pinned, true);
  assert.equal(entity.fields.find((f) => f.field_key === 'mood').value, '沉静');
  assert.equal(entity.profile.gender.value, '男');
  assert.deepEqual(entity.profile.core_traits.value, ['寡言']);

  const conflict = await ctx.request(
    `/api/sessions/${session.id}/state-memory/entities/from-card`,
    jsonInit('POST', { character_id: character.id }),
  );
  assert.equal(conflict.status, 409);

  const otherWorld = insertWorld(ctx.sandbox.db);
  const otherCharacter = insertCharacter(ctx.sandbox.db, otherWorld.id, { name: '外人' });
  const worldMismatch = await ctx.request(
    `/api/sessions/${session.id}/state-memory/entities/from-card`,
    jsonInit('POST', { character_id: otherCharacter.id }),
  );
  assert.equal(worldMismatch.status, 400);

  const notFound = await ctx.request(
    `/api/sessions/${session.id}/state-memory/entities/from-card`,
    jsonInit('POST', { character_id: 'no-such' }),
  );
  assert.equal(notFound.status, 404);
});

test('POST /entities/:entityId/analyze 返回 LLM 制卡草稿；实体不存在 404', async () => {
  resetMockEnv();
  const session = setupSession();
  const entity = await createEntity(session.id, { type: 'character', name: '阿绪' });

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({
    system_prompt: '阿绪性格沉静。',
    first_message: '你好。',
  });

  const res = await ctx.request(
    `/api/sessions/${session.id}/state-memory/entities/${entity.entity_id}/analyze`,
    { method: 'POST' },
  );
  assert.equal(res.status, 200);
  const draft = await res.json();
  assert.equal(draft.name, '阿绪');
  assert.equal(draft.system_prompt, '阿绪性格沉静。');
  assert.equal(draft.first_message, '你好。');

  const notFound = await ctx.request(
    `/api/sessions/${session.id}/state-memory/entities/no-such/analyze`,
    { method: 'POST' },
  );
  assert.equal(notFound.status, 404);
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
