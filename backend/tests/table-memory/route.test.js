import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTablesToMarkdown } from '../../services/table-memory-ops.js';
import { emptyTables } from '../../services/table-memory-schema.js';
import { createRouteTestContext } from '../helpers/http.js';
import { insertCharacter, insertSession, insertWorld } from '../helpers/fixtures.js';

// 轻量：验证 GET 响应 shape 的核心拼装（渲染 + 结构）无需起 server。
test('GET 响应 shape：tables + markdown', () => {
  const tables = emptyTables();
  tables.tables.items.rows.push({ id: 1, 物品: '钥匙' });
  const body = { tables, markdown: renderTablesToMarkdown(tables, { withId: false }) };
  assert.ok(body.tables.tables.items.rows.length === 1);
  assert.match(body.markdown, /物品表/);
});

test('PUT /table-memory 非法 body → 400 不写入', async (t) => {
  const ctx = createRouteTestContext('route-put-400');
  t.after(() => ctx.close());
  const world = insertWorld(ctx.sandbox.db, { name: '测试世界' });
  const character = insertCharacter(ctx.sandbox.db, world.id, { name: '测试角色' });
  const session = insertSession(ctx.sandbox.db, { character_id: character.id, world_id: world.id });
  const res = await ctx.request(`/api/sessions/${session.id}/table-memory`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tables: null }),
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, '表格数据格式无效');
});

test('GET /table-memory 不存在会话 → 404', async (t) => {
  const ctx = createRouteTestContext('route-get-404');
  t.after(() => ctx.close());
  const res = await ctx.request('/api/sessions/no-such-session/table-memory');
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error, '会话不存在');
});
