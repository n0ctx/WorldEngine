import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTablesToMarkdown } from '../../services/table-memory-ops.js';
import { emptyTables } from '../../services/table-memory-schema.js';

// 轻量：验证 GET 响应 shape 的核心拼装（渲染 + 结构）无需起 server。
test('GET 响应 shape：tables + markdown', () => {
  const tables = emptyTables();
  tables.tables.items.rows.push({ id: 1, 物品: '钥匙' });
  const body = { tables, markdown: renderTablesToMarkdown(tables, { withId: false }) };
  assert.ok(body.tables.tables.items.rows.length === 1);
  assert.match(body.markdown, /物品表/);
});
