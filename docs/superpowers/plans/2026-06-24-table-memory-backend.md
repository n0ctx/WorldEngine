# 表格记忆系统（后端）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 AI 互动小说 agent 增加 5 张内置的 md 表格记忆（关系/物品/地点/剧情线/世界状态），由副 LLM 每轮以 ops 增量更新，并与现有重生成/回滚/删会话机制完全同步。

**Architecture:** 每个 session 一个结构化 JSON 文件为真源（`data/table_memory/{sessionId}/tables.json`），渲染成 md 表格注入 prompt。副 LLM 每轮输出 `add/update/close/noop` ops，代码执行（无 delete 权限）。回滚通过 turn record 新列 `table_memory_snapshot` 还原，完全对齐现有长期记忆（LTM）的快照机制。

**Tech Stack:** Node.js (ESM)、better-sqlite3、`node:test`、现有 `llm.complete` + `renderBackendPrompt` 副模型调用框架。

## Global Constraints

- 数据库查询只能放在 `backend/db/queries/`（项目硬约束）。
- DB 迁移用 `backend/db/schema.js` 内幂等 `try { db.exec('ALTER TABLE ...') } catch {}` 模式，**不新建 migrations 目录**。
- 副 LLM 调用统一走 `llm.complete(prompt, { configScope: resolveAuxScope(sessionId), callType, conversationId, timeoutMs: LLM_BACKGROUND_TASK_TIMEOUT_MS })`。
- prompt 模板放 `backend/prompts/templates/`，用 `renderBackendPrompt(name, vars)` 渲染。
- 数据目录根：`process.env.WE_DATA_DIR || <repo>/data`（与 `long-term-memory.js` 同款解析）。
- 测试用 `node:test` + `node:assert/strict`；运行 `cd backend && node --test --test-isolation=process "tests/**/*.test.js"`。
- 副 LLM 永远没有 `delete`（真删）权限——只能 `add/update/close/noop`。
- **顺序硬约束**：表格更新（postgen priority 2）必须在 `createTurnRecord`（priority 3，内含快照捕获）之前完成。
- 回滚要同时改 `rollback-chat-session.js` 和 `rollback-writing-session.js` 两条路径。

参考 spec：`docs/superpowers/specs/2026-06-24-table-memory-backend-design.md`

---

## 文件结构

| 文件 | 操作 | 职责 |
|---|---|---|
| `backend/services/table-memory-schema.js` | 创建 | `TABLE_SCHEMAS` 常量（5 表列定义）、字段限长常量、`emptyTables()` |
| `backend/services/table-memory-ops.js` | 创建 | 纯函数 `applyOps(tables, ops)`、`renderTablesToMarkdown(tables, {withId})` |
| `backend/services/table-memory.js` | 创建 | JSON 文件 IO、`updateTableMemory`（副 LLM）、`restoreTablesFromTurnRecord`、`deleteTableMemoryDir` |
| `backend/prompts/templates/memory-table-update.md` | 创建 | 副 LLM 更新 prompt |
| `backend/db/schema.js` | 修改:497 后 | 加 `table_memory_snapshot` 列迁移 |
| `backend/db/queries/turn-records.js` | 修改 | 加 `updateTurnRecordTableSnapshot` |
| `backend/memory/turn-summarizer.js` | 修改 | `createTurnRecord` 内回填表格快照 |
| `backend/app/shared/rollback/rollback-chat-session.js` | 修改 | 接入 `restoreTablesFromTurnRecord` |
| `backend/app/shared/rollback/rollback-writing-session.js` | 修改 | 接入 `restoreTablesFromTurnRecord` |
| `backend/services/cleanup-registrations.js` | 修改 | 注册 session/character/world 删除钩子 |
| `backend/app/chat/build-chat-postgen-tasks.js` | 修改 | 加 `table-memory` priority-2 任务 |
| `backend/app/writing/build-writing-postgen-tasks.js` | 修改 | 加 `table-memory` priority-2 任务 |
| `backend/prompts/assembler.js` | 修改:~253,~492 | 注入渲染后的 md 表格 |
| `backend/routes/table-memory.js` | 创建 | GET/PUT HTTP 接口 |
| `backend/server.js` | 修改:~42,~166 | 挂载路由 |
| `backend/tests/table-memory/*.test.js` | 创建 | 单测 |

---

## Task 1: 表结构常量与空表工厂

**Files:**
- Create: `backend/services/table-memory-schema.js`
- Test: `backend/tests/table-memory/schema.test.js`

**Interfaces:**
- Produces:
  - `TABLE_SCHEMAS`: `Record<string, { name: string, columns: string[] }>`，key 为 `relations|items|places|plotlines|world`。`columns` 不含内置 `id`/`别名`。
  - `TABLE_KEYS`: `string[]` = `Object.keys(TABLE_SCHEMAS)`。
  - `FIELD_MAX_CHARS`: `number` = 60。
  - `emptyTables(): { version:number, tables:Record<string,{rows:[],nextId:1}>, archive:Record<string,[]> }`

- [ ] **Step 1: 写失败测试**

```javascript
// backend/tests/table-memory/schema.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { TABLE_SCHEMAS, TABLE_KEYS, emptyTables } from '../../services/table-memory-schema.js';

test('TABLE_SCHEMAS 含 5 张表且列不含内置 id/别名', () => {
  assert.deepEqual(TABLE_KEYS, ['relations', 'items', 'places', 'plotlines', 'world']);
  for (const key of TABLE_KEYS) {
    const cols = TABLE_SCHEMAS[key].columns;
    assert.ok(Array.isArray(cols) && cols.length > 0);
    assert.ok(!cols.includes('id') && !cols.includes('别名'), `${key} 列不应含 id/别名`);
  }
  assert.equal(TABLE_SCHEMAS.relations.name, '关系表');
});

test('emptyTables 每表 rows 为空、nextId 为 1、archive 齐全', () => {
  const t = emptyTables();
  assert.equal(t.version, 1);
  for (const key of TABLE_KEYS) {
    assert.deepEqual(t.tables[key], { rows: [], nextId: 1 });
    assert.deepEqual(t.archive[key], []);
  }
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && node --test "tests/table-memory/schema.test.js"`
Expected: FAIL（`Cannot find module ... table-memory-schema.js`）

- [ ] **Step 3: 写实现**

```javascript
// backend/services/table-memory-schema.js
/**
 * table-memory-schema.js — 5 张内置表格记忆的结构定义（列写死）
 * 每行额外含两个内置列：id（代码分配的自增主键）、别名（实体历史称呼）
 */

export const FIELD_MAX_CHARS = 60;

export const TABLE_SCHEMAS = {
  relations: { name: '关系表', columns: ['主体A', '主体B', '关系类型', '信任/敌意', '债务/承诺', '冲突点', '最近变化'] },
  items:     { name: '物品表', columns: ['物品', '持有人/位置', '类型', '效果/用途', '限制条件', '状态'] },
  places:    { name: '地点表', columns: ['地点', '所属势力', '当前状态', '危险/资源', '已发生事件', '可触发内容'] },
  plotlines: { name: '剧情线表', columns: ['剧情线', '关联角色/地点', '当前阶段', '紧急度', '玩家是否介入', '后台处理结果', '状态'] },
  world:     { name: '世界状态表', columns: ['规则/事实', '影响范围', '当前状态', '来源事件', '是否可逆'] },
};

export const TABLE_KEYS = Object.keys(TABLE_SCHEMAS);

export function emptyTables() {
  const tables = {};
  const archive = {};
  for (const key of TABLE_KEYS) {
    tables[key] = { rows: [], nextId: 1 };
    archive[key] = [];
  }
  return { version: 1, tables, archive };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && node --test "tests/table-memory/schema.test.js"`
Expected: PASS（2 tests）

- [ ] **Step 5: 提交**

```bash
git add backend/services/table-memory-schema.js backend/tests/table-memory/schema.test.js
git commit -m "feat(table-memory): 表结构常量与空表工厂"
```

---

## Task 2: applyOps 纯函数（ops 执行核心）

**Files:**
- Create: `backend/services/table-memory-ops.js`
- Test: `backend/tests/table-memory/apply-ops.test.js`

**Interfaces:**
- Consumes: `TABLE_SCHEMAS`, `TABLE_KEYS`, `FIELD_MAX_CHARS`, `emptyTables`（Task 1）
- Produces: `applyOps(tables, ops): { tables, applied:number, dropped:number }`
  - 不修改入参（返回新对象，深拷贝）。
  - `add`：忽略传入 id，分配 `tables[table].nextId++`，新行 `{ id, ...合法列, 别名 }`，未知列丢弃，字段超 `FIELD_MAX_CHARS` 截断。
  - `update`：按 id 定位 `rows`，仅覆盖 `fields` 中的合法列（截断）；未知 id/table 丢弃并计入 dropped。
  - `close`：按 id 把行从 `rows` 移入 `archive[table]`。
  - `noop`：不动。
  - 任何未知 `op`/`table`/坏结构：丢弃，计入 dropped，不抛错。

- [ ] **Step 1: 写失败测试**

```javascript
// backend/tests/table-memory/apply-ops.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOps } from '../../services/table-memory-ops.js';
import { emptyTables } from '../../services/table-memory-schema.js';

test('add 分配自增 id 并保留别名、丢弃未知列', () => {
  const { tables, applied } = applyOps(emptyTables(), [
    { table: 'places', op: 'add', row: { 地点: '城东仓库', 所属势力: '黑帮', 不存在列: 'x', 别名: '仓库' } },
  ]);
  assert.equal(applied, 1);
  const rows = tables.places.rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 1);
  assert.equal(rows[0]['地点'], '城东仓库');
  assert.equal(rows[0]['别名'], '仓库');
  assert.ok(!('不存在列' in rows[0]));
  assert.equal(tables.places.nextId, 2);
});

test('update 按 id 只改给定列，未知 id 计入 dropped', () => {
  let t = applyOps(emptyTables(), [{ table: 'relations', op: 'add', row: { 主体A: '张三', 信任: '0' } }]).tables;
  const r = applyOps(t, [
    { table: 'relations', op: 'update', id: 1, fields: { '信任/敌意': '-2', 最近变化: '撒谎被识破' } },
    { table: 'relations', op: 'update', id: 99, fields: { 主体A: 'X' } },
  ]);
  assert.equal(r.applied, 1);
  assert.equal(r.dropped, 1);
  const row = r.tables.relations.rows[0];
  assert.equal(row['信任/敌意'], '-2');
  assert.equal(row['最近变化'], '撒谎被识破');
  assert.equal(row['主体A'], '张三');
});

test('close 把行移入 archive，rows 清空', () => {
  let t = applyOps(emptyTables(), [{ table: 'plotlines', op: 'add', row: { 剧情线: '救妹' } }]).tables;
  const r = applyOps(t, [{ table: 'plotlines', op: 'close', id: 1, reason: '妹妹已死' }]);
  assert.equal(r.tables.plotlines.rows.length, 0);
  assert.equal(r.tables.archive.plotlines.length, 1);
  assert.equal(r.tables.plotlines.archive, undefined); // archive 不挂在表节点下
});

test('close 后 archive[plotlines] 含该行；noop 与未知 op 安全', () => {
  let t = applyOps(emptyTables(), [{ table: 'plotlines', op: 'add', row: { 剧情线: '救妹' } }]).tables;
  const r = applyOps(t, [
    { table: 'plotlines', op: 'close', id: 1 },
    { table: 'items', op: 'noop' },
    { table: 'items', op: 'delete', id: 1 },
    { table: '不存在表', op: 'add', row: {} },
    'garbage',
  ]);
  assert.equal(r.tables.archive.plotlines.length, 1);
  assert.equal(r.tables.archive.plotlines[0]['剧情线'], '救妹');
  assert.equal(r.dropped, 3); // delete + 未知表 + garbage
});

test('字段超长被截断到 FIELD_MAX_CHARS', () => {
  const long = '字'.repeat(200);
  const { tables } = applyOps(emptyTables(), [{ table: 'world', op: 'add', row: { '规则/事实': long } }]);
  assert.equal(tables.world.rows[0]['规则/事实'].length, 60);
});

test('applyOps 不修改入参', () => {
  const orig = emptyTables();
  const snapshot = JSON.stringify(orig);
  applyOps(orig, [{ table: 'items', op: 'add', row: { 物品: '钥匙' } }]);
  assert.equal(JSON.stringify(orig), snapshot);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && node --test "tests/table-memory/apply-ops.test.js"`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

```javascript
// backend/services/table-memory-ops.js
/**
 * table-memory-ops.js — 表格记忆纯函数：ops 执行 + md 渲染
 * 不做 IO、不调 LLM，便于单测。
 */
import { TABLE_SCHEMAS, TABLE_KEYS, FIELD_MAX_CHARS } from './table-memory-schema.js';

function clampField(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, FIELD_MAX_CHARS);
}

// 只保留该表的合法列（含内置「别名」），其余丢弃；返回清洗后的值对象
function sanitizeRow(tableKey, raw) {
  const cols = TABLE_SCHEMAS[tableKey].columns;
  const out = {};
  for (const col of cols) {
    if (raw[col] != null && raw[col] !== '') out[col] = clampField(raw[col]);
  }
  if (raw['别名'] != null && raw['别名'] !== '') out['别名'] = clampField(raw['别名']);
  return out;
}

export function applyOps(tables, ops) {
  const next = JSON.parse(JSON.stringify(tables)); // 深拷贝，绝不改入参
  let applied = 0;
  let dropped = 0;
  const list = Array.isArray(ops) ? ops : [];

  for (const op of list) {
    const tableKey = op && typeof op === 'object' ? op.table : undefined;
    if (!tableKey || !TABLE_KEYS.includes(tableKey)) { dropped++; continue; }
    const t = next.tables[tableKey];

    switch (op.op) {
      case 'noop':
        break;
      case 'add': {
        const row = sanitizeRow(tableKey, op.row || {});
        if (Object.keys(row).length === 0) { dropped++; break; }
        row.id = t.nextId++;
        t.rows.push(row);
        applied++;
        break;
      }
      case 'update': {
        const target = t.rows.find((r) => r.id === op.id);
        if (!target || !op.fields || typeof op.fields !== 'object') { dropped++; break; }
        const clean = sanitizeRow(tableKey, op.fields);
        if (Object.keys(clean).length === 0) { dropped++; break; }
        Object.assign(target, clean);
        applied++;
        break;
      }
      case 'close': {
        const idx = t.rows.findIndex((r) => r.id === op.id);
        if (idx < 0) { dropped++; break; }
        const [moved] = t.rows.splice(idx, 1);
        next.archive[tableKey].push(moved);
        applied++;
        break;
      }
      default:
        dropped++;
    }
  }
  return { tables: next, applied, dropped };
}
```

> 注：测试里 `r.tables.plotlines.archive ?? r.tables.archive` 那行只是 sanity 断言 archive 不挂在表下，可保留。

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && node --test "tests/table-memory/apply-ops.test.js"`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/services/table-memory-ops.js backend/tests/table-memory/apply-ops.test.js
git commit -m "feat(table-memory): applyOps ops 执行纯函数"
```

---

## Task 2.5: renderTablesToMarkdown 渲染纯函数

**Files:**
- Modify: `backend/services/table-memory-ops.js`
- Test: `backend/tests/table-memory/render.test.js`

**Interfaces:**
- Produces: `renderTablesToMarkdown(tables, { withId = false } = {}): string`
  - 每张**非空**表渲染成 `### 名称` + md 表格；空表跳过。
  - `withId=true` 时首列为 `id`；末列为 `别名`（有任一行含别名才显示该列）。
  - archive 不渲染。全空返回 `''`。

- [ ] **Step 1: 写失败测试**

```javascript
// backend/tests/table-memory/render.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOps, renderTablesToMarkdown } from '../../services/table-memory-ops.js';
import { emptyTables } from '../../services/table-memory-schema.js';

test('空表渲染为空串', () => {
  assert.equal(renderTablesToMarkdown(emptyTables()), '');
});

test('withId=false 不含 id 列，含表标题与列头', () => {
  const { tables } = applyOps(emptyTables(), [
    { table: 'items', op: 'add', row: { 物品: '钥匙', 状态: '完好' } },
  ]);
  const md = renderTablesToMarkdown(tables, { withId: false });
  assert.match(md, /### 物品表/);
  assert.match(md, /\| 物品 \|/);
  assert.ok(!/\| id \|/.test(md));
  assert.match(md, /钥匙/);
});

test('withId=true 首列为 id', () => {
  const { tables } = applyOps(emptyTables(), [
    { table: 'items', op: 'add', row: { 物品: '钥匙' } },
  ]);
  const md = renderTablesToMarkdown(tables, { withId: true });
  assert.match(md, /\| id \| 物品 \|/);
  assert.match(md, /\| 1 \|/);
});

test('只渲染非空表', () => {
  const { tables } = applyOps(emptyTables(), [
    { table: 'places', op: 'add', row: { 地点: '城东' } },
  ]);
  const md = renderTablesToMarkdown(tables);
  assert.match(md, /### 地点表/);
  assert.ok(!/### 关系表/.test(md));
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && node --test "tests/table-memory/render.test.js"`
Expected: FAIL（`renderTablesToMarkdown is not a function`）

- [ ] **Step 3: 写实现（追加到 table-memory-ops.js）**

```javascript
// 追加到 backend/services/table-memory-ops.js 末尾

function renderOneTable(tableKey, rows, withId) {
  const schema = TABLE_SCHEMAS[tableKey];
  const hasAlias = rows.some((r) => r['别名'] != null && r['别名'] !== '');
  const header = [...(withId ? ['id'] : []), ...schema.columns, ...(hasAlias ? ['别名'] : [])];
  const cell = (v) => String(v ?? '').replace(/\|/g, '\\|');
  const lines = [];
  lines.push(`### ${schema.name}`);
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${header.map(() => '---').join(' | ')} |`);
  for (const r of rows) {
    const vals = header.map((col) => cell(col === 'id' ? r.id : r[col]));
    lines.push(`| ${vals.join(' | ')} |`);
  }
  return lines.join('\n');
}

export function renderTablesToMarkdown(tables, { withId = false } = {}) {
  const blocks = [];
  for (const key of TABLE_KEYS) {
    const rows = tables?.tables?.[key]?.rows ?? [];
    if (rows.length === 0) continue;
    blocks.push(renderOneTable(key, rows, withId));
  }
  return blocks.join('\n\n');
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && node --test "tests/table-memory/render.test.js"`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/services/table-memory-ops.js backend/tests/table-memory/render.test.js
git commit -m "feat(table-memory): renderTablesToMarkdown 渲染纯函数"
```

---

## Task 3: 文件 IO 与回滚还原（table-memory.js 基础）

**Files:**
- Create: `backend/services/table-memory.js`
- Test: `backend/tests/table-memory/io-rollback.test.js`

**Interfaces:**
- Consumes: `emptyTables`（Task 1）
- Produces:
  - `readTables(sessionId): object` — 读不到/坏 JSON 返回 `emptyTables()`。
  - `writeTables(sessionId, tables): void`
  - `readTablesRaw(sessionId): string` — 文件全文（无文件返回 `''`），供快照回填。
  - `deleteTableMemoryDir(sessionId): void`
  - `restoreTablesFromTurnRecord(sessionId, lastRecord): void` — 三态：lastRecord 空→删目录；`table_memory_snapshot==null`→不动；否则覆盖写。

- [ ] **Step 1: 写失败测试**

```javascript
// backend/tests/table-memory/io-rollback.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-'));
process.env.WE_DATA_DIR = tmp;

const { readTables, writeTables, readTablesRaw, deleteTableMemoryDir, restoreTablesFromTurnRecord } =
  await import('../../services/table-memory.js');
const { emptyTables } = await import('../../services/table-memory-schema.js');

test('无文件时 readTables 返回空表、readTablesRaw 返回空串', () => {
  assert.deepEqual(readTables('sX'), emptyTables());
  assert.equal(readTablesRaw('sX'), '');
});

test('write 后 read 往返一致', () => {
  const t = emptyTables();
  t.tables.items.rows.push({ id: 1, 物品: '钥匙' });
  t.tables.items.nextId = 2;
  writeTables('sA', t);
  assert.deepEqual(readTables('sA'), t);
});

test('restore: lastRecord 为空 → 删目录', () => {
  writeTables('sB', emptyTables());
  restoreTablesFromTurnRecord('sB', null);
  assert.equal(readTablesRaw('sB'), '');
});

test('restore: 快照为 null（旧记录）→ 文件不动', () => {
  const t = emptyTables(); t.tables.world.rows.push({ id: 1, '规则/事实': '战争' });
  writeTables('sC', t);
  restoreTablesFromTurnRecord('sC', { table_memory_snapshot: null });
  assert.deepEqual(readTables('sC'), t);
});

test('restore: 有快照 → 覆盖写', () => {
  const snap = emptyTables(); snap.tables.places.rows.push({ id: 1, 地点: '旧城' });
  writeTables('sD', emptyTables()); // 当前是空
  restoreTablesFromTurnRecord('sD', { table_memory_snapshot: JSON.stringify(snap) });
  assert.equal(readTables('sD').tables.places.rows[0].地点, '旧城');
});

test('deleteTableMemoryDir 清空', () => {
  writeTables('sE', emptyTables());
  deleteTableMemoryDir('sE');
  assert.equal(readTablesRaw('sE'), '');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && node --test "tests/table-memory/io-rollback.test.js"`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现**

```javascript
// backend/services/table-memory.js
/**
 * table-memory.js — 会话级表格记忆 JSON 文件 IO、副 LLM 更新、回滚还原
 *
 * 磁盘路径：data/table_memory/{sessionId}/tables.json
 * 清理：cleanup-registrations.js 注册 session 钩子删整个目录
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLogger, formatMeta } from '../utils/logger.js';
import { emptyTables } from './table-memory-schema.js';

const log = createLogger('table-mem');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.WE_DATA_DIR
  ? path.resolve(process.env.WE_DATA_DIR)
  : path.resolve(__dirname, '..', '..', 'data');

function tablesDir(sessionId) {
  return path.join(DATA_DIR, 'table_memory', sessionId);
}
function tablesPath(sessionId) {
  return path.join(tablesDir(sessionId), 'tables.json');
}

export function readTablesRaw(sessionId) {
  try { return fs.readFileSync(tablesPath(sessionId), 'utf-8'); } catch { return ''; }
}

export function readTables(sessionId) {
  const raw = readTablesRaw(sessionId);
  if (!raw) return emptyTables();
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.tables && parsed.archive) return parsed;
    return emptyTables();
  } catch { return emptyTables(); }
}

export function writeTables(sessionId, tables) {
  const dir = tablesDir(sessionId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tablesPath(sessionId), JSON.stringify(tables ?? emptyTables(), null, 2), 'utf-8');
}

export function deleteTableMemoryDir(sessionId) {
  try { fs.rmSync(tablesDir(sessionId), { recursive: true, force: true }); } catch {}
}

/**
 * 按 turn record 中的快照还原 tables.json（对齐 restoreLtmFromTurnRecord 三态语义）。
 */
export function restoreTablesFromTurnRecord(sessionId, lastRecord) {
  const sid = sessionId.slice(0, 8);
  if (!lastRecord) {
    deleteTableMemoryDir(sessionId);
    log.info(`ROLLBACK WIPE  ${formatMeta({ session: sid })}`);
    return;
  }
  const snapshot = lastRecord.table_memory_snapshot;
  if (snapshot == null) {
    log.info(`ROLLBACK SKIP (legacy)  ${formatMeta({ session: sid })}`);
    return;
  }
  const dir = tablesDir(sessionId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tablesPath(sessionId), String(snapshot), 'utf-8');
  log.info(`ROLLBACK RESTORE  ${formatMeta({ session: sid, bytes: String(snapshot).length })}`);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && node --test "tests/table-memory/io-rollback.test.js"`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/services/table-memory.js backend/tests/table-memory/io-rollback.test.js
git commit -m "feat(table-memory): 文件 IO 与回滚还原"
```

---

## Task 4: 副 LLM 更新 prompt 模板 + updateTableMemory

**Files:**
- Create: `backend/prompts/templates/memory-table-update.md`
- Modify: `backend/services/table-memory.js`
- Test: `backend/tests/table-memory/update.test.js`

**Interfaces:**
- Consumes: `applyOps`、`renderTablesToMarkdown`（Task 2/2.5）、`readTables`/`writeTables`（Task 3）、`llm.complete`、`renderBackendPrompt`、`resolveAuxScope`
- Produces: `updateTableMemory(sessionId, turnText): Promise<void>`
  - 读当前表 → 渲染（withId=true）+ turnText 组 prompt → `llm.complete` → 解析 ops JSON（剥 `<think>` 与 markdown 围栏，取首尾 `[]`）→ `applyOps` → `writeTables`。
  - 解析失败重试至多 `STATE_UPDATE_JSON_RETRY_MAX` 次；全失败则不写、告警返回。
  - 导出 `__parseOps(raw): array|null` 供单测（解析逻辑可独立测）。

- [ ] **Step 1: 写 prompt 模板**

```markdown
<!-- backend/prompts/templates/memory-table-update.md -->
你是互动小说的**表格状态维护器**。只输出操作 JSON，绝不写剧情、不输出任何解释。

# 当前表格（含 id 列，id 是行的唯一标识）
{{CURRENT_TABLES}}

# 本轮新增正文
{{TURN_TEXT}}

# 规则
1. 只输出一个 JSON 数组，每个元素是一个操作。除 JSON 外不输出任何字符。
2. 操作只有四种：
   - `{"table":"<表key>","op":"add","row":{列:值,...}}` 新建行（不要写 id，系统自动分配）
   - `{"table":"<表key>","op":"update","id":<行id>,"fields":{列:值,...}}` 改已有行（id 必须照抄上方表中真实存在的 id）
   - `{"table":"<表key>","op":"close","id":<行id>,"reason":"..."}` 归档退场的行（剧情线关闭、NPC 死亡、物品消耗）
   - `{"table":"<表key>","op":"noop"}` 该表本轮无变化（每张你审阅过但没动的表都要给一个 noop）
3. **新建前必须先在上方表中按主名和「别名」列查重**：若该实体已存在（哪怕换了称呼），用 update 改它并把新称呼追加进「别名」字段，不要新建重复行。
4. 表 key 固定为：relations(关系) / items(物品) / places(地点) / plotlines(剧情线) / world(世界状态)。只能用这些 key 和它们已有的列名。
5. 字段值精炼：「最近变化」「已发生事件」等只写结果不写过程，每个 ≤ 一句话。
6. 只有发生**实质变化**才动表；闲聊、无信息推进时全部 noop。

只输出 JSON 数组：
```

- [ ] **Step 2: 写失败测试（聚焦解析，mock llm）**

```javascript
// backend/tests/table-memory/update.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

const { __parseOps } = await import('../../services/table-memory.js');

test('__parseOps 剥 think 与围栏后解析数组', () => {
  const raw = '<think>琢磨</think>\n```json\n[{"table":"items","op":"noop"}]\n```';
  assert.deepEqual(__parseOps(raw), [{ table: 'items', op: 'noop' }]);
});

test('__parseOps 截取首尾方括号之间内容', () => {
  const raw = '好的：[{"table":"places","op":"add","row":{"地点":"城东"}}] 完毕';
  const ops = __parseOps(raw);
  assert.equal(ops[0].op, 'add');
});

test('__parseOps 坏 JSON 返回 null', () => {
  assert.equal(__parseOps('not json at all'), null);
  assert.equal(__parseOps('[{bad'), null);
});
```

- [ ] **Step 3: 运行确认失败**

Run: `cd backend && node --test "tests/table-memory/update.test.js"`
Expected: FAIL（`__parseOps` 未导出）

- [ ] **Step 4: 写实现（追加 imports + 函数到 table-memory.js）**

在 `table-memory.js` 顶部 import 区追加：

```javascript
import * as llm from '../llm/index.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';
import { resolveAuxScope } from '../utils/aux-scope.js';
import { LLM_TASK_TEMPERATURE, LLM_STATE_UPDATE_MAX_TOKENS, STATE_UPDATE_JSON_RETRY_MAX, LLM_BACKGROUND_TASK_TIMEOUT_MS } from '../utils/constants.js';
import { applyOps, renderTablesToMarkdown } from './table-memory-ops.js';
import { readTables, writeTables } from './table-memory.js'; // 同文件内直接调用即可，无需 import
```

> 注：`readTables`/`writeTables` 在同文件内，直接调用，不要自 import。上面那行仅示意，实际删除该自引用行。

追加函数：

```javascript
export function __parseOps(raw) {
  let body = String(raw ?? '')
    .replace(/<think>[\s\S]*?<\/think>\n*/g, '')
    .replace(/<think>[\s\S]*$/, '')
    .trim();
  body = body.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    const arr = JSON.parse(body.slice(start, end + 1));
    return Array.isArray(arr) ? arr : null;
  } catch { return null; }
}

export async function updateTableMemory(sessionId, turnText) {
  const sid = sessionId.slice(0, 8);
  if (!turnText || !turnText.trim()) return;

  const current = readTables(sessionId);
  const rendered = renderTablesToMarkdown(current, { withId: true }) || '（当前所有表为空）';
  const prompt = [{
    role: 'user',
    content: renderBackendPrompt('memory-table-update.md', {
      CURRENT_TABLES: rendered,
      TURN_TEXT: turnText,
    }),
  }];

  let ops = null;
  for (let attempt = 0; attempt <= STATE_UPDATE_JSON_RETRY_MAX; attempt++) {
    let raw;
    try {
      raw = await llm.complete(prompt, {
        temperature: LLM_TASK_TEMPERATURE,
        maxTokens: LLM_STATE_UPDATE_MAX_TOKENS,
        configScope: resolveAuxScope(sessionId),
        callType: 'table_memory_update',
        conversationId: sessionId,
        timeoutMs: LLM_BACKGROUND_TASK_TIMEOUT_MS,
      });
    } catch (err) {
      log.warn(`UPDATE LLM FAIL  ${formatMeta({ session: sid, attempt, error: err.message })}`);
      continue;
    }
    ops = __parseOps(raw);
    if (ops) break;
    log.warn(`UPDATE PARSE FAIL  ${formatMeta({ session: sid, attempt })}`);
  }

  if (!ops) { log.warn(`UPDATE GIVEUP  ${formatMeta({ session: sid })}`); return; }

  const { tables, applied, dropped } = applyOps(current, ops);
  writeTables(sessionId, tables);
  log.info(`UPDATE DONE  ${formatMeta({ session: sid, applied, dropped })}`);
}
```

> 删除 Step 4 import 段里那行 `import { readTables, writeTables } from './table-memory.js';`（自引用），二者在同文件内已定义。

- [ ] **Step 5: 运行确认通过**

Run: `cd backend && node --test "tests/table-memory/update.test.js"`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add backend/services/table-memory.js backend/prompts/templates/memory-table-update.md backend/tests/table-memory/update.test.js
git commit -m "feat(table-memory): 副 LLM 增量更新 updateTableMemory + ops 解析"
```

---

## Task 5: DB 迁移列 + turn record 快照查询

**Files:**
- Modify: `backend/db/schema.js:497`（在 `long_term_memory_snapshot` 迁移行后）
- Modify: `backend/db/queries/turn-records.js`
- Test: `backend/tests/table-memory/turn-record-snapshot.test.js`

**Interfaces:**
- Produces: `updateTurnRecordTableSnapshot(id, snapshot): void` — `UPDATE turn_records SET table_memory_snapshot = ? WHERE id = ?`

- [ ] **Step 1: 加迁移列**

在 `backend/db/schema.js` 第 497 行（`long_term_memory_snapshot` 那行）之后插入：

```javascript
  // 表格记忆文件快照：保存该轮结束时 tables.json 全文，用于回滚时同步还原表格记忆
  try { db.exec(`ALTER TABLE turn_records ADD COLUMN table_memory_snapshot TEXT`); } catch {}
```

- [ ] **Step 2: 加查询函数**

在 `backend/db/queries/turn-records.js` 的 `updateTurnRecordLtmSnapshot` 之后追加：

```javascript
/**
 * 写入指定 turn record 的表格记忆文件快照（tables.json 全文）。
 * 用于在创建/更新 turn record 后回填该轮表格状态，供回滚时还原。
 */
export function updateTurnRecordTableSnapshot(id, snapshot) {
  db.prepare('UPDATE turn_records SET table_memory_snapshot = ? WHERE id = ?')
    .run(snapshot ?? null, id);
}
```

- [ ] **Step 3: 写测试**

```javascript
// backend/tests/table-memory/turn-record-snapshot.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-tr-'));
process.env.WE_DATA_DIR = tmp;

const db = (await import('../../db/index.js')).default;
const { updateTurnRecordTableSnapshot, getTurnRecordById, upsertTurnRecord } = await import('../../db/queries/turn-records.js');

test('turn_records 表含 table_memory_snapshot 列且可读写', () => {
  const cols = db.prepare('PRAGMA table_info(turn_records)').all().map((c) => c.name);
  assert.ok(cols.includes('table_memory_snapshot'));

  // 需要一个 session 行作外键？turn_records 外键约束视 schema 而定；若约束失败改用直接 insert 绕过。
  const rec = upsertTurnRecord({ session_id: 'sess-x', round_index: 1, summary: 's', user_message_id: null, asst_message_id: null, state_snapshot: null });
  updateTurnRecordTableSnapshot(rec.id, '{"hello":1}');
  assert.equal(getTurnRecordById(rec.id).table_memory_snapshot, '{"hello":1}');
});
```

> 若 `upsertTurnRecord` 因 `session_id` 外键约束失败，改为先插入一条 `sessions` 行（参照 `tests/helpers` 里现有 session 创建辅助），或在测试 sandbox 中关闭外键。执行者按实际报错调整。

- [ ] **Step 4: 运行确认通过**

Run: `cd backend && node --test "tests/table-memory/turn-record-snapshot.test.js"`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add backend/db/schema.js backend/db/queries/turn-records.js backend/tests/table-memory/turn-record-snapshot.test.js
git commit -m "feat(table-memory): turn_records 增 table_memory_snapshot 列与写入查询"
```

---

## Task 6: createTurnRecord 内回填表格快照

**Files:**
- Modify: `backend/memory/turn-summarizer.js`（import 区 + 第 213-219 块附近）

**Interfaces:**
- Consumes: `readTablesRaw`（Task 3）、`updateTurnRecordTableSnapshot`（Task 5）

- [ ] **Step 1: 加 import**

`backend/memory/turn-summarizer.js` import 区追加：

```javascript
import { readTablesRaw } from '../services/table-memory.js';
import { updateTurnRecordTableSnapshot } from '../db/queries/turn-records.js';
```

> 注：`updateTurnRecordTableSnapshot` 可合并进已有的 turn-records import 那一行。

- [ ] **Step 2: 在 LTM 快照回填后追加表格快照回填**

在 `if (record) { try { updateTurnRecordLtmSnapshot(...) } ... }` 块之后追加：

```javascript
  // 表格记忆快照：把当前 tables.json 全文写入本轮 turn record，回滚时精确还原。
  // 依赖：本轮 table-memory postgen 任务（priority 2）已先于本任务（priority 3）完成。
  if (record) {
    try {
      updateTurnRecordTableSnapshot(record.id, readTablesRaw(sessionId));
    } catch (err) {
      log.warn(`TABLE SNAPSHOT FAIL  ${formatMeta({ session: sid, error: err.message })}`);
    }
  }
```

- [ ] **Step 3: 验证（无新测试，跑既有 turn-summarizer 相关测试 + 全量编译）**

Run: `cd backend && node --check memory/turn-summarizer.js && node --test "tests/table-memory/*.test.js"`
Expected: 语法 OK；表格测试全 PASS

- [ ] **Step 4: 提交**

```bash
git add backend/memory/turn-summarizer.js
git commit -m "feat(table-memory): createTurnRecord 回填表格快照"
```

---

## Task 7: 两条回滚路径接入 restoreTablesFromTurnRecord

**Files:**
- Modify: `backend/app/shared/rollback/rollback-chat-session.js`
- Modify: `backend/app/shared/rollback/rollback-writing-session.js`
- Test: `backend/tests/table-memory/rollback-wiring.test.js`

**Interfaces:**
- Consumes: `restoreTablesFromTurnRecord`（Task 3）、`getLatestTurnRecord`（既有）

- [ ] **Step 1: chat 路径接入**

`rollback-chat-session.js`：在 `import { restoreLtmFromTurnRecord } ...` 后追加：

```javascript
import { restoreTablesFromTurnRecord } from '../../../services/table-memory.js';
```

在现有 `restoreLtmFromTurnRecord(sessionId, roundCount === 0 ? null : getLatestTurnRecord(sessionId));` 之后追加同款一行：

```javascript
  restoreTablesFromTurnRecord(
    sessionId,
    roundCount === 0 ? null : getLatestTurnRecord(sessionId)
  );
```

- [ ] **Step 2: writing 路径接入**

先确认 `rollback-writing-session.js` 中 LTM 还原的写法（应有同款 `restoreLtmFromTurnRecord` 调用与 `roundCount`/残留轮计算）。在其 LTM 还原行旁追加对应的 `restoreTablesFromTurnRecord(sessionId, <同一 lastRecord 表达式>)`。

> 执行者：打开该文件，定位 `restoreLtmFromTurnRecord(` 调用，复制其第二参数表达式，紧随其后加一行 `restoreTablesFromTurnRecord(sessionId, <同表达式>);`，并加同款 import。

- [ ] **Step 3: 写最小回归测试（验证函数被串进逻辑——以 io 行为代验）**

```javascript
// backend/tests/table-memory/rollback-wiring.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-rb-'));
process.env.WE_DATA_DIR = tmp;

const { writeTables, readTablesRaw, restoreTablesFromTurnRecord } = await import('../../services/table-memory.js');
const { emptyTables } = await import('../../services/table-memory-schema.js');

test('回滚到零残留：restoreTablesFromTurnRecord(null) 清空表目录', () => {
  writeTables('sRB', emptyTables());
  assert.notEqual(readTablesRaw('sRB'), '');
  restoreTablesFromTurnRecord('sRB', null);
  assert.equal(readTablesRaw('sRB'), '');
});
```

- [ ] **Step 4: 运行 + 语法检查两条回滚文件**

Run: `cd backend && node --check app/shared/rollback/rollback-chat-session.js && node --check app/shared/rollback/rollback-writing-session.js && node --test "tests/table-memory/rollback-wiring.test.js"`
Expected: 语法 OK；测试 PASS

- [ ] **Step 5: 提交**

```bash
git add backend/app/shared/rollback/rollback-chat-session.js backend/app/shared/rollback/rollback-writing-session.js backend/tests/table-memory/rollback-wiring.test.js
git commit -m "feat(table-memory): chat/writing 两条回滚路径接入表格还原"
```

---

## Task 8: 删除钩子注册

**Files:**
- Modify: `backend/services/cleanup-registrations.js`

**Interfaces:**
- Consumes: `deleteTableMemoryDir`（Task 3）、`getSessionIdsByCharacterId`/`getSessionIdsByWorldId`（既有）

- [ ] **Step 1: 加 import**

在 `import { deleteMemoryDir as deleteLongTermMemoryDir } from './long-term-memory.js';` 后追加：

```javascript
import { deleteTableMemoryDir } from './table-memory.js';
```

- [ ] **Step 2: 注册三个钩子**

在「长期记忆文件目录」三个 `registerOnDelete` 块之后追加：

```javascript
// ── 表格记忆文件目录 ─────────────────────────────────────────────
// 模块：table-memory — 管理 data/table_memory/{sessionId}/ 目录

registerOnDelete('session', async (sid) => {
  deleteTableMemoryDir(sid);
});

registerOnDelete('character', async (cid) => {
  for (const sid of getSessionIdsByCharacterId(cid)) {
    deleteTableMemoryDir(sid);
  }
});

registerOnDelete('world', async (wid) => {
  for (const sid of getSessionIdsByWorldId(wid)) {
    deleteTableMemoryDir(sid);
  }
});
```

- [ ] **Step 3: 语法检查**

Run: `cd backend && node --check services/cleanup-registrations.js`
Expected: OK

- [ ] **Step 4: 提交**

```bash
git add backend/services/cleanup-registrations.js
git commit -m "feat(table-memory): 注册 session/character/world 删除清理钩子"
```

---

## Task 9: 两个 postgen builder 加 table-memory 任务

**Files:**
- Modify: `backend/app/chat/build-chat-postgen-tasks.js`
- Modify: `backend/app/writing/build-writing-postgen-tasks.js`

**Interfaces:**
- Consumes: `updateTableMemory`（Task 4）。需要本轮正文文本——取本轮 user+assistant 消息拼接，或复用 builder 已有的取文逻辑。

- [ ] **Step 1: 确认 turnText 来源**

打开 `build-chat-postgen-tasks.js`，确认能取到本轮文本。最稳妥：在任务 `fn` 内取最近一轮消息拼接。加 import：

```javascript
import { updateTableMemory } from '../../services/table-memory.js';
import { getMessagesBySessionId } from '../../db/queries/messages.js';
import { ALL_MESSAGES_LIMIT } from '../../utils/constants.js';
```

- [ ] **Step 2: 在返回数组里、`turn-record` 任务之前插入 priority-2 任务**

```javascript
    {
      label: 'table-memory',
      priority: 2,
      fn: async () => {
        const msgs = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
        const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
        const lastAsst = [...msgs].reverse().find((m) => m.role === 'assistant');
        const turnText = [lastUser?.content, lastAsst?.content].filter(Boolean).join('\n');
        await updateTableMemory(sessionId, turnText);
      },
      keepSseAlive: false,
    },
```

> priority 2 与 `all-state` 同级，二者独立无序；关键是都早于 priority-3 的 `turn-record`，保证快照捕获到本轮表格更新结果。

- [ ] **Step 3: writing builder 同款接入**

打开 `build-writing-postgen-tasks.js`，按同样方式加 import 与 priority-2 `table-memory` 任务（取文方式按该 builder 既有约定；若已有 turnText 变量则直接用）。

- [ ] **Step 4: 语法检查 + 全量后端测试**

Run: `cd backend && node --check app/chat/build-chat-postgen-tasks.js && node --check app/writing/build-writing-postgen-tasks.js && node --test --test-isolation=process "tests/**/*.test.js"`
Expected: 语法 OK；既有测试不回归（表格测试全 PASS）

- [ ] **Step 5: 提交**

```bash
git add backend/app/chat/build-chat-postgen-tasks.js backend/app/writing/build-writing-postgen-tasks.js
git commit -m "feat(table-memory): chat/writing postgen 加每轮表格更新任务"
```

---

## Task 10: assembler 注入渲染后的表格

**Files:**
- Modify: `backend/prompts/assembler.js`（chat 注入点 ~253、writing 注入点 ~492）

**Interfaces:**
- Consumes: `readTables`（Task 3）、`renderTablesToMarkdown`（Task 2.5）

- [ ] **Step 1: 加 import**

`assembler.js` 顶部（`readMemoryFile as readLongTermMemory` import 旁）追加：

```javascript
import { readTables } from '../services/table-memory.js';
import { renderTablesToMarkdown } from '../services/table-memory-ops.js';
```

- [ ] **Step 2: chat 注入点（长期记忆注入块之后）**

在 chat 的 `[8.5] 长期记忆` 注入块（约 249-253）之后追加：

```javascript
  // [8.6] 表格记忆（结构化真源渲染成 md 注入；主模型版不含内部 id）
  {
    const md = renderTablesToMarkdown(readTables(sessionId), { withId: false });
    if (md) {
      dynamicSystemParts.push(`<table_memory>\n${md}\n</table_memory>`);
      log.debug(`│  [8.6] table memory injected  chars=${md.length}`);
    }
  }
```

> 若该作用域内拿不到 `sessionId` 变量名，按本函数实际形参名替换（chat 组装函数应已有 session 标识）。

- [ ] **Step 3: writing 注入点（约 489-492 之后）同款追加**

在 writing 的 `[8.5] 长期记忆` 注入块之后追加同样的 `[8.6]` 块（变量名按 writing 函数作用域调整）。

- [ ] **Step 4: 语法检查 + 后端测试**

Run: `cd backend && node --check prompts/assembler.js && node --test --test-isolation=process "tests/**/*.test.js"`
Expected: 语法 OK；无回归

- [ ] **Step 5: 提交**

```bash
git add backend/prompts/assembler.js
git commit -m "feat(table-memory): assembler 注入渲染后的表格记忆（chat+writing）"
```

---

## Task 11: HTTP 路由 GET/PUT + 挂载

**Files:**
- Create: `backend/routes/table-memory.js`
- Modify: `backend/server.js`（~42 import、~166 挂载）
- Test: `backend/tests/table-memory/route.test.js`

**Interfaces:**
- Consumes: `readTables`/`writeTables`（Task 3）、`renderTablesToMarkdown`（Task 2.5）、`getSessionById`（既有）

- [ ] **Step 1: 写路由**

```javascript
// backend/routes/table-memory.js
/**
 * table-memory.js — 会话级表格记忆 HTTP 接口
 * GET  /api/sessions/:sessionId/table-memory → { tables, markdown }
 * PUT  /api/sessions/:sessionId/table-memory  body: { tables } → { tables, markdown }
 *   PUT 是真删除/手动编辑路径（整体覆盖）。
 */
import express from 'express';
import { getSessionById } from '../db/queries/sessions.js';
import { readTables, writeTables } from '../services/table-memory.js';
import { renderTablesToMarkdown } from '../services/table-memory-ops.js';
import { emptyTables } from '../services/table-memory-schema.js';
import { createLogger, formatMeta } from '../utils/logger.js';

const router = express.Router();
const log = createLogger('table-memory', 'cyan');

router.get('/:sessionId/table-memory', (req, res) => {
  const { sessionId } = req.params;
  if (!getSessionById(sessionId)) {
    log.warn(`table-memory.not_found ${formatMeta({ id: sessionId })}`);
    return res.status(404).json({ error: '会话不存在' });
  }
  const tables = readTables(sessionId);
  res.json({ tables, markdown: renderTablesToMarkdown(tables, { withId: false }) });
});

router.put('/:sessionId/table-memory', (req, res) => {
  const { sessionId } = req.params;
  if (!getSessionById(sessionId)) {
    return res.status(404).json({ error: '会话不存在' });
  }
  const incoming = req.body?.tables;
  const tables = incoming && incoming.tables && incoming.archive ? incoming : emptyTables();
  writeTables(sessionId, tables);
  res.json({ tables, markdown: renderTablesToMarkdown(tables, { withId: false }) });
});

export default router;
```

- [ ] **Step 2: 挂载路由**

`backend/server.js`：在 `import longTermMemoryRoutes ...`（第 42 行）后加：

```javascript
import tableMemoryRoutes from './routes/table-memory.js';
```

在 `app.use('/api/sessions', longTermMemoryRoutes);`（第 166 行）后加：

```javascript
  app.use('/api/sessions', tableMemoryRoutes);
```

- [ ] **Step 3: 写测试（直接测路由 handler 行为：用 supertest 或既有 route 测试模式）**

```javascript
// backend/tests/table-memory/route.test.js
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
```

> 若仓库已有起 express app 的集成测试 helper（参照 `tests/server-hooks.test.js`），执行者可改为真正打 GET/PUT 的端到端测试；否则上面的 shape 测试 + 手动 curl 验证即可。

- [ ] **Step 4: 运行 + 手动验证**

Run: `cd backend && node --check routes/table-memory.js && node --check server.js && node --test "tests/table-memory/route.test.js"`
Expected: 语法 OK；测试 PASS

- [ ] **Step 5: 提交**

```bash
git add backend/routes/table-memory.js backend/server.js backend/tests/table-memory/route.test.js
git commit -m "feat(table-memory): GET/PUT 表格记忆 HTTP 路由与挂载"
```

---

## Task 12: 全量回归 + 收尾

- [ ] **Step 1: 全量后端测试**

Run: `cd backend && node --test --test-isolation=process "tests/**/*.test.js"`
Expected: 全部 PASS（含新增 6 个表格测试文件，既有测试不回归）

- [ ] **Step 2: lint（按项目脚本）**

Run: `cd backend && npm run lint 2>/dev/null || echo "无 lint 脚本，跳过"`
Expected: 通过或无脚本

- [ ] **Step 3: 清理临时文件**

```bash
rm -rf .temp/ 2>/dev/null || true
```

- [ ] **Step 4: 终态提交（若有未提交收尾）**

```bash
git status
# 如有遗漏统一提交
```

---

## 验证口径

- 后端改动：跑 `backend` 全量 `node --test` + lint。
- 端到端表现（重生成/回滚/删会话同步）属前端联调，留待前端 session；本阶段以单测 + 语法检查 + 手动 curl 覆盖后端契约。

## 自检：spec 覆盖映射

| spec 章节 | 对应 Task |
|---|---|
| §2 5 张表固定列 | Task 1 |
| §3 行 ID / 别名归并 | Task 1（id 字段）+ Task 2（add 分配/别名保留）+ Task 4（prompt 归并规则） |
| §4 JSON 真源 / archive | Task 1 + Task 3 |
| §5 ops 增量更新 | Task 2 + Task 4 |
| §5.5 删除/归档生命周期（无 delete 权限） | Task 2（无 delete 分支）+ Task 11（PUT 真删路径） |
| §6 每轮更新 + prompt 注入 | Task 9 + Task 10 |
| §6.5 快照/回滚/重生成/删会话 | Task 5 + Task 6 + Task 7 + Task 8 |
| §7 HTTP 接口 | Task 11 |
| §9 测试 | 各 Task TDD + Task 12 |
