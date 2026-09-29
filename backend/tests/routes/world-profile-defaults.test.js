import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createRouteTestContext } from '../helpers/http.js';
import { insertWorld } from '../helpers/fixtures.js';

const ctx = createRouteTestContext('routes-world-profile-defaults');
after(() => ctx.close());

function patch(path, body) {
  return ctx.request(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

test('世界卡档案默认值：列出开场时间与地点，写入、清除、校验', async () => {
  const world = insertWorld(ctx.sandbox.db);
  const base = `/api/worlds/${world.id}/profile-defaults`;

  const rows = await (await ctx.request(base)).json();
  assert.deepEqual(rows.map((row) => row.field_key), ['time', 'location']);
  assert.equal(rows[0].value_json, null);

  assert.equal((await patch(`${base}/time`, { value_json: JSON.stringify('1005-03-15') })).status, 200);
  assert.equal((await patch(`${base}/location`, { value_json: JSON.stringify(' 旧港 ') })).status, 200);
  let byKey = Object.fromEntries((await (await ctx.request(base)).json()).map((row) => [row.field_key, row.value_json]));
  assert.equal(byKey.time, JSON.stringify('1005-03-15'));
  assert.equal(byKey.location, JSON.stringify('旧港'));

  assert.equal((await patch(`${base}/location`, { value_json: null })).status, 200);
  byKey = Object.fromEntries((await (await ctx.request(base)).json()).map((row) => [row.field_key, row.value_json]));
  assert.equal(byKey.location, null);

  assert.equal((await patch(`${base}/time`, { value_json: JSON.stringify('明天') })).status, 400);
  assert.equal((await patch(`${base}/weather`, { value_json: JSON.stringify('雨') })).status, 400);
  assert.equal((await ctx.request('/api/worlds/no-such/profile-defaults')).status, 404);
});
