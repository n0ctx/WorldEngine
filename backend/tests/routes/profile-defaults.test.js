import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createRouteTestContext } from '../helpers/http.js';
import { insertCharacter, insertPersona, insertPersonaStateField, insertWorld } from '../helpers/fixtures.js';

const ctx = createRouteTestContext('routes-profile-defaults');
after(() => ctx.close());

function patch(path, body) {
  return ctx.request(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

test('角色卡档案初始值：列出可编辑字段（不含年龄），写入、清除、校验', async () => {
  const world = insertWorld(ctx.sandbox.db);
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '沈彦' });
  const base = `/api/characters/${character.id}/profile-defaults`;

  const rows = await (await ctx.request(base)).json();
  const keys = rows.map((r) => r.field_key);
  assert.ok(keys.includes('gender') && keys.includes('core_traits'));
  assert.ok(!keys.includes('age_recorded'));
  assert.deepEqual(rows.find((r) => r.field_key === 'core_traits'), {
    field_key: 'core_traits', label: '核心性格', group: '人格', type: 'list', value_json: null,
  });

  assert.equal((await patch(`${base}/gender`, { value_json: JSON.stringify(' 男 ') })).status, 200);
  assert.equal((await patch(`${base}/core_traits`, { value_json: JSON.stringify(['寡言', '']) })).status, 200);
  let byKey = Object.fromEntries((await (await ctx.request(base)).json()).map((r) => [r.field_key, r.value_json]));
  assert.equal(byKey.gender, JSON.stringify('男'));
  assert.equal(byKey.core_traits, JSON.stringify(['寡言']));

  assert.equal((await patch(`${base}/gender`, { value_json: null })).status, 200);
  byKey = Object.fromEntries((await (await ctx.request(base)).json()).map((r) => [r.field_key, r.value_json]));
  assert.equal(byKey.gender, null);

  assert.equal((await patch(`${base}/birth_date`, { value_json: JSON.stringify('不是日期') })).status, 400);
  assert.equal((await patch(`${base}/birth_date`, { value_json: JSON.stringify('') })).status, 200);
  assert.equal((await patch(`${base}/age_recorded`, { value_json: JSON.stringify({ age: 3 }) })).status, 400);
  assert.equal((await patch(`${base}/gender`, {})).status, 400);
  assert.equal((await ctx.request('/api/characters/no-such/profile-defaults')).status, 404);
});

test('人设档案初始值：没有人格字段，与玩家字段同义的档案字段停用', async () => {
  const world = insertWorld(ctx.sandbox.db);
  insertPersonaStateField(ctx.sandbox.db, world.id, { field_key: 'clothes', label: '穿着' });
  const persona = insertPersona(ctx.sandbox.db, world.id, { name: '旅人' });
  const base = `/api/personas/${persona.id}/profile-defaults`;

  const keys = (await (await ctx.request(base)).json()).map((r) => r.field_key);
  assert.ok(keys.includes('gender'));
  assert.ok(!keys.includes('core_traits'));
  assert.ok(!keys.includes('outfit'));
  assert.equal((await patch(`${base}/core_traits`, { value_json: JSON.stringify(['沉稳']) })).status, 400);
  assert.equal((await ctx.request('/api/personas/no-such/profile-defaults')).status, 404);
});
