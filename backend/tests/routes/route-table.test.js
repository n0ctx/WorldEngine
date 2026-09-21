/**
 * route-table.test.js — 回合相关路由表的快照
 *
 * 合并 chat / writing 的端点实现时，URL 是对前端的硬契约（前端 API 测试按字面量锁死）。
 * 本测试把 method + 完整路径冻结成快照，漏挂、改名、顺手"统一"前缀都会立刻变红。
 *
 * 再生成快照：WE_UPDATE_SNAPSHOTS=1 node --test tests/routes/route-table.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import chatRoutes from '../../routes/chat.js';
import writingRoutes from '../../routes/writing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = path.join(__dirname, '__snapshots__', 'route-table.snap');

/** 把一个 express Router 展开成 ["METHOD /挂载前缀/路径", ...]，排序后返回 */
function collectRoutes(router, mountPath) {
  const entries = [];
  for (const layer of router.stack) {
    if (!layer.route) continue;
    const routePath = layer.route.path === '/' ? '' : layer.route.path;
    for (const method of Object.keys(layer.route.methods)) {
      entries.push(`${method.toUpperCase()} ${mountPath}${routePath}`);
    }
  }
  return entries.sort();
}

test('chat 与 writing 的路由表保持稳定', () => {
  const table = {
    // server.js: app.use('/api/sessions', chatRoutes)
    chat: collectRoutes(chatRoutes, '/api/sessions'),
    // server.js: app.use('/api/worlds', writingRoutes)
    writing: collectRoutes(writingRoutes, '/api/worlds'),
  };
  const actual = `${JSON.stringify(table, null, 2)}\n`;

  if (process.env.WE_UPDATE_SNAPSHOTS === '1') {
    fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
    fs.writeFileSync(SNAPSHOT_PATH, actual, 'utf-8');
    return;
  }

  const expected = fs.readFileSync(SNAPSHOT_PATH, 'utf-8');
  assert.equal(actual, expected, '路由表发生变化：URL 是前端硬契约，确认不是漏挂或改名再更新快照');
});
