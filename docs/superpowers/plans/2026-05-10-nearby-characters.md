# 写作页面登场角色（Nearby Characters）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 session 级"登场角色"池替代写作页激活角色概念；每轮 combined-state-updater 单次 LLM 调用同时完成 pre-flight、提取、状态/记忆更新；前端右侧栏新增"附近"区块；制卡候选改为本轮登场角色；写卡助手同步 `nearby_enabled` 字段开关。

**Architecture:** 后端新增两张 session 级表 + `character_state_fields.nearby_enabled` 列；`combined-state-updater.js` 增加 nearby pool 段与 `applyNearbyResult` 应用层；turn_records.state_snapshot 扩展 nearby 层；前端 `CastPanel` 重写为 `NearbyPanel`，制卡 modal 候选改为 nearby；assistant 知识/工具同步开关字段。

**Tech Stack:** SQLite (better-sqlite3) / Node.js + Express ES Modules / React 19 + Zustand / Vitest（前后端单测）

**前置约定（每个 task 都遵守）：**
- `npm run check` 在 spec 完成前不应跑（含 lint），仅在每个 task 末尾用 `npm run test:backend` / `npm run test:frontend` 跑相关单测；本计划合并完成后再跑 `npm run check`
- 每个 task 末尾都有 commit；commit message 走项目现有格式（type: 概要）
- branch：执行 Task 0 时创建 `feature/nearby-characters`
- 锁定文件改动须在回执说明：`backend/db/schema.js`（新增表/列，`CREATE TABLE IF NOT EXISTS` / `ALTER ... ADD COLUMN` 追加；不重建已有表）

---

## Task 0: 创建 feature 分支

**Files:** —

- [ ] **Step 1: 创建并切换分支**

```bash
git checkout -b feature/nearby-characters
```

- [ ] **Step 2: 验证分支干净**

```bash
git status
```
Expected: `nothing to commit, working tree clean`

---

## Task 1: DB schema 变更（新表 + 新列）

**Files:**
- Modify: `backend/db/schema.js`（在 `CREATE TABLE IF NOT EXISTS writing_session_characters` 之后追加新表；在 `ALTER` 段追加新列迁移）
- Modify: `SCHEMA.md`（追加两张新表 + `nearby_enabled` 字段说明）

- [ ] **Step 1: 在 schema.js 的 TABLES 字符串中新增两张表**

在 `writing_session_characters` 块之后插入：

```sql
CREATE TABLE IF NOT EXISTS session_nearby_characters (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  memory      TEXT NOT NULL DEFAULT '',
  is_saved    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE(session_id, name)
);

CREATE TABLE IF NOT EXISTS session_nearby_character_state_values (
  id                 TEXT PRIMARY KEY,
  session_id         TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  nearby_id          TEXT NOT NULL REFERENCES session_nearby_characters(id) ON DELETE CASCADE,
  field_key          TEXT NOT NULL,
  runtime_value_json TEXT,
  updated_at         INTEGER NOT NULL,
  UNIQUE(nearby_id, field_key)
);
```

- [ ] **Step 2: 在 schema.js 的 ALTER 迁移段（已有 `ensureColumn` 模式）追加 nearby_enabled**

参照 schema.js 中现有 `ensureColumn` 模式，在迁移函数里添加：

```js
ensureColumn(db, 'character_state_fields', 'nearby_enabled', 'INTEGER NOT NULL DEFAULT 1');
```

旧行由 SQLite 默认值自动填 1。

- [ ] **Step 3: 跑后端测试确认 schema 变更不破坏现有用例**

```bash
cd backend && npm run test
```
Expected: 全绿

- [ ] **Step 4: 同步更新 SCHEMA.md**

在 `### writing_session_characters` 段后追加（注：此表会在 Task 9 删除，先保留）；在 `character_state_fields` 表中添加 `nearby_enabled` 行；新增两节 `### session_nearby_characters` / `### session_nearby_character_state_values`，按 spec §3.1/§3.2 表述。

- [ ] **Step 5: Commit**

```bash
git add backend/db/schema.js SCHEMA.md
git commit -m "feat(db): 新增 session_nearby_characters 表与 character_state_fields.nearby_enabled 列"
```

---

## Task 2: DB queries 层 — session_nearby_characters

**Files:**
- Create: `backend/db/queries/session-nearby-characters.js`
- Test: `backend/tests/db/queries/session-nearby-characters.test.js`

- [ ] **Step 1: 写测试**

`backend/tests/db/queries/session-nearby-characters.test.js`：

```js
import { describe, it, expect, beforeEach } from 'vitest';
import {
  createNearbyCharacter, getNearbyById, getNearbyByName,
  listNearbyBySessionId, updateNearbyName, updateNearbyMemory,
  updateNearbyIsSaved, deleteNearbyById, deleteTransientNotInIds,
} from '../../../db/queries/session-nearby-characters.js';
import { createTestSession } from '../../helpers/fixtures.js';

describe('session-nearby-characters', () => {
  let sessionId;
  beforeEach(() => { sessionId = createTestSession().id; });

  it('create + get by id', () => {
    const id = createNearbyCharacter({ sessionId, name: '张三' });
    const row = getNearbyById(id);
    expect(row).toMatchObject({ id, session_id: sessionId, name: '张三', memory: '', is_saved: 0 });
  });

  it('UNIQUE(session_id, name) 违反则抛错', () => {
    createNearbyCharacter({ sessionId, name: '张三' });
    expect(() => createNearbyCharacter({ sessionId, name: '张三' })).toThrow();
  });

  it('listBySessionId 返回该 session 全部', () => {
    createNearbyCharacter({ sessionId, name: 'A' });
    createNearbyCharacter({ sessionId, name: 'B' });
    expect(listNearbyBySessionId(sessionId)).toHaveLength(2);
  });

  it('getByName 命中', () => {
    createNearbyCharacter({ sessionId, name: '李四' });
    expect(getNearbyByName(sessionId, '李四')).toBeTruthy();
    expect(getNearbyByName(sessionId, '王五')).toBeNull();
  });

  it('updateNearbyIsSaved 切换', () => {
    const id = createNearbyCharacter({ sessionId, name: 'A' });
    updateNearbyIsSaved(id, 1);
    expect(getNearbyById(id).is_saved).toBe(1);
  });

  it('deleteTransientNotInIds 保留 saved', () => {
    const a = createNearbyCharacter({ sessionId, name: 'A' });
    const b = createNearbyCharacter({ sessionId, name: 'B' });
    const c = createNearbyCharacter({ sessionId, name: 'C' });
    updateNearbyIsSaved(a, 1);
    deleteTransientNotInIds(sessionId, [b]); // 保留 b（在白名单）+ a（saved）
    const remaining = listNearbyBySessionId(sessionId).map((r) => r.id).sort();
    expect(remaining).toEqual([a, b].sort());
  });
});
```

如果 `createTestSession` 在 fixtures 中不存在，先扩展（参考已有 session fixture 模式）。

- [ ] **Step 2: 跑测试确认失败**

```bash
cd backend && npx vitest run tests/db/queries/session-nearby-characters.test.js
```
Expected: FAIL (file not found)

- [ ] **Step 3: 实现 queries 文件**

`backend/db/queries/session-nearby-characters.js`：

```js
import { randomUUID } from 'crypto';
import { getDb } from '../db.js';

export function createNearbyCharacter({ sessionId, name, memory = '', isSaved = 0 }) {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  db.prepare(`
    INSERT INTO session_nearby_characters (id, session_id, name, memory, is_saved, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, sessionId, name, memory, isSaved, now, now);
  return id;
}

export function getNearbyById(id) {
  return getDb().prepare(`SELECT * FROM session_nearby_characters WHERE id = ?`).get(id) ?? null;
}

export function getNearbyByName(sessionId, name) {
  return getDb().prepare(
    `SELECT * FROM session_nearby_characters WHERE session_id = ? AND name = ?`
  ).get(sessionId, name) ?? null;
}

export function listNearbyBySessionId(sessionId) {
  return getDb().prepare(
    `SELECT * FROM session_nearby_characters WHERE session_id = ? ORDER BY is_saved DESC, created_at ASC`
  ).all(sessionId);
}

export function updateNearbyName(id, name) {
  getDb().prepare(
    `UPDATE session_nearby_characters SET name = ?, updated_at = ? WHERE id = ?`
  ).run(name, Date.now(), id);
}

export function updateNearbyMemory(id, memory) {
  getDb().prepare(
    `UPDATE session_nearby_characters SET memory = ?, updated_at = ? WHERE id = ?`
  ).run(memory, Date.now(), id);
}

export function updateNearbyIsSaved(id, isSaved) {
  getDb().prepare(
    `UPDATE session_nearby_characters SET is_saved = ?, updated_at = ? WHERE id = ?`
  ).run(isSaved ? 1 : 0, Date.now(), id);
}

export function deleteNearbyById(id) {
  getDb().prepare(`DELETE FROM session_nearby_characters WHERE id = ?`).run(id);
}

/** 删除 sessionId 下所有 transient（is_saved=0）且 id 不在 keepIds 中的行 */
export function deleteTransientNotInIds(sessionId, keepIds) {
  const db = getDb();
  const placeholders = keepIds.length ? keepIds.map(() => '?').join(',') : 'NULL';
  db.prepare(
    `DELETE FROM session_nearby_characters
     WHERE session_id = ? AND is_saved = 0 AND id NOT IN (${placeholders})`
  ).run(sessionId, ...keepIds);
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd backend && npx vitest run tests/db/queries/session-nearby-characters.test.js
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/db/queries/session-nearby-characters.js backend/tests/db/queries/session-nearby-characters.test.js backend/tests/helpers/fixtures.js
git commit -m "feat(db): session-nearby-characters queries + 单测"
```

---

## Task 3: DB queries 层 — session_nearby_character_state_values

**Files:**
- Create: `backend/db/queries/session-nearby-character-state-values.js`
- Test: `backend/tests/db/queries/session-nearby-character-state-values.test.js`

- [ ] **Step 1: 写测试**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import {
  upsertNearbyStateValue, getStateValuesByNearbyId, deleteStateValuesByNearbyId,
} from '../../../db/queries/session-nearby-character-state-values.js';
import { createNearbyCharacter, deleteNearbyById } from '../../../db/queries/session-nearby-characters.js';
import { createTestSession } from '../../helpers/fixtures.js';

describe('session-nearby-character-state-values', () => {
  let sessionId, nearbyId;
  beforeEach(() => {
    sessionId = createTestSession().id;
    nearbyId = createNearbyCharacter({ sessionId, name: 'A' });
  });

  it('upsert 新值', () => {
    upsertNearbyStateValue({ sessionId, nearbyId, fieldKey: 'mood', valueJson: '"开心"' });
    const rows = getStateValuesByNearbyId(nearbyId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ field_key: 'mood', runtime_value_json: '"开心"' });
  });

  it('upsert 同 key 覆盖', () => {
    upsertNearbyStateValue({ sessionId, nearbyId, fieldKey: 'mood', valueJson: '"开心"' });
    upsertNearbyStateValue({ sessionId, nearbyId, fieldKey: 'mood', valueJson: '"难过"' });
    const rows = getStateValuesByNearbyId(nearbyId);
    expect(rows).toHaveLength(1);
    expect(rows[0].runtime_value_json).toBe('"难过"');
  });

  it('CASCADE: 删 nearby 同步删 state values', () => {
    upsertNearbyStateValue({ sessionId, nearbyId, fieldKey: 'mood', valueJson: '"开心"' });
    deleteNearbyById(nearbyId);
    expect(getStateValuesByNearbyId(nearbyId)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd backend && npx vitest run tests/db/queries/session-nearby-character-state-values.test.js
```
Expected: FAIL

- [ ] **Step 3: 实现 queries**

```js
import { randomUUID } from 'crypto';
import { getDb } from '../db.js';

export function upsertNearbyStateValue({ sessionId, nearbyId, fieldKey, valueJson }) {
  const db = getDb();
  const now = Date.now();
  const existing = db.prepare(
    `SELECT id FROM session_nearby_character_state_values WHERE nearby_id = ? AND field_key = ?`
  ).get(nearbyId, fieldKey);
  if (existing) {
    db.prepare(
      `UPDATE session_nearby_character_state_values SET runtime_value_json = ?, updated_at = ? WHERE id = ?`
    ).run(valueJson, now, existing.id);
    return existing.id;
  }
  const id = randomUUID();
  db.prepare(`
    INSERT INTO session_nearby_character_state_values
    (id, session_id, nearby_id, field_key, runtime_value_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, sessionId, nearbyId, fieldKey, valueJson, now);
  return id;
}

export function getStateValuesByNearbyId(nearbyId) {
  return getDb().prepare(
    `SELECT * FROM session_nearby_character_state_values WHERE nearby_id = ? ORDER BY field_key`
  ).all(nearbyId);
}

export function deleteStateValuesByNearbyId(nearbyId) {
  getDb().prepare(`DELETE FROM session_nearby_character_state_values WHERE nearby_id = ?`).run(nearbyId);
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd backend && npx vitest run tests/db/queries/session-nearby-character-state-values.test.js
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/db/queries/session-nearby-character-state-values.js backend/tests/db/queries/session-nearby-character-state-values.test.js
git commit -m "feat(db): session-nearby-character-state-values queries + 单测"
```

---

## Task 4: 后端 service — listNearby / addSavedFromCharacter / patch* / setIsSaved / removeSaved

**Files:**
- Modify: `backend/services/writing-sessions.js`
- Test: `backend/tests/services/nearby-characters.test.js`

- [ ] **Step 1: 写测试**

`backend/tests/services/nearby-characters.test.js`：

```js
import { describe, it, expect, beforeEach } from 'vitest';
import {
  listNearby, addSavedFromCharacter, removeNearby, setNearbyIsSaved,
  patchNearbyMemory, patchNearbyState, renameNearby,
} from '../../services/writing-sessions.js';
import {
  createTestWorld, createTestWritingSession, createTestCharacterField,
  createTestCharacter, setCharacterDefaultStateValue,
} from '../helpers/fixtures.js';

describe('nearby characters service', () => {
  let worldId, sessionId;
  beforeEach(() => {
    worldId = createTestWorld().id;
    createTestCharacterField({ worldId, fieldKey: 'mood', label: '心情', type: 'text', nearbyEnabled: 1 });
    createTestCharacterField({ worldId, fieldKey: 'hp', label: 'HP', type: 'number', nearbyEnabled: 0 });
    sessionId = createTestWritingSession({ worldId }).id;
  });

  it('addSavedFromCharacter: 复制启用字段的 default 值，初始 memory 为空', () => {
    const charId = createTestCharacter({ worldId, name: '李雷' }).id;
    setCharacterDefaultStateValue({ characterId: charId, fieldKey: 'mood', valueJson: '"沉稳"' });
    setCharacterDefaultStateValue({ characterId: charId, fieldKey: 'hp', valueJson: '100' });

    const nearbyId = addSavedFromCharacter(sessionId, charId);
    const list = listNearby(sessionId);
    expect(list).toHaveLength(1);
    const row = list[0];
    expect(row).toMatchObject({ id: nearbyId, name: '李雷', memory: '', is_saved: 1 });
    // 仅启用字段
    expect(row.state.map((s) => s.field_key).sort()).toEqual(['mood']);
    expect(row.state[0].runtime_value_json).toBe('"沉稳"');
  });

  it('addSavedFromCharacter: name 已被占用 → 抛错', () => {
    const charId = createTestCharacter({ worldId, name: '李雷' }).id;
    addSavedFromCharacter(sessionId, charId);
    expect(() => addSavedFromCharacter(sessionId, charId)).toThrow(/name/i);
  });

  it('removeNearby: 直接删除 saved（state 由 CASCADE 清）', () => {
    const charId = createTestCharacter({ worldId, name: '李雷' }).id;
    const nearbyId = addSavedFromCharacter(sessionId, charId);
    removeNearby(sessionId, nearbyId);
    expect(listNearby(sessionId)).toHaveLength(0);
  });

  it('setNearbyIsSaved: transient → saved', () => {
    // 通过低层 API 制造一个 transient
    // 利用 listNearby 验证状态
    const { createNearbyCharacter } = require('../../db/queries/session-nearby-characters.js');
    const id = createNearbyCharacter({ sessionId, name: '王五' });
    setNearbyIsSaved(sessionId, id, 1);
    expect(listNearby(sessionId)[0].is_saved).toBe(1);
  });

  it('patchNearbyMemory / patchNearbyState / renameNearby', () => {
    const charId = createTestCharacter({ worldId, name: '李雷' }).id;
    const id = addSavedFromCharacter(sessionId, charId);
    patchNearbyMemory(sessionId, id, '记得欠债');
    patchNearbyState(sessionId, id, 'mood', '"焦虑"');
    renameNearby(sessionId, id, '李雷雷');
    const row = listNearby(sessionId)[0];
    expect(row.memory).toBe('记得欠债');
    expect(row.state.find((s) => s.field_key === 'mood').runtime_value_json).toBe('"焦虑"');
    expect(row.name).toBe('李雷雷');
  });

  it('patchNearbyState: 写非启用字段 → 抛错', () => {
    const charId = createTestCharacter({ worldId, name: '李雷' }).id;
    const id = addSavedFromCharacter(sessionId, charId);
    expect(() => patchNearbyState(sessionId, id, 'hp', '50')).toThrow(/nearby/i);
  });
});
```

如果 `createTestCharacterField` / `createTestCharacter` / `setCharacterDefaultStateValue` 不在 fixtures 中，先在 `backend/tests/helpers/fixtures.js` 添加（参考已有 helper 模式）。

- [ ] **Step 2: 跑测试确认失败**

```bash
cd backend && npx vitest run tests/services/nearby-characters.test.js
```
Expected: FAIL

- [ ] **Step 3: 在 services/writing-sessions.js 实现**

在 `backend/services/writing-sessions.js` 文件末尾追加：

```js
import {
  createNearbyCharacter, getNearbyById, getNearbyByName,
  listNearbyBySessionId, updateNearbyName, updateNearbyMemory,
  updateNearbyIsSaved, deleteNearbyById,
} from '../db/queries/session-nearby-characters.js';
import {
  upsertNearbyStateValue, getStateValuesByNearbyId,
} from '../db/queries/session-nearby-character-state-values.js';
import { getCharacterStateFieldsByWorldId } from '../db/queries/character-state-fields.js';
import { getAllCharacterStateValues } from '../db/queries/character-state-values.js';
import { getCharacterById } from '../db/queries/characters.js';
import { getWritingSessionById as dbGetWritingSessionById } from '../db/queries/writing-sessions.js';

function getNearbyEnabledFields(worldId) {
  return getCharacterStateFieldsByWorldId(worldId).filter((f) => f.nearby_enabled === 1);
}

function buildNearbyRow(row, fields) {
  const stateRows = getStateValuesByNearbyId(row.id);
  const stateMap = Object.fromEntries(stateRows.map((s) => [s.field_key, s.runtime_value_json]));
  const state = fields.map((f) => ({
    field_key: f.field_key,
    label: f.label,
    type: f.type,
    description: f.description,
    enum_options: f.enum_options,
    min_value: f.min_value,
    max_value: f.max_value,
    prefix: f.prefix,
    unit: f.unit,
    table_columns: f.table_columns,
    runtime_value_json: stateMap[f.field_key] ?? null,
  }));
  return { ...row, state };
}

export function listNearby(sessionId) {
  const session = dbGetWritingSessionById(sessionId);
  if (!session) throw new Error('Session not found');
  const fields = getNearbyEnabledFields(session.world_id);
  return listNearbyBySessionId(sessionId).map((r) => buildNearbyRow(r, fields));
}

export function addSavedFromCharacter(sessionId, characterId) {
  const session = dbGetWritingSessionById(sessionId);
  if (!session) throw new Error('Session not found');
  const character = getCharacterById(characterId);
  if (!character) throw new Error('Character not found');
  if (character.world_id !== session.world_id) throw new Error('Character not in this world');

  if (getNearbyByName(sessionId, character.name)) {
    const err = new Error(`name "${character.name}" already exists in nearby pool`);
    err.code = 'NEARBY_NAME_CONFLICT';
    throw err;
  }

  const nearbyId = createNearbyCharacter({ sessionId, name: character.name, memory: '', isSaved: 1 });

  const fields = getNearbyEnabledFields(session.world_id);
  const enabledKeys = new Set(fields.map((f) => f.field_key));
  const charDefaults = getAllCharacterStateValues(characterId);
  for (const v of charDefaults) {
    if (!enabledKeys.has(v.field_key)) continue;
    if (v.default_value_json == null) continue;
    upsertNearbyStateValue({ sessionId, nearbyId, fieldKey: v.field_key, valueJson: v.default_value_json });
  }
  return nearbyId;
}

export function removeNearby(sessionId, nearbyId) {
  const row = getNearbyById(nearbyId);
  if (!row || row.session_id !== sessionId) throw new Error('Nearby not found');
  deleteNearbyById(nearbyId);
}

export function setNearbyIsSaved(sessionId, nearbyId, isSaved) {
  const row = getNearbyById(nearbyId);
  if (!row || row.session_id !== sessionId) throw new Error('Nearby not found');
  updateNearbyIsSaved(nearbyId, isSaved);
}

export function patchNearbyMemory(sessionId, nearbyId, memory) {
  const row = getNearbyById(nearbyId);
  if (!row || row.session_id !== sessionId) throw new Error('Nearby not found');
  updateNearbyMemory(nearbyId, memory ?? '');
}

export function renameNearby(sessionId, nearbyId, name) {
  const row = getNearbyById(nearbyId);
  if (!row || row.session_id !== sessionId) throw new Error('Nearby not found');
  if (!name || !name.trim()) throw new Error('name required');
  const conflict = getNearbyByName(sessionId, name);
  if (conflict && conflict.id !== nearbyId) {
    const err = new Error(`name "${name}" already exists`);
    err.code = 'NEARBY_NAME_CONFLICT';
    throw err;
  }
  updateNearbyName(nearbyId, name);
}

export function patchNearbyState(sessionId, nearbyId, fieldKey, valueJson) {
  const row = getNearbyById(nearbyId);
  if (!row || row.session_id !== sessionId) throw new Error('Nearby not found');
  const session = dbGetWritingSessionById(sessionId);
  const fields = getNearbyEnabledFields(session.world_id);
  if (!fields.some((f) => f.field_key === fieldKey)) {
    throw new Error(`field ${fieldKey} not enabled for nearby pool`);
  }
  upsertNearbyStateValue({ sessionId, nearbyId, fieldKey, valueJson });
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd backend && npx vitest run tests/services/nearby-characters.test.js
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/services/writing-sessions.js backend/tests/services/nearby-characters.test.js backend/tests/helpers/fixtures.js
git commit -m "feat(service): nearby characters CRUD service 层 + 单测"
```

---

## Task 5: 后端路由 — /api/writing-sessions/:sid/nearby 全套

**Files:**
- Modify: `backend/routes/writing.js`
- Test: `backend/tests/routes/writing-nearby.test.js`

- [ ] **Step 1: 写路由集成测试**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../server.js';
import {
  createTestWorld, createTestWritingSession, createTestCharacter, createTestCharacterField,
} from '../helpers/fixtures.js';

describe('writing nearby routes', () => {
  let worldId, sessionId, charId;
  beforeEach(() => {
    worldId = createTestWorld().id;
    createTestCharacterField({ worldId, fieldKey: 'mood', label: '心情', type: 'text', nearbyEnabled: 1 });
    sessionId = createTestWritingSession({ worldId }).id;
    charId = createTestCharacter({ worldId, name: '李雷' }).id;
  });

  it('POST /nearby with character_id → 201; GET /nearby 返回该 saved', async () => {
    const post = await request(app)
      .post(`/api/writing-sessions/${sessionId}/nearby`)
      .send({ character_id: charId });
    expect(post.status).toBe(201);
    const list = await request(app).get(`/api/writing-sessions/${sessionId}/nearby`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ name: '李雷', is_saved: 1 });
  });

  it('POST /nearby 重名 → 409', async () => {
    await request(app).post(`/api/writing-sessions/${sessionId}/nearby`).send({ character_id: charId });
    const conflict = await request(app).post(`/api/writing-sessions/${sessionId}/nearby`).send({ character_id: charId });
    expect(conflict.status).toBe(409);
  });

  it('PATCH /nearby/:id { is_saved: 0 } 切换', async () => {
    const post = await request(app).post(`/api/writing-sessions/${sessionId}/nearby`).send({ character_id: charId });
    const id = post.body.id;
    const patch = await request(app)
      .patch(`/api/writing-sessions/${sessionId}/nearby/${id}`)
      .send({ is_saved: 0 });
    expect(patch.status).toBe(200);
    expect(patch.body.is_saved).toBe(0);
  });

  it('PATCH /nearby/:id/state', async () => {
    const post = await request(app).post(`/api/writing-sessions/${sessionId}/nearby`).send({ character_id: charId });
    const id = post.body.id;
    const r = await request(app)
      .patch(`/api/writing-sessions/${sessionId}/nearby/${id}/state`)
      .send({ field_key: 'mood', value_json: '"焦虑"' });
    expect(r.status).toBe(200);
  });

  it('DELETE /nearby/:id', async () => {
    const post = await request(app).post(`/api/writing-sessions/${sessionId}/nearby`).send({ character_id: charId });
    const id = post.body.id;
    const del = await request(app).delete(`/api/writing-sessions/${sessionId}/nearby/${id}`);
    expect(del.status).toBe(204);
    const list = await request(app).get(`/api/writing-sessions/${sessionId}/nearby`);
    expect(list.body).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd backend && npx vitest run tests/routes/writing-nearby.test.js
```
Expected: FAIL

- [ ] **Step 3: 在 routes/writing.js 添加路由**

在 `backend/routes/writing.js` 中追加 import 与路由（参考已有 `assertExists` 风格，所有 service 抛错统一映射）：

```js
import {
  listNearby, addSavedFromCharacter, removeNearby, setNearbyIsSaved,
  patchNearbyMemory, patchNearbyState, renameNearby,
} from '../services/writing-sessions.js';

function handleNearbyError(err, res) {
  if (err.code === 'NEARBY_NAME_CONFLICT') return res.status(409).json({ error: err.message });
  if (/not found/i.test(err.message)) return res.status(404).json({ error: err.message });
  if (/required|not enabled|not in this world/i.test(err.message)) return res.status(400).json({ error: err.message });
  log.error(`nearby error: ${err.message}`);
  return res.status(500).json({ error: 'internal' });
}

router.get('/:sessionId/nearby', (req, res) => {
  try {
    res.json(listNearby(req.params.sessionId));
  } catch (e) { handleNearbyError(e, res); }
});

router.post('/:sessionId/nearby', (req, res) => {
  const { character_id } = req.body ?? {};
  if (!character_id) return res.status(400).json({ error: 'character_id required' });
  try {
    const id = addSavedFromCharacter(req.params.sessionId, character_id);
    res.status(201).json({ id });
  } catch (e) { handleNearbyError(e, res); }
});

router.patch('/:sessionId/nearby/:nearbyId', (req, res) => {
  const { sessionId, nearbyId } = req.params;
  const { is_saved, memory, name } = req.body ?? {};
  try {
    if (is_saved !== undefined) setNearbyIsSaved(sessionId, nearbyId, is_saved ? 1 : 0);
    if (memory !== undefined) patchNearbyMemory(sessionId, nearbyId, memory);
    if (name !== undefined) renameNearby(sessionId, nearbyId, name);
    const list = listNearby(sessionId);
    res.json(list.find((n) => n.id === nearbyId) ?? null);
  } catch (e) { handleNearbyError(e, res); }
});

router.patch('/:sessionId/nearby/:nearbyId/state', (req, res) => {
  const { sessionId, nearbyId } = req.params;
  const { field_key, value_json } = req.body ?? {};
  if (!field_key) return res.status(400).json({ error: 'field_key required' });
  try {
    patchNearbyState(sessionId, nearbyId, field_key, value_json ?? null);
    res.json({ ok: true });
  } catch (e) { handleNearbyError(e, res); }
});

router.delete('/:sessionId/nearby/:nearbyId', (req, res) => {
  try {
    removeNearby(req.params.sessionId, req.params.nearbyId);
    res.status(204).end();
  } catch (e) { handleNearbyError(e, res); }
});
```

注意 routes 文件已挂在 `app.use('/api/worlds', writingRouter)` 还是 `/api/writing-sessions`，按现有 mount 路径写 path（如已 mount 到 `/api/writing-sessions`，则上面路由保持 `/:sessionId/...`；否则前缀加 `/writing-sessions/`）。检查 `backend/server.js` 确认。

- [ ] **Step 4: 跑测试确认通过**

```bash
cd backend && npx vitest run tests/routes/writing-nearby.test.js
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routes/writing.js backend/tests/routes/writing-nearby.test.js
git commit -m "feat(route): nearby characters HTTP 路由 + 集成测试"
```

---

## Task 6: combined-state-updater 改造（核心：prompt + applyNearbyResult）

**Files:**
- Modify: `backend/memory/combined-state-updater.js`
- Modify: `backend/prompts/nearby-prompt.js`（新建，模块化分离）
- Test: `backend/tests/memory/combined-state-updater-nearby.test.js`

- [ ] **Step 1: 新建 prompt builder**

`backend/prompts/nearby-prompt.js`：

```js
/**
 * 为写作模式构建 nearby pool 段（嵌入 combined-state-updater 主提示词）。
 */
export function buildNearbyPromptSection(pool, fields) {
  if (!pool.length) {
    return [
      '当前已知的登场角色池：（空）',
      '',
      '任务（关于"附近 / 登场角色"）：',
      '1. 阅读本轮 user 与 assistant 文本，识别本轮以「名字、对话或动作主体形式登场的角色」（仅被旁人或路人提及不算）',
      '2. 对识别到的每个角色，输出到 nearby_characters 数组：',
      '   { "ref_id": null, "name": "...", "state": { ... }, "memory": "新一句话总结" }',
      '3. 不在场角色不要输出',
    ].join('\n');
  }
  const fieldsDesc = fields.map((f) => {
    let line = `  - ${f.field_key}（${f.label}，类型：${f.type}）`;
    if (f.description) line += `；${f.description}`;
    return line;
  }).join('\n');

  const poolDesc = pool.map((p) => {
    const stateStr = Object.keys(p.state).length
      ? Object.entries(p.state).map(([k, v]) => `${k}=${v}`).join(', ')
      : '（无）';
    return `- [id=${p.id}] ${p.name}（${p.is_saved ? '已保存' : '临时'}）｜记忆：${p.memory || '（无）'}｜上轮状态：{${stateStr}}`;
  }).join('\n');

  return [
    '当前已知的登场角色池（继承自上轮 transient 与已保存的 saved）：',
    poolDesc,
    '',
    '登场角色启用字段（仅这些字段可写入 nearby_characters[i].state）：',
    fieldsDesc,
    '',
    '任务（关于"附近 / 登场角色"）：',
    '1. 阅读本轮 user 与 assistant 文本，识别本轮以「名字、对话或动作主体形式登场的角色」（仅被旁人或路人提及不算）',
    '2. 对识别到的每个角色，输出到 nearby_characters 数组：',
    '   { "ref_id": "<池里的id；新角色为null>", "name": "...", "state": { 字段key: 值, ... }, "memory": "新的一句话总结" }',
    '3. 池里有但本轮不在场的角色不要输出',
    '4. memory 一句话总结角色与{{user}}的交互历史，覆盖式更新',
    '5. 字段类型/范围约束与主 state 协议一致；不要输出未启用字段',
  ].join('\n');
}
```

- [ ] **Step 2: 写测试 — 应用层（不依赖真实 LLM）**

`backend/tests/memory/combined-state-updater-nearby.test.js`：

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { applyNearbyResult } from '../../memory/combined-state-updater.js';
import {
  createTestWorld, createTestWritingSession, createTestCharacterField,
} from '../helpers/fixtures.js';
import {
  createNearbyCharacter, listNearbyBySessionId, getNearbyById, updateNearbyIsSaved,
} from '../../db/queries/session-nearby-characters.js';
import {
  upsertNearbyStateValue, getStateValuesByNearbyId,
} from '../../db/queries/session-nearby-character-state-values.js';

describe('applyNearbyResult', () => {
  let worldId, sessionId, fields;
  beforeEach(() => {
    worldId = createTestWorld().id;
    createTestCharacterField({ worldId, fieldKey: 'mood', label: '心情', type: 'text', nearbyEnabled: 1 });
    createTestCharacterField({ worldId, fieldKey: 'hp', label: 'HP', type: 'number', nearbyEnabled: 0 });
    sessionId = createTestWritingSession({ worldId }).id;
    fields = [{ field_key: 'mood', type: 'text', nearby_enabled: 1 }];
  });

  it('ref_id 命中 → 更新 name/memory/state', () => {
    const id = createNearbyCharacter({ sessionId, name: '老张' });
    upsertNearbyStateValue({ sessionId, nearbyId: id, fieldKey: 'mood', valueJson: '"普通"' });
    applyNearbyResult({
      sessionId, worldId, fields,
      nearby_characters: [{ ref_id: id, name: '老张', state: { mood: '兴奋' }, memory: '请客了' }],
      pool: [{ id, name: '老张', is_saved: 0 }],
    });
    const row = getNearbyById(id);
    expect(row.memory).toBe('请客了');
    const sv = getStateValuesByNearbyId(id);
    expect(sv.find((s) => s.field_key === 'mood').runtime_value_json).toBe('"兴奋"');
  });

  it('ref_id=null + name 命中 → 等同更新', () => {
    const id = createNearbyCharacter({ sessionId, name: '李雷' });
    applyNearbyResult({
      sessionId, worldId, fields,
      nearby_characters: [{ ref_id: null, name: '李雷', state: { mood: '感激' }, memory: '被救' }],
      pool: [{ id, name: '李雷', is_saved: 0 }],
    });
    const row = getNearbyById(id);
    expect(row.memory).toBe('被救');
  });

  it('ref_id=null + name 不在池 → 新建 transient', () => {
    applyNearbyResult({
      sessionId, worldId, fields,
      nearby_characters: [{ ref_id: null, name: '新人甲', state: { mood: '好奇' }, memory: '路过' }],
      pool: [],
    });
    const list = listNearbyBySessionId(sessionId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: '新人甲', is_saved: 0 });
  });

  it('非法 ref_id → 整条丢弃，不影响其他', () => {
    applyNearbyResult({
      sessionId, worldId, fields,
      nearby_characters: [
        { ref_id: 'not-exist', name: 'X', state: {}, memory: '' },
        { ref_id: null, name: 'Y', state: {}, memory: '' },
      ],
      pool: [],
    });
    const list = listNearbyBySessionId(sessionId);
    expect(list.map((r) => r.name)).toEqual(['Y']);
  });

  it('池里没回的 transient 删除，saved 保留', () => {
    const a = createNearbyCharacter({ sessionId, name: 'A' });
    const b = createNearbyCharacter({ sessionId, name: 'B' });
    updateNearbyIsSaved(b, 1);
    applyNearbyResult({
      sessionId, worldId, fields,
      nearby_characters: [], // 都没回
      pool: [
        { id: a, name: 'A', is_saved: 0 },
        { id: b, name: 'B', is_saved: 1 },
      ],
    });
    const list = listNearbyBySessionId(sessionId);
    expect(list.map((r) => r.id)).toEqual([b]);
  });

  it('未启用字段被 LLM 写入 → 跳过', () => {
    applyNearbyResult({
      sessionId, worldId, fields,
      nearby_characters: [{ ref_id: null, name: 'A', state: { mood: '开心', hp: 50 }, memory: '' }],
      pool: [],
    });
    const list = listNearbyBySessionId(sessionId);
    const sv = getStateValuesByNearbyId(list[0].id);
    expect(sv.map((s) => s.field_key)).toEqual(['mood']); // hp 被跳过
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

```bash
cd backend && npx vitest run tests/memory/combined-state-updater-nearby.test.js
```
Expected: FAIL

- [ ] **Step 4: 在 combined-state-updater.js 中实现 applyNearbyResult + 集成 prompt 段**

在 `backend/memory/combined-state-updater.js` 顶部加 import：

```js
import {
  createNearbyCharacter, getNearbyById, getNearbyByName, listNearbyBySessionId,
  updateNearbyName, updateNearbyMemory, deleteTransientNotInIds,
} from '../db/queries/session-nearby-characters.js';
import {
  upsertNearbyStateValue, getStateValuesByNearbyId,
} from '../db/queries/session-nearby-character-state-values.js';
import { buildNearbyPromptSection } from '../prompts/nearby-prompt.js';
```

新增导出函数 `applyNearbyResult`（放在 module 末尾）：

```js
/**
 * 把 LLM 输出的 nearby_characters 应用到 DB。
 * @param {object}   params
 * @param {string}   params.sessionId
 * @param {string}   params.worldId
 * @param {object[]} params.fields                 启用的 character_state_fields（含 type 等约束）
 * @param {object[]} params.nearby_characters      LLM 输出的 nearby 数组
 * @param {object[]} params.pool                   本轮发给 LLM 的池 [{id, name, is_saved}]
 */
export function applyNearbyResult({ sessionId, worldId, fields, nearby_characters, pool }) {
  const items = Array.isArray(nearby_characters) ? nearby_characters : [];
  const enabledKeys = new Set(fields.map((f) => f.field_key));
  const fieldByKey = Object.fromEntries(fields.map((f) => [f.field_key, f]));
  const poolById = Object.fromEntries(pool.map((p) => [p.id, p]));
  const poolByName = Object.fromEntries(pool.map((p) => [p.name, p]));
  const seenIds = new Set();

  function applyPatch(targetId, item) {
    // memory 覆盖
    if (typeof item.memory === 'string') {
      updateNearbyMemory(targetId, item.memory);
    }
    // name 同步（LLM 可能微调，但保持唯一）
    if (item.name && item.name !== poolById[targetId]?.name && !getNearbyByName(sessionId, item.name)) {
      updateNearbyName(targetId, item.name);
    }
    // state patch
    const state = item.state ?? {};
    for (const [k, v] of Object.entries(state)) {
      if (!enabledKeys.has(k)) continue;
      const valueJson = serializeForField(v, fieldByKey[k]);
      if (valueJson === null) continue;
      upsertNearbyStateValue({ sessionId, nearbyId: targetId, fieldKey: k, valueJson });
    }
    seenIds.add(targetId);
  }

  for (const item of items) {
    if (item.ref_id && poolById[item.ref_id]) {
      applyPatch(item.ref_id, item);
    } else if (item.ref_id && !poolById[item.ref_id]) {
      log.warn(`nearby drop invalid ref_id=${item.ref_id} name=${item.name}`);
      continue;
    } else if (item.name && poolByName[item.name]) {
      applyPatch(poolByName[item.name].id, item);
    } else if (item.name) {
      // 新建 transient
      const newId = createNearbyCharacter({ sessionId, name: item.name, memory: item.memory ?? '', isSaved: 0 });
      const state = item.state ?? {};
      for (const [k, v] of Object.entries(state)) {
        if (!enabledKeys.has(k)) continue;
        const valueJson = serializeForField(v, fieldByKey[k]);
        if (valueJson === null) continue;
        upsertNearbyStateValue({ sessionId, nearbyId: newId, fieldKey: k, valueJson });
      }
      seenIds.add(newId);
    }
  }

  // 清理：池里 transient 但本轮未 seen → 删除（state 由 CASCADE 同步删）
  const keepIds = pool.filter((p) => p.is_saved === 1 || seenIds.has(p.id)).map((p) => p.id);
  deleteTransientNotInIds(sessionId, keepIds);
}

/**
 * 给某字段值序列化成 JSON。值已通过 type 校验失败时返回 null（跳过）。
 * 复用 combined-state-updater 内部已有的 normalizeValueByField / formatValueForPrompt。
 * 这里给一个最小实现 — 实际接入时复用已有 normalizeValueByField。
 */
function serializeForField(value, field) {
  if (value === undefined || value === null) return null;
  // 复用：调用模块内已有的字段值归一化函数（实现时直接调用 normalizeAndStringify(value, field)）
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}
```

> 实现时：`serializeForField` 应复用 combined-state-updater.js 中已存在的字段值校验/归一化逻辑（如 `normalizeValueByField`），而非新写一份。如该函数私有，先把它从 module 导出，或抽到 `_state-field-helpers.js`。

在主入口（写作模式分支）调用前组装 pool 与 prompt 段：

```js
// 在 updateAllStates(...) 写作模式分支：
const pool = listNearbyBySessionId(sessionId).map((r) => {
  const sv = getStateValuesByNearbyId(r.id);
  const stateMap = {};
  for (const s of sv) if (s.runtime_value_json != null) {
    try { stateMap[s.field_key] = JSON.parse(s.runtime_value_json); } catch { /* skip */ }
  }
  return { id: r.id, name: r.name, is_saved: r.is_saved, memory: r.memory, state: stateMap };
});
const nearbyEnabledFields = (await getCharacterStateFieldsByWorldId(worldId)).filter((f) => f.nearby_enabled === 1);
const nearbySection = buildNearbyPromptSection(pool, nearbyEnabledFields);
// 把 nearbySection 拼接到主 prompt 中（参考已有 world/persona/character 段拼接位置；放在 character 段之后）
// 解析 LLM 返回 JSON 后：
applyNearbyResult({
  sessionId, worldId,
  fields: nearbyEnabledFields,
  nearby_characters: parsed.nearby_characters,
  pool,
});
```

仅 `mode === 'writing'` 分支启用 nearby 段；chat 模式不动。

- [ ] **Step 5: 跑测试确认通过**

```bash
cd backend && npx vitest run tests/memory/combined-state-updater-nearby.test.js
```
Expected: PASS

并跑回归：

```bash
cd backend && npx vitest run tests/memory/combined-state-updater.test.js
```
Expected: 现有测试仍 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/memory/combined-state-updater.js backend/prompts/nearby-prompt.js backend/tests/memory/combined-state-updater-nearby.test.js
git commit -m "feat(state): combined-state-updater 集成 nearby pool + applyNearbyResult"
```

---

## Task 7: turn_records snapshot 扩展 + state-rollback

**Files:**
- Modify: `backend/memory/turn-summarizer.js`（写入 nearby 快照）
- Modify: `backend/memory/state-rollback.js`（还原 nearby）
- Test: `backend/tests/memory/state-rollback.test.js`（增量）
- Modify: `SCHEMA.md`（state_snapshot 段说明加 nearby 层）

- [ ] **Step 1: 修改 state-rollback.test.js 增加 nearby 往返用例**

```js
it('snapshot 往返：nearby 层还原', () => {
  // 建一个 sessionId + 一个 nearby（saved）+ state value
  const sessionId = createTestWritingSession({ worldId }).id;
  const nearbyId = createNearbyCharacter({ sessionId, name: 'A' });
  updateNearbyIsSaved(nearbyId, 1);
  upsertNearbyStateValue({ sessionId, nearbyId, fieldKey: 'mood', valueJson: '"happy"' });

  // 构造 snapshot
  const snapshot = {
    nearby: [
      { id: 'X', name: 'B', memory: 'mem-b', is_saved: 0, state: { mood: '"sad"' } },
    ],
  };
  restoreStateFromSnapshot(sessionId, snapshot);

  const list = listNearbyBySessionId(sessionId);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ name: 'B', memory: 'mem-b', is_saved: 0 });
  const sv = getStateValuesByNearbyId(list[0].id);
  expect(sv.find((s) => s.field_key === 'mood').runtime_value_json).toBe('"sad"');
});

it('snapshot 缺 nearby 字段 → 清空两张 nearby 表（向下兼容）', () => {
  const sessionId = createTestWritingSession({ worldId }).id;
  const nearbyId = createNearbyCharacter({ sessionId, name: 'A' });
  upsertNearbyStateValue({ sessionId, nearbyId, fieldKey: 'mood', valueJson: '"x"' });
  restoreStateFromSnapshot(sessionId, { /* no nearby */ });
  expect(listNearbyBySessionId(sessionId)).toHaveLength(0);
});
```

- [ ] **Step 2: 修改 turn-summarizer.js 写入 nearby 快照**

在 `createTurnRecord` 内构建 state_snapshot 处增加 nearby 层：

```js
import { listNearbyBySessionId } from '../db/queries/session-nearby-characters.js';
import { getStateValuesByNearbyId } from '../db/queries/session-nearby-character-state-values.js';

// 构造 snapshot 时：
const nearby = listNearbyBySessionId(sessionId).map((r) => {
  const sv = getStateValuesByNearbyId(r.id);
  const state = {};
  for (const s of sv) if (s.runtime_value_json != null) state[s.field_key] = s.runtime_value_json;
  return { id: r.id, name: r.name, memory: r.memory, is_saved: r.is_saved, state };
});
const stateSnapshot = JSON.stringify({ world, persona, character, nearby });
```

- [ ] **Step 3: 修改 state-rollback.js 加 nearby 还原**

`restoreStateFromSnapshot(sessionId, snapshot)` 函数内追加分支：

```js
import {
  listNearbyBySessionId, deleteNearbyById, createNearbyCharacter,
} from '../db/queries/session-nearby-characters.js';
import { upsertNearbyStateValue } from '../db/queries/session-nearby-character-state-values.js';

// 清空旧 nearby（CASCADE 同步删 state）
for (const r of listNearbyBySessionId(sessionId)) deleteNearbyById(r.id);

const nearbyArr = Array.isArray(snapshot?.nearby) ? snapshot.nearby : [];
for (const n of nearbyArr) {
  const newId = createNearbyCharacter({
    sessionId, name: n.name, memory: n.memory ?? '', isSaved: n.is_saved ? 1 : 0,
  });
  const state = n.state ?? {};
  for (const [k, v] of Object.entries(state)) {
    upsertNearbyStateValue({ sessionId, nearbyId: newId, fieldKey: k, valueJson: v });
  }
}
```

> snapshot 中保存的 id 不复用（因为可能与新 UUID 冲突），重新生成；语义层只关心名字/状态/memory/is_saved 还原即可。如果有外部引用 id，则改为保留原 id（在 createNearbyCharacter 增加 `id` 可选参数）。当前 spec 不需保留 id。

- [ ] **Step 4: 跑测试确认通过**

```bash
cd backend && npx vitest run tests/memory/state-rollback.test.js
```
Expected: PASS

- [ ] **Step 5: 同步更新 SCHEMA.md**

`turn_records.state_snapshot` 段：JSON 示例添加 `nearby` 层；说明"无快照（旧记录）→ 清空 nearby 两张表"。

- [ ] **Step 6: Commit**

```bash
git add backend/memory/turn-summarizer.js backend/memory/state-rollback.js backend/tests/memory/state-rollback.test.js SCHEMA.md
git commit -m "feat(state): turn_records snapshot 增加 nearby 层 + 回滚还原"
```

---

## Task 8: 制卡服务 + 路由（替换 CharacterAnalyzingModal 后端）

**Files:**
- Create: `backend/services/nearby-card-maker.js`
- Modify: `backend/routes/writing.js`
- Test: `backend/tests/services/nearby-card-maker.test.js`

- [ ] **Step 1: 写测试（mock LLM）**

`backend/tests/services/nearby-card-maker.test.js`：

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  analyzeNearbyForCard, createCharacterFromNearby,
} from '../../services/nearby-card-maker.js';
import {
  createTestWorld, createTestWritingSession, createTestCharacterField,
} from '../helpers/fixtures.js';
import { createNearbyCharacter } from '../../db/queries/session-nearby-characters.js';
import { upsertNearbyStateValue } from '../../db/queries/session-nearby-character-state-values.js';
import { listCharactersByWorldId } from '../../db/queries/characters.js';
import { getAllCharacterStateValues } from '../../db/queries/character-state-values.js';

vi.mock('../../llm/index.js', () => ({
  complete: vi.fn(async () => JSON.stringify({
    system_prompt: '冷静沉稳的剑客',
    description: '主角的好友',
    first_message: '你来啦',
  })),
}));

describe('nearby-card-maker', () => {
  let worldId, sessionId, nearbyId;
  beforeEach(() => {
    worldId = createTestWorld().id;
    createTestCharacterField({ worldId, fieldKey: 'mood', label: '心情', type: 'text', nearbyEnabled: 1 });
    createTestCharacterField({ worldId, fieldKey: 'hp', label: 'HP', type: 'number', nearbyEnabled: 0 });
    sessionId = createTestWritingSession({ worldId }).id;
    nearbyId = createNearbyCharacter({ sessionId, name: '李雷', memory: '欠债' });
    upsertNearbyStateValue({ sessionId, nearbyId, fieldKey: 'mood', valueJson: '"焦虑"' });
  });

  it('analyzeNearbyForCard 返回 LLM 草稿', async () => {
    const draft = await analyzeNearbyForCard(sessionId, nearbyId);
    expect(draft).toMatchObject({
      name: '李雷',
      system_prompt: '冷静沉稳的剑客',
      description: '主角的好友',
      first_message: '你来啦',
    });
  });

  it('createCharacterFromNearby 落库；仅启用字段写入 default_value_json；不写 memory', async () => {
    const charId = await createCharacterFromNearby({
      worldId, sessionId, nearbyId,
      name: '李雷', system_prompt: 'sp', description: 'desc', first_message: 'fm',
    });
    const list = listCharactersByWorldId(worldId);
    expect(list.find((c) => c.id === charId)).toMatchObject({ name: '李雷', system_prompt: 'sp', description: 'desc', first_message: 'fm' });
    const sv = getAllCharacterStateValues(charId);
    expect(sv.map((s) => s.field_key)).toEqual(['mood']);
    expect(sv[0].default_value_json).toBe('"焦虑"');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd backend && npx vitest run tests/services/nearby-card-maker.test.js
```
Expected: FAIL

- [ ] **Step 3: 实现 services/nearby-card-maker.js**

```js
import * as llm from '../llm/index.js';
import { resolveAuxScope } from '../utils/aux-scope.js';
import { getNearbyById } from '../db/queries/session-nearby-characters.js';
import { getStateValuesByNearbyId } from '../db/queries/session-nearby-character-state-values.js';
import { getCharacterStateFieldsByWorldId } from '../db/queries/character-state-fields.js';
import { getWritingSessionById } from '../db/queries/writing-sessions.js';
import { getMessagesBySessionId } from './sessions.js';
import { createCharacter } from '../db/queries/characters.js';
import { upsertCharacterStateValue } from '../db/queries/character-state-values.js';
import { renderBackendPrompt } from '../prompts/prompt-loader.js';

const RECENT_TEXT_ROUNDS = 6;

export async function analyzeNearbyForCard(sessionId, nearbyId) {
  const session = getWritingSessionById(sessionId);
  if (!session) throw new Error('Session not found');
  const nearby = getNearbyById(nearbyId);
  if (!nearby || nearby.session_id !== sessionId) throw new Error('Nearby not found');

  const stateValues = getStateValuesByNearbyId(nearbyId);
  const messages = getMessagesBySessionId(sessionId).slice(-RECENT_TEXT_ROUNDS * 2);
  const recent = messages.map((m) => `[${m.role}] ${m.content}`).join('\n');

  const prompt = renderBackendPrompt('nearby-card-maker', {
    name: nearby.name,
    memory: nearby.memory,
    state: stateValues.map((s) => `${s.field_key}=${s.runtime_value_json}`).join(', '),
    recent_text: recent,
  });
  // 如果 prompt-loader 不支持自定义 key，则在此 inline prompt 字符串。

  const scope = resolveAuxScope({ mode: 'writing' });
  const text = await llm.complete({ ...scope, prompt, max_tokens: 1024, temperature: 0.7 });

  let draft;
  try { draft = JSON.parse(text); } catch {
    throw new Error('LLM returned invalid JSON');
  }
  return {
    name: nearby.name,
    system_prompt: draft.system_prompt ?? '',
    description: draft.description ?? '',
    first_message: draft.first_message ?? '',
  };
}

export async function createCharacterFromNearby({
  worldId, sessionId, nearbyId, name, system_prompt, description, first_message,
}) {
  const session = getWritingSessionById(sessionId);
  if (!session || session.world_id !== worldId) throw new Error('Session/world mismatch');
  const nearby = getNearbyById(nearbyId);
  if (!nearby || nearby.session_id !== sessionId) throw new Error('Nearby not found');

  const charId = createCharacter({
    worldId, name, system_prompt, description, first_message, post_prompt: '', avatarPath: null,
  });

  const fields = getCharacterStateFieldsByWorldId(worldId);
  const enabled = new Set(fields.filter((f) => f.nearby_enabled === 1).map((f) => f.field_key));
  const stateValues = getStateValuesByNearbyId(nearbyId);
  for (const s of stateValues) {
    if (!enabled.has(s.field_key)) continue;
    if (s.runtime_value_json == null) continue;
    upsertCharacterStateValue({
      characterId: charId, fieldKey: s.field_key, defaultValueJson: s.runtime_value_json,
    });
  }
  return charId;
}
```

> 检查 `db/queries/characters.js` 的 `createCharacter` 与 `db/queries/character-state-values.js` 的 `upsertCharacterStateValue` 实际签名，按现有调整。

prompt 模板（如使用 prompt-loader）放 `backend/prompts/nearby-card-maker.md`，否则 inline。

- [ ] **Step 4: 跑测试确认通过**

```bash
cd backend && npx vitest run tests/services/nearby-card-maker.test.js
```
Expected: PASS

- [ ] **Step 5: 在 routes/writing.js 添加路由**

```js
import { analyzeNearbyForCard, createCharacterFromNearby } from '../services/nearby-card-maker.js';

router.post('/:sessionId/nearby/:nearbyId/analyze', async (req, res) => {
  try {
    const draft = await analyzeNearbyForCard(req.params.sessionId, req.params.nearbyId);
    res.json(draft);
  } catch (e) { handleNearbyError(e, res); }
});
```

并在 worlds 路由（`backend/routes/characters.js` 或就近）加：

```js
router.post('/:worldId/characters/from-nearby', async (req, res) => {
  const { worldId } = req.params;
  const { session_id, nearby_id, name, system_prompt, description, first_message } = req.body ?? {};
  try {
    const id = await createCharacterFromNearby({
      worldId, sessionId: session_id, nearbyId: nearby_id,
      name, system_prompt, description, first_message,
    });
    res.status(201).json({ id });
  } catch (e) { handleNearbyError(e, res); }
});
```

- [ ] **Step 6: Commit**

```bash
git add backend/services/nearby-card-maker.js backend/routes/writing.js backend/routes/characters.js backend/tests/services/nearby-card-maker.test.js
git commit -m "feat(card): nearby → 公共角色卡 制卡服务 + 路由"
```

---

## Task 9: 前端 API 封装

**Files:**
- Create: `frontend/src/api/session-nearby.js`
- Modify: `frontend/src/api/writing-sessions.js`（删除 activate/deactivate）

- [ ] **Step 1: 新建 session-nearby.js**

```js
import { api } from './_client.js'; // 沿用现有 fetch 客户端

export async function fetchNearby(sessionId) {
  return api.get(`/api/writing-sessions/${sessionId}/nearby`);
}

export async function addSavedNearbyFromCharacter(sessionId, characterId) {
  return api.post(`/api/writing-sessions/${sessionId}/nearby`, { character_id: characterId });
}

export async function patchNearby(sessionId, nearbyId, body) {
  return api.patch(`/api/writing-sessions/${sessionId}/nearby/${nearbyId}`, body);
}

export async function setNearbySaved(sessionId, nearbyId, isSaved) {
  return patchNearby(sessionId, nearbyId, { is_saved: isSaved ? 1 : 0 });
}

export async function patchNearbyMemory(sessionId, nearbyId, memory) {
  return patchNearby(sessionId, nearbyId, { memory });
}

export async function patchNearbyName(sessionId, nearbyId, name) {
  return patchNearby(sessionId, nearbyId, { name });
}

export async function patchNearbyState(sessionId, nearbyId, fieldKey, valueJson) {
  return api.patch(`/api/writing-sessions/${sessionId}/nearby/${nearbyId}/state`, {
    field_key: fieldKey, value_json: valueJson,
  });
}

export async function removeNearby(sessionId, nearbyId) {
  return api.del(`/api/writing-sessions/${sessionId}/nearby/${nearbyId}`);
}

export async function analyzeNearbyForCard(sessionId, nearbyId) {
  return api.post(`/api/writing-sessions/${sessionId}/nearby/${nearbyId}/analyze`, {});
}

export async function createCharacterFromNearby(worldId, payload) {
  return api.post(`/api/worlds/${worldId}/characters/from-nearby`, payload);
}
```

> 调整 `api.get/post/patch/del` 名称以匹配项目实际客户端（参考 `frontend/src/api/_client.js` 或同目录其他文件的 import）。

- [ ] **Step 2: 删除 writing-sessions.js 中 activate / deactivate**

```js
// 删除 activateCharacter / deactivateCharacter / 相关 listActiveCharacters
```

如无前端调用方残留则直接清空函数体即可（后续 Task 11 会清理调用方）。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/session-nearby.js frontend/src/api/writing-sessions.js
git commit -m "feat(api): session-nearby 前端 API 封装"
```

---

## Task 10: 前端 UI — NearbyPanel + 子组件 + 替换 CastPanel

**Files:**
- Create: `frontend/src/components/book/NearbyPanel.jsx`
- Create: `frontend/src/components/book/NearbyCharacterBlock.jsx`
- Create: `frontend/src/components/book/AddSavedNearbyModal.jsx`
- Modify: `frontend/src/pages/WritingSpacePage.jsx`（替换 CastPanel → NearbyPanel；移除 activeCharacters state）
- Delete: `frontend/src/components/book/CastPanel.jsx`（在 Task 11 删，本任务先保留以备回滚）
- Modify: `frontend/src/components/index.js`（注册新组件）
- Modify: `frontend/src/hooks/useSessionState.js`（新增 nearby 拉取）

- [ ] **Step 1: useSessionState hook 增加 nearby**

```js
import { fetchNearby } from '../api/session-nearby.js';

// 在 hook 内：
const [nearby, setNearby] = useState(null);

// 拉取（state_updated SSE 触发或 sessionId/stateTick 变化时）
useEffect(() => {
  if (!sessionId) return;
  let cancelled = false;
  fetchNearby(sessionId).then((rows) => { if (!cancelled) setNearby(rows); }).catch(() => {});
  return () => { cancelled = true; };
}, [sessionId, stateTick]);

// 返回值新增 nearby
return { stateData, setStateData, diaryEntries, stateJustChanged, isUpdating, nearby, setNearby };
```

- [ ] **Step 2: 新建 NearbyCharacterBlock.jsx**

```jsx
import { useState } from 'react';
import StatusSection from './StatusSection.jsx';
import {
  setNearbySaved, patchNearbyMemory, patchNearbyState, removeNearby,
} from '../../api/session-nearby.js';
import { pushErrorToast } from '../../utils/toast.js';

export default function NearbyCharacterBlock({ sessionId, nearby, expanded, onToggle, onChange, templateCtx }) {
  const [editingMemory, setEditingMemory] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState(nearby.memory);

  async function handleToggleSaved() {
    try {
      await setNearbySaved(sessionId, nearby.id, !nearby.is_saved);
      onChange();
    } catch (e) { pushErrorToast(e.message || '切换保存失败'); }
  }
  async function handleRemove() {
    try {
      await removeNearby(sessionId, nearby.id);
      onChange();
    } catch (e) { pushErrorToast(e.message || '移除失败'); }
  }
  async function handleSaveState(fieldKey, valueJson) {
    try {
      await patchNearbyState(sessionId, nearby.id, fieldKey, valueJson);
      onChange();
    } catch (e) { pushErrorToast(e.message || '更新状态失败'); }
  }
  async function handleSaveMemory() {
    try {
      await patchNearbyMemory(sessionId, nearby.id, memoryDraft);
      setEditingMemory(false);
      onChange();
    } catch (e) { pushErrorToast(e.message || '更新记忆失败'); }
  }

  return (
    <div className="we-cast-character-block we-state-section">
      <div className="we-state-section-title" style={{ cursor: 'pointer' }} onClick={onToggle}>
        {nearby.is_saved ? <SealIcon /> : null}
        <span className="we-section-label">{nearby.name}</span>
        <span className="we-section-rule" />
        {nearby.is_saved
          ? <button className="we-state-section-reset" onClick={(e) => { e.stopPropagation(); handleRemove(); }}>移除</button>
          : <button className="we-state-section-reset" onClick={(e) => { e.stopPropagation(); handleToggleSaved(); }}>保存</button>}
      </div>
      {expanded && (
        <div>
          <div className="we-nearby-memory">
            {editingMemory ? (
              <>
                <textarea value={memoryDraft} onChange={(e) => setMemoryDraft(e.target.value)} rows={2} />
                <button onClick={handleSaveMemory}>保存</button>
                <button onClick={() => { setEditingMemory(false); setMemoryDraft(nearby.memory); }}>取消</button>
              </>
            ) : (
              <span onClick={() => setEditingMemory(true)} title="点击编辑">
                {nearby.memory || '（无记忆）'}
              </span>
            )}
          </div>
          <StatusSection title="" rows={nearby.state} onSave={handleSaveState} templateCtx={{ ...templateCtx, char: nearby.name }} />
        </div>
      )}
    </div>
  );
}

function SealIcon() {
  return <span className="we-nearby-seal" title="已保存" />;
}
```

> 样式 token：`we-nearby-seal` / `we-nearby-memory` 在 `frontend/src/styles/tokens.css` 或对应 stylesheet 添加（用 `--we-vermilion` 做印章色）。

- [ ] **Step 3: 新建 AddSavedNearbyModal.jsx**

```jsx
import { useEffect, useState } from 'react';
import ModalShell from '../ui/ModalShell.jsx';
import CharacterSeal from './CharacterSeal.jsx';
import { getCharactersByWorld } from '../../api/characters.js';
import { addSavedNearbyFromCharacter } from '../../api/session-nearby.js';
import { pushErrorToast } from '../../utils/toast.js';

export default function AddSavedNearbyModal({ worldId, sessionId, nearby, onAdded, onClose }) {
  const [chars, setChars] = useState([]);
  const [adding, setAdding] = useState(null);
  const occupiedNames = new Set(nearby.map((n) => n.name));

  useEffect(() => {
    getCharactersByWorld(worldId).then(setChars).catch(() => setChars([]));
  }, [worldId]);

  async function handleAdd(charId) {
    setAdding(charId);
    try {
      await addSavedNearbyFromCharacter(sessionId, charId);
      onAdded();
    } catch (e) {
      if (e.status === 409) pushErrorToast(`名字已在登场角色池中`);
      else pushErrorToast(e.message || '添加失败');
    } finally { setAdding(null); }
  }

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-sm">
      <div className="we-cast-add-modal-body">
        <p className="we-cast-add-modal-title">从角色卡添加</p>
        {chars.length === 0 && <p className="we-cast-add-modal-empty">该世界暂无角色卡</p>}
        {chars.map((c) => {
          const taken = occupiedNames.has(c.name);
          return (
            <div key={c.id} className="we-cast-add-modal-row">
              <CharacterSeal character={c} size={32} />
              <span className="we-cast-add-modal-name">{c.name}</span>
              <button
                onClick={() => handleAdd(c.id)}
                disabled={taken || adding === c.id}
                className="we-cast-add-modal-action"
              >
                {taken ? '已在池中' : adding === c.id ? '…' : '添加'}
              </button>
            </div>
          );
        })}
      </div>
      <div className="we-cast-add-modal-footer">
        <button onClick={onClose} className="we-cast-add-modal-close">关闭</button>
      </div>
    </ModalShell>
  );
}
```

- [ ] **Step 4: 新建 NearbyPanel.jsx**（替换 CastPanel）

整体复用 CastPanel 的世界/玩家/TIMELINE 段；CAST 印章行删除；中间替换为"附近"区块：

```jsx
// 简化骨架 — 参考 CastPanel.jsx 内 worldRows/persona/diary 全部保留；只替换 cast/characters 段
import NearbyCharacterBlock from './NearbyCharacterBlock.jsx';
import AddSavedNearbyModal from './AddSavedNearbyModal.jsx';
import MakeCardModal from './MakeCardModal.jsx'; // Task 12 新建；本任务先 stub 占位（按钮触发 onClick={() => openMakeCard()}）

export default function NearbyPanel({ worldId, sessionId, persona, onDiaryInject, stateTick = 0, diaryTick = 0 }) {
  const { stateData, setStateData, diaryEntries, stateJustChanged, isUpdating, nearby, setNearby } =
    useSessionState(sessionId, stateTick, diaryTick);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [makeCardOpen, setMakeCardOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState([]);

  const refreshNearby = async () => setNearby(await fetchNearby(sessionId));

  // worldRows / 世界状态段 / 玩家状态段 全部保留 CastPanel 的实现 ...

  return (
    <div className="we-cast-panel">
      <div className="we-cast-spine" />
      <div className="we-cast-scroll">
        {/* 世界 */}
        <StatusSection title="世界" rows={worldRows} onReset={...} onSave={handleSaveWorld} templateCtx={...} collapsible />
        {/* 玩家 */}
        <StatusSection title={persona?.name || '玩家'} rows={stateData?.persona ?? null} ... />

        {/* 附近 */}
        <div className="we-state-section">
          <div className="we-state-section-title">
            <span className="we-section-label">附近</span>
            <span className="we-section-rule" />
            <button className="we-state-section-reset" onClick={() => setAddModalOpen(true)}>＋角色卡</button>
            <button className="we-state-section-reset" onClick={() => setMakeCardOpen(true)}>制卡</button>
          </div>
          <div className="we-cast-characters">
            {(nearby ?? []).map((n) => (
              <NearbyCharacterBlock
                key={n.id}
                sessionId={sessionId}
                nearby={n}
                expanded={expandedIds.includes(n.id)}
                onToggle={() => setExpandedIds((p) => p.includes(n.id) ? p.filter((x) => x !== n.id) : [...p, n.id])}
                onChange={refreshNearby}
                templateCtx={templateCtx}
              />
            ))}
            {(nearby ?? []).length === 0 && <p className="we-cast-empty">本轮无登场角色</p>}
          </div>
        </div>

        {/* TIMELINE 段 — 保留 CastPanel 原实现 */}
      </div>

      <AnimatePresence>
        {addModalOpen && (
          <AddSavedNearbyModal
            worldId={worldId} sessionId={sessionId} nearby={nearby ?? []}
            onAdded={() => { refreshNearby(); setAddModalOpen(false); }}
            onClose={() => setAddModalOpen(false)}
          />
        )}
        {makeCardOpen && (
          <MakeCardModal
            worldId={worldId} sessionId={sessionId} nearby={nearby ?? []}
            onDone={() => setMakeCardOpen(false)}
            onClose={() => setMakeCardOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* 悬浮"整理中/已整理"卡保留 */}
    </div>
  );
}
```

> 实现时直接拷贝 CastPanel.jsx 全部代码做基础，再按上面差异点修改：①删除 CAST 印章行 ②删除 CharacterBlock（替换为 NearbyCharacterBlock） ③删除 activateCharacter / deactivateCharacter 的 import 与调用 ④"附近"标题栏挂两个按钮。

- [ ] **Step 5: 修改 WritingSpacePage.jsx**

替换 import 与组件：

```jsx
// 删除：import CastPanel from '../components/book/CastPanel.jsx';
import NearbyPanel from '../components/book/NearbyPanel.jsx';

// 删除 activeCharacters state 与 activateCharacter / deactivateCharacter 调用
// CastPanel → NearbyPanel；删除 activeCharacters / onActiveCharactersChange props
<NearbyPanel
  worldId={worldId}
  sessionId={sessionId}
  persona={persona}
  stateTick={stateTick}
  diaryTick={diaryTick}
  onDiaryInject={onDiaryInject}
/>
```

如果 WritingSpacePage 有"制卡"按钮挂在别处，删除（已迁到 NearbyPanel 内部）。

- [ ] **Step 6: 注册新组件 + 添加样式 token**

`frontend/src/components/index.js` 添加 NearbyPanel / NearbyCharacterBlock / AddSavedNearbyModal export。

`frontend/src/styles/tokens.css` 或对应 stylesheet 加：

```css
.we-nearby-seal {
  display: inline-block;
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--we-vermilion);
  margin-right: 6px;
}
.we-nearby-memory {
  font-size: var(--we-font-size-sm);
  color: var(--we-ink-soft);
  padding: 4px 8px;
  border-left: 2px solid var(--we-rule);
  margin: 8px 0;
  cursor: pointer;
}
```

- [ ] **Step 7: 跑前端单测**

```bash
cd frontend && npm run test
```
Expected: PASS（如尚无 NearbyPanel 测试则不影响）

- [ ] **Step 8: 手动验证（启动 dev）**

```bash
cd backend && npm run dev &
cd frontend && npm run dev
```
访问 `http://localhost:5173/`，进入写作页：
- 右侧栏出现「世界 / {{user}} / 附近 / TIMELINE」四段
- "附近"区块右上有 ＋角色卡 / 制卡 按钮
- 发一轮对话后（含登场角色）→ "附近"出现 transient 角色块，点击展开看到 state + memory
- 点击 transient 的"保存"→ 印章 icon 出现
- 关闭 dev server

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/book/NearbyPanel.jsx frontend/src/components/book/NearbyCharacterBlock.jsx frontend/src/components/book/AddSavedNearbyModal.jsx frontend/src/components/index.js frontend/src/pages/WritingSpacePage.jsx frontend/src/hooks/useSessionState.js frontend/src/styles/tokens.css
git commit -m "feat(ui): NearbyPanel 替换 CastPanel — 附近区块 + 角色卡添加"
```

---

## Task 11: 删除 writing_session_characters 全链路 + CastPanel

**Files:**
- Modify: `backend/db/schema.js`（删表 DDL；新增迁移 `DROP TABLE IF EXISTS writing_session_characters`）
- Delete: `backend/db/queries/writing-session-characters.js`
- Modify: `backend/services/writing-sessions.js`（删 activate/deactivate/listActive）
- Modify: `backend/routes/writing.js`（删相关路由）
- Delete: `frontend/src/components/book/CastPanel.jsx`
- Modify: `frontend/src/api/writing-sessions.js`（确认无残留 active/deactivate 函数）
- Modify: `SCHEMA.md`（删除 writing_session_characters 章节；删除策略章节去掉相关引用）

- [ ] **Step 1: 后端 DDL 与迁移**

`backend/db/schema.js`：
- 从 `TABLES` 字符串删除 `writing_session_characters` CREATE 块
- 在 ALTER 迁移段添加：
  ```js
  db.exec(`DROP TABLE IF EXISTS writing_session_characters`);
  ```

- [ ] **Step 2: 删除 query / service / route 代码**

- 删 `backend/db/queries/writing-session-characters.js`
- 在 `backend/services/writing-sessions.js` 删除 `activateCharacter` / `deactivateCharacter` / `listActiveCharacters`（及它们的内部 import）
- 在 `backend/routes/writing.js` 删除 `/active-characters` / `/activate` / `/deactivate` 等相关路由

- [ ] **Step 3: 删除前端 CastPanel + activateCharacter 残留**

- 删 `frontend/src/components/book/CastPanel.jsx`
- 在 `frontend/src/components/index.js` 删除 CastPanel 导出
- `frontend/src/api/writing-sessions.js` 删除 `activateCharacter` / `deactivateCharacter`

- [ ] **Step 4: 跑全量后端测试**

```bash
cd backend && npm run test
```
Expected: 全绿；如有测试还引用 writing_session_characters 则同步删除（搜索 grep 确认）

- [ ] **Step 5: 同步 SCHEMA.md**

删除 `### writing_session_characters` 整节；删除「删除策略」中相关引用；新增"已删除：writing_session_characters（被 nearby 替代）"的简短迁移备注（最小化）。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: 移除 writing_session_characters / CastPanel — 由 nearby 全面替代"
```

---

## Task 12: 制卡 modal 重写

**Files:**
- Create: `frontend/src/components/book/MakeCardModal.jsx`
- Delete: `frontend/src/components/writing/CharacterAnalyzingModal.jsx`
- Delete: `frontend/src/components/writing/CharacterPreviewModal.jsx`

- [ ] **Step 1: 实现 MakeCardModal**

```jsx
import { useState } from 'react';
import ModalShell from '../ui/ModalShell.jsx';
import { analyzeNearbyForCard, createCharacterFromNearby } from '../../api/session-nearby.js';
import { pushErrorToast } from '../../utils/toast.js';

export default function MakeCardModal({ worldId, sessionId, nearby, onDone, onClose }) {
  const [step, setStep] = useState('pick'); // pick → preview
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null); // { name, system_prompt, description, first_message }
  const [loading, setLoading] = useState(false);

  async function handlePick(n) {
    setSelectedId(n.id);
    setLoading(true);
    try {
      const d = await analyzeNearbyForCard(sessionId, n.id);
      setDraft(d);
      setStep('preview');
    } catch (e) {
      pushErrorToast(e.message || '分析失败');
      setSelectedId(null);
    } finally { setLoading(false); }
  }

  async function handleConfirm() {
    setLoading(true);
    try {
      await createCharacterFromNearby(worldId, {
        session_id: sessionId, nearby_id: selectedId,
        name: draft.name, system_prompt: draft.system_prompt,
        description: draft.description, first_message: draft.first_message,
      });
      onDone();
    } catch (e) { pushErrorToast(e.message || '创建失败'); }
    finally { setLoading(false); }
  }

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-md">
      {step === 'pick' && (
        <div>
          <p className="we-modal-title">选择本轮登场角色制卡</p>
          {nearby.length === 0 && <p>本轮无登场角色</p>}
          {nearby.map((n) => (
            <div key={n.id} className="we-cast-add-modal-row">
              <span>{n.name}{n.is_saved ? '（已保存）' : ''}</span>
              <button onClick={() => handlePick(n)} disabled={loading}>选择</button>
            </div>
          ))}
        </div>
      )}
      {step === 'preview' && draft && (
        <div>
          <p className="we-modal-title">预览（可编辑）</p>
          <label>名字 <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label>简介 <textarea value={draft.description} rows={2} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
          <label>人设 (system_prompt) <textarea value={draft.system_prompt} rows={4} onChange={(e) => setDraft({ ...draft, system_prompt: e.target.value })} /></label>
          <label>开场白 <textarea value={draft.first_message} rows={2} onChange={(e) => setDraft({ ...draft, first_message: e.target.value })} /></label>
          <div>
            <button onClick={() => setStep('pick')}>返回</button>
            <button onClick={handleConfirm} disabled={loading}>{loading ? '保存中…' : '保存为角色卡'}</button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
```

- [ ] **Step 2: 注册组件**

在 `frontend/src/components/index.js` 添加 MakeCardModal export。

- [ ] **Step 3: 删除旧制卡组件**

```bash
rm frontend/src/components/writing/CharacterAnalyzingModal.jsx frontend/src/components/writing/CharacterPreviewModal.jsx
```

搜索 `grep -rn "CharacterAnalyzingModal\|CharacterPreviewModal" frontend/src` 确认无残留 import；如有则删除。

- [ ] **Step 4: 手动验证**

`npm run dev` → 写作页 → 附近区块右上"制卡" → 选一个登场角色 → 看到 LLM 草稿 → 编辑后"保存为角色卡" → 角色列表中确认新角色已出现，含启用字段的默认值。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/book/MakeCardModal.jsx frontend/src/components/index.js
git rm frontend/src/components/writing/CharacterAnalyzingModal.jsx frontend/src/components/writing/CharacterPreviewModal.jsx
git commit -m "feat(ui): 制卡 modal 重写 — 候选改为本轮登场角色"
```

---

## Task 13: state 字段编辑页加 nearby_enabled 复选框

**Files:**
- Modify: `frontend/src/components/state/StateFieldEditor.jsx`
- Modify: `backend/services/character-state-fields.js`（接受 nearby_enabled 参数）
- Modify: `backend/db/queries/character-state-fields.js`（CRUD 字段）
- Modify: `backend/routes/character-state-fields.js` 或对应 routes（透传字段）
- Modify: `frontend/src/api/character-state-fields.js`（透传字段）
- Test: `backend/tests/db/queries/state-fields.test.js`（增量）

- [ ] **Step 1: 后端 query / service 透传字段**

在 `backend/db/queries/character-state-fields.js` 的 `createCharacterStateField` / `updateCharacterStateField` SELECT 列表中加 `nearby_enabled`；接受参数默认 1。

```js
// create:
db.prepare(`
  INSERT INTO character_state_fields (..., nearby_enabled, ...)
  VALUES (..., ?, ...)
`).run(..., nearbyEnabled ?? 1, ...);

// update: 在 SET 中加 nearby_enabled = ?
```

`getCharacterStateFieldsByWorldId` 默认 SELECT * 即可，自动包含。

`backend/services/character-state-fields.js` 接收 body.nearby_enabled 并透传。

- [ ] **Step 2: 后端路由透传**

`backend/routes/character-state-fields.js`（或 worlds 路由内挂载点）路由 body 解构追加 `nearby_enabled`，透传给 service。

- [ ] **Step 3: 单测验证 CRUD 包含字段**

在 `backend/tests/db/queries/state-fields.test.js` 增加：

```js
it('create + read 包含 nearby_enabled (默认 1)', () => {
  const id = createCharacterStateField({ worldId, fieldKey: 'mood', label: '心情', type: 'text' });
  const row = getCharacterStateFieldsByWorldId(worldId).find((f) => f.id === id);
  expect(row.nearby_enabled).toBe(1);
});
it('create with nearby_enabled=0', () => {
  const id = createCharacterStateField({ worldId, fieldKey: 'hp', label: 'HP', type: 'number', nearbyEnabled: 0 });
  const row = getCharacterStateFieldsByWorldId(worldId).find((f) => f.id === id);
  expect(row.nearby_enabled).toBe(0);
});
```

- [ ] **Step 4: 前端 API 透传**

`frontend/src/api/character-state-fields.js`：所有 create/update body 接受 `nearby_enabled`。

- [ ] **Step 5: 前端 UI 加复选框**

`frontend/src/components/state/StateFieldEditor.jsx`：

```jsx
{/* 在角色字段编辑表单中（仅 character 类字段显示）：*/}
{scope === 'character' && (
  <FormGroup label="登场角色启用">
    <input
      type="checkbox"
      checked={field.nearby_enabled !== 0}
      onChange={(e) => onChange({ ...field, nearby_enabled: e.target.checked ? 1 : 0 })}
    />
    <span style={{ fontSize: 12, color: 'var(--we-ink-soft)' }}>
      关闭后，该字段不会出现在登场角色面板与自动状态更新中
    </span>
  </FormGroup>
)}
```

- [ ] **Step 6: 跑测试**

```bash
cd backend && npx vitest run tests/db/queries/state-fields.test.js
```
Expected: PASS

- [ ] **Step 7: 手动验证**

世界字段编辑页打开 → 看到角色字段里多了"登场角色启用"复选框 → 取消勾选某字段 → 该字段不再出现在 NearbyPanel 中。

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(state): character_state_fields 增加 nearby_enabled 编辑入口"
```

---

## Task 14: 写卡助手知识 + 工具同步

**Files:**
- Modify: `assistant/knowledge/CHARCARD.md`
- Modify: `assistant/knowledge/CONTRACT.md`
- Modify: `assistant/server/tools/`（写字段工具，文件名按现有命名，比如 `worldcard-tools.js` 或 `field-tools.js`）
- Modify: `assistant/server/normalize-proposal.js`（如存在白名单/默认填充逻辑）
- Test: `assistant/tests/`（如有）

- [ ] **Step 1: 阅读现有写卡助手字段创建工具**

```bash
grep -rn "character_state_field\|create_character_field\|updateCharacterField" assistant/server/
```
确认现有工具签名，找到对应 schema/handler。

- [ ] **Step 2: 在工具 schema 增加 nearby_enabled**

例如某 tool 定义：

```js
parameters: {
  type: 'object',
  properties: {
    // ... existing props ...
    nearby_enabled: { type: 'boolean', description: '该字段是否在写作页"附近/登场角色"中启用（默认 true）', default: true },
  },
}
```

handler 内透传给后端 service / API。

- [ ] **Step 3: 更新 CHARCARD.md / CONTRACT.md**

在描述 character_state_fields 的段落补：

```markdown
### nearby_enabled（boolean，默认 true）

控制该字段是否参与写作模式的"附近 / 登场角色"功能：
- true（默认）：该字段会出现在登场角色状态栏中，并由每轮自动状态更新维护
- false：该字段仅作用于公共角色卡（chat 模式），登场角色面板不显示，登场角色状态更新中也不会写入该字段

适用场景：玩家不希望临时出现的配角继承复杂数值（如 HP/MP/属性表），可以把这些字段 `nearby_enabled=false`，只让简单字段（心情、位置）保留。
```

- [ ] **Step 4: normalize-proposal 白名单**

如果 `normalize-proposal.js` 有合法字段白名单或默认值填充，把 `nearby_enabled` 加入：

```js
const ALLOWED_CHAR_FIELD_KEYS = [..., 'nearby_enabled'];

// 默认值填充
function defaultsForCharField(f) {
  return { ...f, nearby_enabled: f.nearby_enabled ?? true };
}
```

- [ ] **Step 5: 跑 assistant 单测**

```bash
cd assistant && npm test  # 或项目根 npm run test:backend 是否覆盖 assistant
```
Expected: PASS

- [ ] **Step 6: 手动验证（可选）**

打开写卡助手 → 让它创建一个角色字段 → 检查 plan-doc 是否包含 nearby_enabled。

- [ ] **Step 7: Commit**

```bash
git add assistant/
git commit -m "feat(assistant): 写卡助手知识 + 工具同步 nearby_enabled 字段"
```

---

## Task 15: 文档同步与全量回归

**Files:**
- Modify: `ARCHITECTURE.md`（§6 状态系统、§5 异步链路、§8 状态系统 — 简短补充 nearby）
- Modify: `CHANGELOG.md`（追加本次特性条目，包含隐性坑点：name 唯一约束、is_saved 切换语义、turn_records snapshot 新层向下兼容策略）
- Modify: `CLAUDE.md`（如关键路径说明涉及 components/book/CastPanel 等需要更新）

- [ ] **Step 1: ARCHITECTURE.md 补充**

在状态系统章节追加 "Nearby Characters（写作模式）" 子节：

```markdown
### Nearby Characters（写作模式专属）

- 数据：`session_nearby_characters` + `session_nearby_character_state_values`，session 级
- 触发：`combined-state-updater`（队列优先级 2）单次 LLM 调用同时完成 pre-flight、提取、状态/记忆更新
- 字段过滤：仅 `character_state_fields.nearby_enabled=1` 字段进入 prompt 与状态更新
- 类型：transient（is_saved=0，本轮没回则删）/ saved（is_saved=1，跨轮持久）
- 命中规则：LLM 返回 ref_id ∈ pool → 更新；ref_id=null + name 命中 → 更新；ref_id=null + name 不在池 → 新建 transient；非法 ref_id → 丢弃
- 回滚：`turn_records.state_snapshot.nearby` 层；`state-rollback.js` 还原
- 删除链路：CASCADE 随 session 删除；不需独立 cleanup hook
```

- [ ] **Step 2: CHANGELOG.md**

追加：

```markdown
## 2026-05-10 — 写作页登场角色（Nearby Characters）

新增 session 级登场角色池替代激活角色概念（writing_session_characters 整表删除）。
- 每轮 combined-state-updater 单次 LLM 调用合并完成 nearby 提取/更新/记忆
- 字段开关：`character_state_fields.nearby_enabled` 默认 1
- 制卡候选改为本轮登场角色

隐性约束：
- (session_id, name) 全局唯一 — 不允许同名，ID 仅作防御性兜底
- LLM 返回 ref_id 不在池中 → 整条丢弃，避免幻觉 ID 制造孤儿
- turn_records.state_snapshot 新增 nearby 层；旧记录无该字段 → 还原时清空 nearby 两张表（向下兼容）
- removeNearby 是直接 DELETE，不降级为 transient（避免与 turn 链路耦合）
```

- [ ] **Step 3: CLAUDE.md 关键路径段更新**

把 `/frontend/src/components/book/` 注释里的 CastPanel 改为 NearbyPanel（如有），其余结构无变化。

- [ ] **Step 4: 跑全量检查**

```bash
npm run check
```
Expected: 全绿（lint + 前后端测试 + assistant 测试）

- [ ] **Step 5: 端到端手动验证清单**

在 dev 环境下：
- [ ] 写作模式发一轮含两个新角色对话 → "附近"出现两个 transient
- [ ] 保存其中一个 → 印章 icon 出现，下一轮该 transient 不再消失
- [ ] 下一轮把 saved 角色描述去掉、只提另一个 → saved 状态保留、新提的更新 / transient 消失
- [ ] 取消勾选某 character_state_field 的 nearby_enabled → 重新打开附近面板，该字段不再出现，下一轮 LLM 也不写入
- [ ] 制卡：选一个 nearby → 预览 → 保存 → 角色列表中确认新角色，启用字段默认值已写入
- [ ] regenerate 上一条消息 → nearby 状态正确回到上一轮
- [ ] 写卡助手对话："给角色加一个'外貌描述'字段，登场角色不要这个" → 助手生成 plan 时 nearby_enabled=false

- [ ] **Step 6: Commit + push**

```bash
git add -A
git commit -m "docs: 同步 ARCHITECTURE / CHANGELOG / CLAUDE for nearby characters"
git push -u origin feature/nearby-characters
```

---

## 自审与覆盖核对

**Spec 覆盖**：
- §3.1 session_nearby_characters → Task 1 / 2
- §3.2 session_nearby_character_state_values → Task 1 / 3
- §3.3 nearby_enabled 列 → Task 1 / 13
- §3.4 删除 writing_session_characters → Task 11
- §3.5 turn_records.state_snapshot 扩展 → Task 7
- §3.6 .weworld.json 兼容 → 通过 default 1 自动覆盖；如果导入导出 service 显式列字段名（白名单），需要在 Task 1 同步加入；执行时检查 `backend/services/import-export.js` 中的 `character_state_fields` 字段白名单，如有缺失则在 Task 1 Step 4（SCHEMA.md 同步前）补加
- §4.1 / 4.2 / 4.3 → Task 2-5
- §4.4 combined-state-updater → Task 6
- §4.5 turn_records / state-rollback → Task 7
- §4.6 制卡服务 → Task 8
- §4.7 副作用清理（CASCADE 自动）→ 无任务
- §5 前端 → Task 9-13
- §6 写卡助手 → Task 14
- §7 SSE / 异步 → Task 6 内嵌（沿用现有 state_updated）+ Task 10 hook 拉取
- §8 错误处理 → 散落各 task 测试用例覆盖
- §9 测试 → 各 task TDD 流程全部覆盖
- §10 范围外 → 计划严格遵守

**类型一致性**：
- `nearby_enabled` 在 DB / service / route / api / UI 全链路一致
- `is_saved` 0/1 整型在所有边界统一
- `nearby_id` 命名在 queries / service / API / UI props 一致

**潜在隐性依赖**（执行 Task 时需即时确认）：
- backend/db 是否有 `db.js` 暴露 `getDb()` — 检查实际命名（可能是 `getDatabase()` 或 `db` 默认导出）
- frontend api 客户端实际方法名（`api.get` vs `fetcher` vs `request`）— 按 `frontend/src/api/_client.js` 实际签名调整
- prompt-loader 是否支持新模板 key — 不支持则 inline prompt
- import-export 服务的字段白名单（§3.6 提到的）— 执行 Task 1 时 grep 确认

执行者每个 Task 开始前 grep 上述项一次，按实际值替换占位。
