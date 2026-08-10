import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createRouteTestContext } from '../helpers/http.js';
import { resetMockEnv } from '../helpers/test-env.js';
import {
  insertCharacter,
  insertCharacterStateField,
  insertPersona,
  insertPersonaStateField,
  insertWorld,
} from '../helpers/fixtures.js';

const ctx = createRouteTestContext('routes-state-extract');
after(() => ctx.close());

test('POST /api/characters/:id/state-values/extract 返回建议；不存在 404', async () => {
  resetMockEnv();
  const world = insertWorld(ctx.sandbox.db, { name: '路由-角色提取-世界' });
  insertCharacterStateField(ctx.sandbox.db, world.id, { field_key: 'age', label: '年龄', type: 'number' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '阿绪', description: '23岁的剑客。' });

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({ age: 23 });

  const ok = await ctx.request(`/api/characters/${character.id}/state-values/extract`, { method: 'POST' });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.length, 1);
  assert.equal(body[0].field_key, 'age');
  assert.equal(body[0].suggested_value_json, JSON.stringify(23));

  const notFound = await ctx.request('/api/characters/no-such-id/state-values/extract', { method: 'POST' });
  assert.equal(notFound.status, 404);
});

test('POST /api/personas/:id/state-values/extract 返回建议；不存在 404；LLM 失败返回 502', async () => {
  resetMockEnv();
  const world = insertWorld(ctx.sandbox.db, { name: '路由-玩家提取-世界' });
  insertPersonaStateField(ctx.sandbox.db, world.id, { field_key: 'identity', label: '身份', type: 'text' });
  const persona = insertPersona(ctx.sandbox.db, world.id, { name: '旅人', description: '孤身赶路的商队向导。' });

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({ identity: '商队向导' });
  const ok = await ctx.request(`/api/personas/${persona.id}/state-values/extract`, { method: 'POST' });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.length, 1);
  assert.equal(body[0].field_key, 'identity');

  const notFound = await ctx.request('/api/personas/no-such-id/state-values/extract', { method: 'POST' });
  assert.equal(notFound.status, 404);

  process.env.MOCK_LLM_COMPLETE_ERROR = '模型挂了';
  const failed = await ctx.request(`/api/personas/${persona.id}/state-values/extract`, { method: 'POST' });
  assert.equal(failed.status, 502);
  delete process.env.MOCK_LLM_COMPLETE_ERROR;
});
