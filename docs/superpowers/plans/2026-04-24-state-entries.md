# State Entries (状态条目) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 废除旧触发器三表系统，新增 `state` 类型 Prompt 条目，在每次提示词组装时实时评估状态条件并自动注入。

**Architecture:** 新建 `entry_conditions` 表（外键级联到 `world_prompt_entries`），在 `entry-matcher.js` 内化状态评估逻辑，`matchEntries()` 新增第四分支；前端在 EntryEditor 中扩展 state 类型 UI，WorldConfigPage 去掉触发器面板并增加状态条目区块。

**Tech Stack:** Node.js ESM / better-sqlite3 / React 18 + TailwindCSS

---

## File Structure

### Create
- `backend/db/queries/entry-conditions.js` — `entry_conditions` 表 CRUD
- `backend/tests/db/queries/entry-conditions.test.js` — DB 查询单元测试

### Modify
- `backend/db/schema.js` — DROP 旧触发器三表，ADD entry_conditions，移除 migrateTriggerActionsMulti
- `backend/prompts/entry-matcher.js` — 内化状态评估逻辑，新增 state 分支，签名加 worldId
- `backend/prompts/assembler.js` — 两处 matchEntries 调用传入 worldId
- `backend/routes/prompt-entries.js` — 新增 entry_conditions CRUD 路由
- `backend/routes/chat.js` — 移除 evaluateTriggers import + 任务
- `backend/routes/writing.js` — 移除 evaluateTriggers import + 任务（2 处）
- `backend/server.js` — 移除 triggersRoutes
- `backend/tests/helpers/fixtures.js` — 新增 insertEntryCondition 辅助函数
- `backend/tests/prompts/entry-matcher.test.js` — 新增 state 分支集成测试
- `backend/tests/prompts/assembler.test.js` — 删除 2 个 inject_prompt 陈旧测试
- `frontend/src/api/prompt-entries.js` — 新增 entry_conditions API 封装
- `frontend/src/components/state/EntryEditor.jsx` — 新增 state 类型 UI
- `frontend/src/pages/WorldConfigPage.jsx` — 移除触发器面板，新增状态条目区块

### Delete
- `backend/routes/triggers.js`
- `backend/services/trigger-evaluator.js`
- `backend/db/queries/triggers.js`
- `backend/tests/routes/triggers.test.js`
- `backend/tests/services/trigger-evaluator.test.js`
- `backend/tests/db/queries/triggers.test.js`
- `frontend/src/api/triggers.js`
- `frontend/src/components/state/TriggerEditor.jsx`
- `frontend/src/components/state/TriggerCard.jsx`

---

## Task 1: DB Schema — 删除触发器三表，新增 entry_conditions

**Files:**
- Modify: `backend/db/schema.js`

- [ ] **Step 1: 从 TABLES 字符串中删除 triggers / trigger_conditions / trigger_actions 建表语句，新增 entry_conditions**

  在 `backend/db/schema.js` 的 `const TABLES = \`...\`` 字符串中：

  删除以下内容（约 309–337 行）：
  ```sql
  -- 整段删除 triggers 表及其索引
  CREATE TABLE IF NOT EXISTS triggers ( ... );
  CREATE INDEX IF NOT EXISTS idx_triggers_world_id ON triggers(world_id);
  CREATE TABLE IF NOT EXISTS trigger_conditions ( ... );
  CREATE INDEX IF NOT EXISTS idx_trigger_conditions_trigger_id ON trigger_conditions(trigger_id);
  CREATE TABLE IF NOT EXISTS trigger_actions ( ... );
  ```

  在 TABLES 字符串末尾（`chapter_titles` 表之后）新增：
  ```sql
  CREATE TABLE IF NOT EXISTS entry_conditions (
    id           TEXT PRIMARY KEY,
    entry_id     TEXT NOT NULL REFERENCES world_prompt_entries(id) ON DELETE CASCADE,
    target_field TEXT NOT NULL,
    operator     TEXT NOT NULL,
    value        TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_entry_conditions_entry_id ON entry_conditions(entry_id);
  ```

- [ ] **Step 2: 在 INDEXES 字符串末尾加 entry_conditions 索引（已在 TABLES 中，此步跳过；确认不重复）**

  确认 TABLES 字符串中已含 `CREATE INDEX IF NOT EXISTS idx_entry_conditions_entry_id`，INDEXES 无需改动。

- [ ] **Step 3: 在 initSchema 中移除 migrateTriggerActionsMulti 调用，新增 migrateDropTriggerTables**

  在 `initSchema(db)` 函数中：

  1. 删除 `migrateTriggerActionsMulti(db);` 调用行
  2. 在 `migratePersonasMultiPerWorld(db);` 调用之后添加：
  ```js
  migrateDropTriggerTables(db);
  ```

- [ ] **Step 4: 在 schema.js 末尾添加 migrateDropTriggerTables 函数，删除 migrateTriggerActionsMulti 函数定义**

  删除整个 `function migrateTriggerActionsMulti(db) { ... }` 函数（约 551–584 行）。

  在文件末尾添加：
  ```js
  function migrateDropTriggerTables(db) {
    const migKey = 'migration:drop_trigger_tables';
    const already = db.prepare('SELECT value FROM internal_meta WHERE key = ?').get(migKey);
    if (already) return;

    db.exec('DROP TABLE IF EXISTS trigger_actions');
    db.exec('DROP TABLE IF EXISTS trigger_conditions');
    db.exec('DROP TABLE IF EXISTS triggers');

    db.prepare("INSERT OR REPLACE INTO internal_meta (key, value, updated_at) VALUES (?, '1', ?)")
      .run(migKey, Date.now());
  }
  ```

- [ ] **Step 5: 验证 schema 初始化不报错**

  ```bash
  cd /Users/yunzhiwang/Desktop/WorldEngine/backend
  node -e "import('./db/schema.js').then(m => console.log('schema ok'))"
  ```
  预期输出：`schema ok`

- [ ] **Step 6: Commit**

  ```bash
  git add backend/db/schema.js
  git commit -m "feat: schema — 废除触发器三表，新增 entry_conditions 表"
  ```

---

## Task 2: DB Queries — 创建 entry-conditions.js + 测试

**Files:**
- Create: `backend/db/queries/entry-conditions.js`
- Modify: `backend/tests/helpers/fixtures.js`
- Create: `backend/tests/db/queries/entry-conditions.test.js`

- [ ] **Step 1: 先写测试（TDD）**

  创建 `backend/tests/db/queries/entry-conditions.test.js`：

  ```js
  import test, { after } from 'node:test';
  import assert from 'node:assert/strict';
  import { createTestSandbox, freshImport } from '../../helpers/test-env.js';
  import { insertWorld, insertCharacter, insertWorldEntry } from '../../helpers/fixtures.js';

  const sandbox = createTestSandbox('entry-conditions-suite');
  sandbox.setEnv();
  after(() => sandbox.cleanup());

  test('listConditionsByEntry 返回指定条目的所有条件', async () => {
    const world = insertWorld(sandbox.db, { name: '状态条目世界-1' });
    const entry = insertWorldEntry(sandbox.db, world.id, { title: '低血量提示', trigger_type: 'state' });
    const { listConditionsByEntry, replaceEntryConditions } = await freshImport('backend/db/queries/entry-conditions.js');

    replaceEntryConditions(entry.id, [
      { target_field: '世界.体力', operator: '<', value: '30' },
      { target_field: '玩家.心情', operator: '等于', value: '痛苦' },
    ]);

    const conds = listConditionsByEntry(entry.id);
    assert.equal(conds.length, 2);
    assert.equal(conds[0].target_field, '世界.体力');
    assert.equal(conds[0].operator, '<');
    assert.equal(conds[0].value, '30');
  });

  test('replaceEntryConditions 先删后插（幂等替换）', async () => {
    const world = insertWorld(sandbox.db, { name: '状态条目世界-2' });
    const entry = insertWorldEntry(sandbox.db, world.id, { title: '幂等测试', trigger_type: 'state' });
    const { listConditionsByEntry, replaceEntryConditions } = await freshImport('backend/db/queries/entry-conditions.js');

    replaceEntryConditions(entry.id, [
      { target_field: '世界.体力', operator: '>', value: '50' },
    ]);
    assert.equal(listConditionsByEntry(entry.id).length, 1);

    replaceEntryConditions(entry.id, [
      { target_field: '角色.好感度', operator: '>=', value: '80' },
      { target_field: '世界.戒严', operator: '!=', value: '1' },
    ]);
    const conds = listConditionsByEntry(entry.id);
    assert.equal(conds.length, 2, '替换后应有 2 条，旧条件应被清除');
    assert.equal(conds[0].target_field, '角色.好感度');
  });

  test('replaceEntryConditions 传空数组清空所有条件', async () => {
    const world = insertWorld(sandbox.db, { name: '状态条目世界-3' });
    const entry = insertWorldEntry(sandbox.db, world.id, { title: '清空测试', trigger_type: 'state' });
    const { listConditionsByEntry, replaceEntryConditions } = await freshImport('backend/db/queries/entry-conditions.js');

    replaceEntryConditions(entry.id, [{ target_field: '世界.体力', operator: '<', value: '10' }]);
    replaceEntryConditions(entry.id, []);
    assert.equal(listConditionsByEntry(entry.id).length, 0);
  });

  test('entry 删除时 entry_conditions 级联删除', async () => {
    const world = insertWorld(sandbox.db, { name: '状态条目世界-4' });
    const entry = insertWorldEntry(sandbox.db, world.id, { title: '级联删除测试', trigger_type: 'state' });
    const { listConditionsByEntry, replaceEntryConditions } = await freshImport('backend/db/queries/entry-conditions.js');

    replaceEntryConditions(entry.id, [{ target_field: '世界.体力', operator: '<', value: '20' }]);
    sandbox.db.prepare('DELETE FROM world_prompt_entries WHERE id = ?').run(entry.id);
    assert.equal(listConditionsByEntry(entry.id).length, 0, '级联删除后条件应为空');
  });
  ```

- [ ] **Step 2: 运行测试，确认失败**

  ```bash
  cd /Users/yunzhiwang/Desktop/WorldEngine/backend
  node --test tests/db/queries/entry-conditions.test.js 2>&1 | head -20
  ```
  预期：FAIL，因为 `entry-conditions.js` 尚未创建。

- [ ] **Step 3: 实现 entry-conditions.js**

  创建 `backend/db/queries/entry-conditions.js`：

  ```js
  import crypto from 'node:crypto';
  import db from '../index.js';

  /**
   * 查询指定条目的所有状态条件，按插入顺序返回
   * @param {string} entryId
   * @returns {Array<{ id, entry_id, target_field, operator, value }>}
   */
  export function listConditionsByEntry(entryId) {
    return db.prepare('SELECT * FROM entry_conditions WHERE entry_id = ? ORDER BY rowid ASC').all(entryId);
  }

  /**
   * 事务内替换条目的所有条件（先清空，再批量插入）
   * @param {string} entryId
   * @param {Array<{ target_field: string, operator: string, value: string }>} conditions
   */
  export function replaceEntryConditions(entryId, conditions) {
    const del = db.prepare('DELETE FROM entry_conditions WHERE entry_id = ?');
    const ins = db.prepare(
      'INSERT INTO entry_conditions (id, entry_id, target_field, operator, value) VALUES (?, ?, ?, ?, ?)',
    );
    db.transaction(() => {
      del.run(entryId);
      for (const c of conditions) {
        ins.run(crypto.randomUUID(), entryId, c.target_field, c.operator, c.value);
      }
    })();
  }
  ```

- [ ] **Step 4: 在 fixtures.js 新增 insertEntryCondition 辅助函数**

  在 `backend/tests/helpers/fixtures.js` 末尾添加：

  ```js
  export function insertEntryCondition(db, entryId, patch = {}) {
    const id = patch.id ?? crypto.randomUUID();
    db.prepare(
      'INSERT INTO entry_conditions (id, entry_id, target_field, operator, value) VALUES (?, ?, ?, ?, ?)',
    ).run(
      id,
      entryId,
      patch.target_field ?? '世界.字段',
      patch.operator ?? '>',
      patch.value ?? '0',
    );
    return { id, entry_id: entryId, target_field: patch.target_field ?? '世界.字段', operator: patch.operator ?? '>', value: patch.value ?? '0' };
  }
  ```

- [ ] **Step 5: 运行测试，确认通过**

  ```bash
  cd /Users/yunzhiwang/Desktop/WorldEngine/backend
  node --test tests/db/queries/entry-conditions.test.js
  ```
  预期：4 passed

- [ ] **Step 6: Commit**

  ```bash
  git add backend/db/queries/entry-conditions.js backend/tests/db/queries/entry-conditions.test.js backend/tests/helpers/fixtures.js
  git commit -m "feat: entry-conditions 查询层 + 单元测试"
  ```

---

## Task 3: entry-matcher.js — 内化状态评估，新增 state 分支

**Files:**
- Modify: `backend/prompts/entry-matcher.js`
- Modify: `backend/tests/prompts/entry-matcher.test.js`

- [ ] **Step 1: 在 entry-matcher.test.js 末尾新增 state 分支集成测试**

  在 `backend/tests/prompts/entry-matcher.test.js` 末尾追加：

  ```js
  // ─── state 分支集成测试 ─────────────────────────────────────
  import { insertWorldEntry, insertEntryCondition, insertWorldStateField, insertSessionWorldStateValue } from '../helpers/fixtures.js';

  describe('matchEntries — state 类型条件评估', () => {
    test('单条件满足时命中 state 条目', async () => {
      const world = insertWorld(sandbox.db, { name: '状态条目世界-A' });
      const character = insertCharacter(sandbox.db, world.id, { name: '测试角色' });
      const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id, mode: 'chat' });

      // 建状态字段 + 设置会话值
      insertWorldStateField(sandbox.db, world.id, { field_key: 'hp', label: '体力', type: 'number' });
      insertSessionWorldStateValue(sandbox.db, session.id, world.id, { field_key: 'hp', runtime_value_json: '25' });

      // 建 state 条目 + 设置条件：世界.体力 < 30
      const entry = insertWorldEntry(sandbox.db, world.id, { title: '低血量提醒', trigger_type: 'state', content: '注意体力不足' });
      insertEntryCondition(sandbox.db, entry.id, { target_field: '世界.体力', operator: '<', value: '30' });

      resetMockEnv();
      const { matchEntries } = await freshImport('backend/prompts/entry-matcher.js');
      const matched = await matchEntries(session.id, [{ ...entry }], world.id);
      assert.ok(matched.has(entry.id), '体力 25 < 30，应命中');
    });

    test('条件不满足时 state 条目不触发', async () => {
      const world = insertWorld(sandbox.db, { name: '状态条目世界-B' });
      const character = insertCharacter(sandbox.db, world.id, { name: '测试角色B' });
      const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id, mode: 'chat' });

      insertWorldStateField(sandbox.db, world.id, { field_key: 'hp2', label: '生命', type: 'number' });
      insertSessionWorldStateValue(sandbox.db, session.id, world.id, { field_key: 'hp2', runtime_value_json: '80' });

      const entry = insertWorldEntry(sandbox.db, world.id, { title: '低血量提醒B', trigger_type: 'state', content: '...' });
      insertEntryCondition(sandbox.db, entry.id, { target_field: '世界.生命', operator: '<', value: '30' });

      resetMockEnv();
      const { matchEntries } = await freshImport('backend/prompts/entry-matcher.js');
      const matched = await matchEntries(session.id, [{ ...entry }], world.id);
      assert.ok(!matched.has(entry.id), '生命 80 不满足 < 30，不应命中');
    });

    test('多条件 AND 逻辑：所有条件满足才触发', async () => {
      const world = insertWorld(sandbox.db, { name: '状态条目世界-C' });
      const character = insertCharacter(sandbox.db, world.id, { name: '测试角色C' });
      const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id, mode: 'chat' });

      insertWorldStateField(sandbox.db, world.id, { field_key: 'hp3', label: '耐力', type: 'number' });
      insertWorldStateField(sandbox.db, world.id, { field_key: 'status', label: '状态', type: 'text' });
      insertSessionWorldStateValue(sandbox.db, session.id, world.id, { field_key: 'hp3', runtime_value_json: '20' });
      insertSessionWorldStateValue(sandbox.db, session.id, world.id, { field_key: 'status', runtime_value_json: '"危机"' });

      const entry = insertWorldEntry(sandbox.db, world.id, { title: '双条件', trigger_type: 'state', content: '...' });
      insertEntryCondition(sandbox.db, entry.id, { target_field: '世界.耐力', operator: '<', value: '30' });
      insertEntryCondition(sandbox.db, entry.id, { target_field: '世界.状态', operator: '等于', value: '危机' });

      resetMockEnv();
      const { matchEntries } = await freshImport('backend/prompts/entry-matcher.js');
      const matched = await matchEntries(session.id, [{ ...entry }], world.id);
      assert.ok(matched.has(entry.id), 'AND 条件全满足，应命中');
    });

    test('state 条目无条件时不触发', async () => {
      const world = insertWorld(sandbox.db, { name: '状态条目世界-D' });
      const character = insertCharacter(sandbox.db, world.id, { name: '测试角色D' });
      const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id, mode: 'chat' });

      const entry = insertWorldEntry(sandbox.db, world.id, { title: '空条件', trigger_type: 'state', content: '...' });
      // 不添加任何 entry_conditions

      resetMockEnv();
      const { matchEntries } = await freshImport('backend/prompts/entry-matcher.js');
      const matched = await matchEntries(session.id, [{ ...entry }], world.id);
      assert.ok(!matched.has(entry.id), '无条件的 state 条目不应触发');
    });
  });
  ```

  > 注意：需要在文件顶部 import 中补上 `describe` 和新增的 fixture 导入（见下一步）。

- [ ] **Step 2: 检查 entry-matcher.test.js 顶部 import，补全缺失项**

  在文件顶部 import 行确保有：
  ```js
  import { test, describe, after } from 'node:test';
  // （已有 test 和 after，加上 describe）
  import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
  import {
    insertCharacter, insertMessage, insertSession, insertWorld,
    insertWorldEntry, insertEntryCondition,
    insertWorldStateField, insertSessionWorldStateValue,
  } from '../helpers/fixtures.js';
  ```

  如果 `insertSessionWorldStateValue` 在 fixtures.js 不存在，用以下方式直接插入：
  ```js
  // 在测试内部直接写 SQL 插入即可
  sandbox.db.prepare(`
    INSERT OR REPLACE INTO session_world_state_values (id, session_id, world_id, field_key, runtime_value_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), session.id, world.id, 'hp', '25', Date.now());
  ```

- [ ] **Step 3: 运行测试，确认 state 测试失败（entry-matcher 尚未实现 state 分支）**

  ```bash
  cd /Users/yunzhiwang/Desktop/WorldEngine/backend
  node --test tests/prompts/entry-matcher.test.js 2>&1 | tail -20
  ```
  预期：state 相关用例 FAIL。

- [ ] **Step 4: 更新 entry-matcher.js — 新增 imports 和状态评估函数**

  在 `backend/prompts/entry-matcher.js` 顶部 import 区域新增：

  ```js
  import { getSessionById } from '../db/queries/sessions.js';
  import { getCharacterById } from '../db/queries/characters.js';
  import {
    getSessionWorldStateValues,
    getSessionPersonaStateValues,
    getSingleCharacterSessionStateValues,
  } from '../db/queries/session-state-values.js';
  import { getWritingSessionCharacters } from '../db/queries/writing-sessions.js';
  import { listConditionsByEntry } from '../db/queries/entry-conditions.js';
  import { createLogger } from '../utils/logger.js';

  const log = createLogger('entry-matcher');
  ```

- [ ] **Step 5: 在 entry-matcher.js 中添加 evaluateCondition 和状态收集辅助函数**

  在 `resolveKeywordScopes` 函数之前插入：

  ```js
  // ─── 状态条件评估（移植自 trigger-evaluator.js）────────────────

  const NUMERIC_OPS = new Set(['>', '<', '=', '>=', '<=', '!=']);
  const TEXT_OPS = new Set(['包含', '等于', '不包含']);

  function evaluateCondition(condition, stateMap) {
    const { target_field, operator, value } = condition;
    if (!stateMap.has(target_field)) return false;
    const current = stateMap.get(target_field);
    if (NUMERIC_OPS.has(operator)) {
      const cur = Number(current);
      const thr = Number(value);
      if (!Number.isFinite(cur) || !Number.isFinite(thr)) return false;
      switch (operator) {
        case '>':  return cur > thr;
        case '<':  return cur < thr;
        case '=':  return cur === thr;
        case '>=': return cur >= thr;
        case '<=': return cur <= thr;
        case '!=': return cur !== thr;
      }
    }
    if (TEXT_OPS.has(operator)) {
      switch (operator) {
        case '包含':   return current.includes(value);
        case '等于':   return current === value;
        case '不包含': return !current.includes(value);
      }
    }
    return false;
  }

  function parseEffectiveValue(effectiveValueJson) {
    if (effectiveValueJson == null) return null;
    try {
      const parsed = JSON.parse(effectiveValueJson);
      if (parsed == null) return null;
      return String(parsed);
    } catch {
      return String(effectiveValueJson);
    }
  }

  function buildSharedStateMap(worldId, sessionId) {
    const map = new Map();
    for (const row of getSessionWorldStateValues(sessionId, worldId)) {
      const val = parseEffectiveValue(row.effective_value_json);
      if (val != null) map.set(`世界.${row.label}`, val);
    }
    for (const row of getSessionPersonaStateValues(sessionId, worldId)) {
      const val = parseEffectiveValue(row.effective_value_json);
      if (val != null) map.set(`玩家.${row.label}`, val);
    }
    return map;
  }

  function buildCharacterStateMap(worldId, sessionId, characterId) {
    const map = new Map();
    if (!characterId) return map;
    for (const row of getSingleCharacterSessionStateValues(sessionId, characterId, worldId)) {
      const val = parseEffectiveValue(row.effective_value_json);
      if (val != null) map.set(`角色.${row.label}`, val);
    }
    return map;
  }

  function mergeStateMaps(...maps) {
    const merged = new Map();
    for (const map of maps) for (const [k, v] of map) merged.set(k, v);
    return merged;
  }
  ```

- [ ] **Step 6: 在 matchEntries 函数签名和分流逻辑中新增 state 分支**

  将 `matchEntries` 函数签名从：
  ```js
  export async function matchEntries(sessionId, entries) {
  ```
  改为：
  ```js
  export async function matchEntries(sessionId, entries, worldId = null) {
  ```

  在分流代码（for 循环）中，在 `else { alwaysEntries.push(entry); }` 之前新增：
  ```js
  } else if (type === 'state') {
    stateEntries.push(entry);
  ```

  同时在 `const alwaysEntries = [];` 等声明后添加：
  ```js
  const stateEntries = [];
  ```

  在 llm 分支处理完毕后（`return triggered;` 之前）添加 state 分支：

  ```js
  // state：实时评估状态条件（AND 逻辑，所有条件满足才触发）
  if (stateEntries.length > 0 && worldId) {
    const session = getSessionById(sessionId);
    const sharedMap = buildSharedStateMap(worldId, sessionId);

    if (session?.mode === 'writing') {
      // writing 模式：对每个激活角色评估；任一角色满足所有条件即触发
      const writingChars = getWritingSessionCharacters(sessionId);
      for (const entry of stateEntries) {
        const conditions = listConditionsByEntry(entry.id);
        if (conditions.length === 0) continue;
        const hasCharCond = conditions.some((c) => c.target_field.startsWith('角色.'));
        let allMet = false;
        if (hasCharCond && writingChars.length > 0) {
          allMet = writingChars.some((char) => {
            const charMap = buildCharacterStateMap(worldId, sessionId, char.id);
            return conditions.every((c) => evaluateCondition(c, mergeStateMaps(sharedMap, charMap)));
          });
        } else {
          allMet = conditions.every((c) => evaluateCondition(c, sharedMap));
        }
        if (allMet) triggered.add(entry.id);
      }
    } else {
      // chat 模式：使用 world + persona + 当前角色状态
      const charMap = session?.character_id
        ? buildCharacterStateMap(worldId, sessionId, session.character_id)
        : new Map();
      const stateMap = mergeStateMaps(sharedMap, charMap);
      for (const entry of stateEntries) {
        const conditions = listConditionsByEntry(entry.id);
        if (conditions.length === 0) continue;
        if (conditions.every((c) => evaluateCondition(c, stateMap))) {
          triggered.add(entry.id);
        }
      }
    }
  }
  ```

- [ ] **Step 7: 运行测试，确认全部通过**

  ```bash
  cd /Users/yunzhiwang/Desktop/WorldEngine/backend
  node --test tests/prompts/entry-matcher.test.js
  ```
  预期：全部用例 passed。

- [ ] **Step 8: Commit**

  ```bash
  git add backend/prompts/entry-matcher.js backend/tests/prompts/entry-matcher.test.js
  git commit -m "feat: entry-matcher 新增 state 条目分支 + 状态评估逻辑"
  ```

---

## Task 4: assembler.js — 更新 matchEntries 调用签名

**Files:**
- Modify: `backend/prompts/assembler.js`

- [ ] **Step 1: buildPrompt 中传入 worldId**

  在 `buildPrompt` 函数中（约 201 行），将：
  ```js
  const triggeredIds = await matchEntries(sessionId, worldEntries);
  ```
  改为：
  ```js
  const triggeredIds = await matchEntries(sessionId, worldEntries, world.id);
  ```

- [ ] **Step 2: buildWritingPrompt 中传入 worldId**

  在 `buildWritingPrompt` 函数中（约 384 行），将：
  ```js
  const triggeredIds = await matchEntries(sessionId, worldEntries);
  ```
  改为：
  ```js
  const triggeredIds = await matchEntries(sessionId, worldEntries, world.id);
  ```

- [ ] **Step 3: 运行 assembler 测试确认无回归**

  ```bash
  cd /Users/yunzhiwang/Desktop/WorldEngine/backend
  node --test tests/prompts/assembler.test.js 2>&1 | tail -10
  ```
  预期：既有 passed 用例继续 pass（inject_prompt 相关 2 个会 fail，下一步处理）。

- [ ] **Step 4: 删除 assembler.test.js 中 2 个陈旧的 inject_prompt 测试**

  在 `backend/tests/prompts/assembler.test.js` 中，删除以下两个 `test(...)` 块（约 226–287 行）：
  - `test('buildPrompt inject_prompt consumed 模式注入且递减 rounds_remaining', ...)`
  - `test('buildPrompt inject_prompt rounds_remaining=0 时不再注入', ...)`

- [ ] **Step 5: 再次运行 assembler 测试，确认全部通过**

  ```bash
  cd /Users/yunzhiwang/Desktop/WorldEngine/backend
  node --test tests/prompts/assembler.test.js
  ```
  预期：全部通过。

- [ ] **Step 6: Commit**

  ```bash
  git add backend/prompts/assembler.js backend/tests/prompts/assembler.test.js
  git commit -m "feat: assembler 传入 worldId 到 matchEntries，删除陈旧 inject_prompt 测试"
  ```

---

## Task 5: prompt-entries 路由 — 新增 entry_conditions 端点

**Files:**
- Modify: `backend/routes/prompt-entries.js`

- [ ] **Step 1: 新增 entry_conditions import 并添加路由**

  在 `backend/routes/prompt-entries.js` 顶部新增 import：
  ```js
  import { listConditionsByEntry, replaceEntryConditions } from '../db/queries/entry-conditions.js';
  import { getWorldPromptEntryById as _getEntryById } from '../db/queries/prompt-entries.js';
  ```

  在 `export default router;` 之前添加：
  ```js
  // ─── entry_conditions ─────────────────────────────────────────

  // GET /api/world-entries/:id/conditions — 查询条件列表
  router.get('/world-entries/:id/conditions', (req, res) => {
    const entry = _getEntryById(req.params.id);
    if (!assertExists(res, entry, 'Entry not found')) return;
    res.json(listConditionsByEntry(req.params.id));
  });

  // PUT /api/world-entries/:id/conditions — 批量替换所有条件
  router.put('/world-entries/:id/conditions', (req, res) => {
    const entry = _getEntryById(req.params.id);
    if (!assertExists(res, entry, 'Entry not found')) return;
    const { conditions } = req.body;
    if (!Array.isArray(conditions)) return res.status(400).json({ error: 'conditions must be an array' });
    replaceEntryConditions(req.params.id, conditions);
    res.json(listConditionsByEntry(req.params.id));
  });
  ```

  注意：`_getEntryById` 是从 `db/queries/prompt-entries.js` 直接引用，因为 services 层不一定暴露此函数。如果 `getWorldPromptEntryById` 已在 services 暴露，改从 services 引入。

- [ ] **Step 2: 验证路由注册正确（手动检查无语法错误）**

  ```bash
  cd /Users/yunzhiwang/Desktop/WorldEngine/backend
  node -e "import('./routes/prompt-entries.js').then(() => console.log('ok'))"
  ```
  预期：`ok`

- [ ] **Step 3: Commit**

  ```bash
  git add backend/routes/prompt-entries.js
  git commit -m "feat: 新增 entry_conditions GET/PUT 路由"
  ```

---

## Task 6: 后端清理 — 删除触发器相关文件并更新调用方

**Files:**
- Modify: `backend/routes/chat.js`
- Modify: `backend/routes/writing.js`
- Modify: `backend/server.js`
- Delete: `backend/routes/triggers.js`, `backend/services/trigger-evaluator.js`, `backend/db/queries/triggers.js`
- Delete: `backend/tests/routes/triggers.test.js`, `backend/tests/services/trigger-evaluator.test.js`, `backend/tests/db/queries/triggers.test.js`

- [ ] **Step 1: chat.js — 移除 evaluateTriggers import 和 trigger-eval 任务**

  在 `backend/routes/chat.js` 中：
  1. 删除 import 行（约第 24 行）：
     ```js
     import { evaluateTriggers } from '../services/trigger-evaluator.js';
     ```
  2. 删除 `trigger-eval` 任务对象（约 84–96 行）：
     ```js
     // trigger-eval（p2）：状态更新完成后评估触发器
     {
       label: 'trigger-eval',
       priority: 2,
       fn: () => {
         const roundIndex = turnRecordOpts?.isUpdate
           ? (getLatestTurnRecord(sessionId)?.round_index ?? 1)
           : countTurnRecords(sessionId) + 1;
         return evaluateTriggers(worldId, sessionId, roundIndex);
       },
       condition: !!worldId,
       keepSseAlive: false,
     },
     ```

- [ ] **Step 2: writing.js — 移除 evaluateTriggers import 和两处 trigger-eval 任务**

  在 `backend/routes/writing.js` 中：
  1. 删除 import 行（约第 26 行）：
     ```js
     import { evaluateTriggers } from '../services/trigger-evaluator.js';
     ```
  2. 删除第一个 `trigger-eval` 任务对象（约 278–288 行）：
     ```js
     // trigger-eval（p2）：状态更新完成后评估触发器
     {
       label: 'trigger-eval',
       priority: 2,
       fn: () => {
         const roundIndex = countTurnRecords(sessionId) + 1;
         return evaluateTriggers(worldId, sessionId, roundIndex);
       },
       condition: !!worldId,
       keepSseAlive: false,
     },
     ```
  3. 删除第二个 `trigger-eval` 任务对象（约 453–463 行）：
     ```js
     // trigger-eval（p2）：续写场景覆盖最后轮，roundIndex 取最新 turn record
     {
       label: 'trigger-eval',
       priority: 2,
       fn: () => {
         const roundIndex = getLatestTurnRecord(sessionId)?.round_index ?? 1;
         return evaluateTriggers(worldId, sessionId, roundIndex);
       },
       condition: !!worldId,
       keepSseAlive: false,
     },
     ```

- [ ] **Step 3: server.js — 移除 triggersRoutes**

  在 `backend/server.js` 中：
  1. 删除 import 行（约第 41 行）：
     ```js
     import triggersRoutes from './routes/triggers.js';
     ```
  2. 删除路由注册行（约第 158 行）：
     ```js
     app.use('/api', triggersRoutes);
     ```

- [ ] **Step 4: 删除触发器相关文件**

  ```bash
  rm backend/routes/triggers.js
  rm backend/services/trigger-evaluator.js
  rm backend/db/queries/triggers.js
  rm backend/tests/routes/triggers.test.js
  rm backend/tests/services/trigger-evaluator.test.js
  rm backend/tests/db/queries/triggers.test.js
  ```

- [ ] **Step 5: 运行 chat 和 writing 路由测试确认无回归**

  ```bash
  cd /Users/yunzhiwang/Desktop/WorldEngine/backend
  node --test tests/routes/chat.test.js tests/routes/writing.test.js 2>&1 | tail -10
  ```
  预期：已有通过用例继续通过。

- [ ] **Step 6: Commit**

  ```bash
  git add -A
  git commit -m "feat: 移除触发器系统（routes/services/queries/tests 全部清理）"
  ```

---

## Task 7: 前端 API — 更新 prompt-entries.js，删除 triggers.js

**Files:**
- Modify: `frontend/src/api/prompt-entries.js`
- Delete: `frontend/src/api/triggers.js`

- [ ] **Step 1: 在 prompt-entries.js 新增 entry_conditions API 封装**

  在 `frontend/src/api/prompt-entries.js` 末尾添加：

  ```js
  // ─── entry_conditions ─────────────────────────────────────────

  export function getEntryConditions(entryId) {
    return request(`${BASE}/world-entries/${entryId}/conditions`);
  }

  export function replaceEntryConditions(entryId, conditions) {
    return request(`${BASE}/world-entries/${entryId}/conditions`, {
      method: 'PUT',
      body: JSON.stringify({ conditions }),
    });
  }
  ```

- [ ] **Step 2: 删除 triggers.js**

  ```bash
  rm frontend/src/api/triggers.js
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/api/prompt-entries.js
  git rm frontend/src/api/triggers.js
  git commit -m "feat: 前端 API 新增 entry_conditions 封装，删除 triggers.js"
  ```

---

## Task 8: EntryEditor — 新增 state 类型 UI

**Files:**
- Modify: `frontend/src/components/state/EntryEditor.jsx`

- [ ] **Step 1: 更新 EntryEditor.jsx 实现 state 类型完整 UI**

  完整替换 `frontend/src/components/state/EntryEditor.jsx` 内容为：

  ```jsx
  import { useState, useEffect } from 'react';
  import { createWorldEntry, updateWorldEntry, getEntryConditions, replaceEntryConditions } from '../../api/prompt-entries';
  import { listWorldStateFields } from '../../api/world-state-fields';
  import { listCharacterStateFields } from '../../api/character-state-fields';
  import { listPersonaStateFields } from '../../api/persona-state-fields';
  import MarkdownEditor from '../ui/MarkdownEditor';
  import Select from '../ui/Select';

  const POSITION_OPTIONS = [
    { value: 'system', label: '系统提示词' },
    { value: 'post', label: '后置提示词' },
  ];

  const NUMERIC_TYPES = new Set(['number', 'integer', 'float']);
  const NUMERIC_OPS = [
    { value: '>', label: '>' },
    { value: '<', label: '<' },
    { value: '=', label: '=' },
    { value: '>=', label: '>=' },
    { value: '<=', label: '<=' },
    { value: '!=', label: '!=' },
  ];
  const TEXT_OPS = [
    { value: '包含', label: '包含' },
    { value: '等于', label: '等于' },
    { value: '不包含', label: '不包含' },
  ];

  function emptyCondition() {
    return { target_field: '', operator: '>', value: '' };
  }

  function getOpsForField(targetField, fieldTypeMap) {
    const type = fieldTypeMap.get(targetField);
    if (!type) return [...NUMERIC_OPS, ...TEXT_OPS];
    return NUMERIC_TYPES.has(type) ? NUMERIC_OPS : TEXT_OPS;
  }

  export default function EntryEditor({ worldId, entry, defaultTriggerType, onClose, onSave }) {
    const isNew = !entry?.id;
    const [form, setForm] = useState({
      title: entry?.title ?? '',
      content: entry?.content ?? '',
      description: entry?.description ?? '',
      keywords: entry?.keywords ? entry.keywords.join(', ') : '',
      position: entry?.position ?? 'system',
      trigger_type: entry?.trigger_type ?? defaultTriggerType ?? 'always',
    });
    const [saving, setSaving] = useState(false);

    // state 类型专用
    const [conditions, setConditions] = useState([emptyCondition()]);
    const [fieldOptions, setFieldOptions] = useState([]);
    const [fieldTypeMap, setFieldTypeMap] = useState(new Map());

    // 当 trigger_type 切换为 state 时，加载字段选项 + 已有条件
    useEffect(() => {
      if (form.trigger_type !== 'state') return;
      async function load() {
        try {
          const [worldFields, charFields, personaFields] = await Promise.all([
            listWorldStateFields(worldId),
            listCharacterStateFields(worldId),
            listPersonaStateFields(worldId),
          ]);
          const opts = [];
          const typeMap = new Map();
          for (const f of worldFields) {
            const key = `世界.${f.label}`;
            opts.push({ value: key, label: key });
            typeMap.set(key, f.type);
          }
          for (const f of personaFields) {
            const key = `玩家.${f.label}`;
            opts.push({ value: key, label: key });
            typeMap.set(key, f.type);
          }
          for (const f of charFields) {
            const key = `角色.${f.label}`;
            opts.push({ value: key, label: key });
            typeMap.set(key, f.type);
          }
          setFieldOptions(opts);
          setFieldTypeMap(typeMap);

          if (!isNew && entry?.trigger_type === 'state') {
            const conds = await getEntryConditions(entry.id);
            setConditions(conds.length > 0 ? conds.map((c) => ({ ...c })) : [emptyCondition()]);
          } else {
            setConditions([emptyCondition()]);
          }
        } catch (err) {
          console.error('加载状态字段失败', err);
        }
      }
      load();
    }, [form.trigger_type]);

    function updateCondition(index, patch) {
      setConditions((prev) => prev.map((c, i) => {
        if (i !== index) return c;
        const next = { ...c, ...patch };
        if (patch.target_field !== undefined) {
          const ops = getOpsForField(next.target_field, fieldTypeMap);
          next.operator = ops[0].value;
        }
        return next;
      }));
    }

    async function handleSave() {
      if (!form.title.trim()) return;
      setSaving(true);
      const data = {
        title: form.title.trim(),
        content: form.content,
        description: form.description,
        keywords: form.trigger_type === 'keyword'
          ? form.keywords.split(',').map((k) => k.trim()).filter(Boolean)
          : null,
        position: form.position,
        trigger_type: form.trigger_type,
      };
      try {
        let saved;
        if (isNew) {
          saved = await createWorldEntry(worldId, data);
        } else {
          saved = await updateWorldEntry(entry.id, data);
        }
        if (form.trigger_type === 'state') {
          const entryId = isNew ? saved.id : entry.id;
          const validConditions = conditions.filter((c) => c.target_field && c.value);
          await replaceEntryConditions(entryId, validConditions);
        }
        onSave();
      } catch (err) {
        alert(`保存失败：${err.message}`);
      } finally {
        setSaving(false);
      }
    }

    return (
      <div className="we-entry-editor-overlay" onClick={onClose}>
        <div className="we-entry-editor-panel" onClick={(e) => e.stopPropagation()}>
          <h3 className="we-entry-editor-title">
            {isNew ? '新建条目' : '编辑条目'}
          </h3>

          {/* 标题 */}
          <label className="we-entry-editor-label">标题</label>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="we-entry-editor-field we-entry-editor-field-mb"
          />

          {/* 内容 */}
          <label className="we-entry-editor-label">内容</label>
          <div className="we-entry-editor-content-wrap">
            <MarkdownEditor
              value={form.content}
              onChange={(md) => setForm((f) => ({ ...f, content: md }))}
              placeholder="条目内容…"
              minHeight={120}
            />
          </div>

          {/* 关键词（仅 keyword 类型） */}
          {form.trigger_type === 'keyword' && (
            <>
              <label className="we-entry-editor-label">触发关键词（逗号分隔）</label>
              <input
                value={form.keywords}
                onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
                placeholder="如：暗影帮, 影堂, 黑市"
                className="we-entry-editor-field we-entry-editor-field-mb"
              />
            </>
          )}

          {/* 触发描述（仅 llm 类型） */}
          {form.trigger_type === 'llm' && (
            <>
              <label className="we-entry-editor-label">触发条件描述（供 AI 判断）</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="we-entry-editor-field we-entry-editor-field-mb we-entry-editor-field--resizable"
              />
            </>
          )}

          {/* 状态条件（仅 state 类型） */}
          {form.trigger_type === 'state' && (
            <>
              <label className="we-entry-editor-label">状态条件（全部满足时注入）</label>
              {conditions.map((cond, i) => {
                const ops = getOpsForField(cond.target_field, fieldTypeMap);
                return (
                  <div key={i} className="we-trigger-editor-condition">
                    <div className="we-trigger-editor-condition-field">
                      <Select
                        value={cond.target_field}
                        onChange={(v) => updateCondition(i, { target_field: v })}
                        options={fieldOptions}
                        disabled={fieldOptions.length === 0}
                      />
                    </div>
                    <div className="we-trigger-editor-condition-op">
                      <Select
                        value={cond.operator}
                        onChange={(v) => updateCondition(i, { operator: v })}
                        options={ops}
                      />
                    </div>
                    <input
                      value={cond.value}
                      onChange={(e) => updateCondition(i, { value: e.target.value })}
                      placeholder="值"
                      className="we-trigger-editor-field we-trigger-editor-condition-value"
                    />
                    <button
                      onClick={() => setConditions((prev) => prev.filter((_, idx) => idx !== i))}
                      className="we-trigger-editor-icon-btn we-trigger-editor-icon-btn--danger"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              <button
                onClick={() => setConditions((prev) => [...prev, emptyCondition()])}
                className="we-trigger-editor-link-btn"
              >
                + 添加条件
              </button>
            </>
          )}

          {/* 注入位置 */}
          <label className="we-entry-editor-label">注入位置</label>
          <select
            value={form.position}
            onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
            className="we-entry-editor-select"
          >
            {POSITION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* 按钮 */}
          <div className="we-entry-editor-footer">
            <button onClick={onClose} className="we-entry-editor-cancel">取消</button>
            <button
              onClick={handleSave}
              disabled={saving || !form.title.trim()}
              className="we-entry-editor-save"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add frontend/src/components/state/EntryEditor.jsx
  git commit -m "feat: EntryEditor 新增 state 类型条件编辑 UI"
  ```

---

## Task 9: WorldConfigPage — 替换触发器面板为状态条目区块

**Files:**
- Modify: `frontend/src/pages/WorldConfigPage.jsx`
- Delete: `frontend/src/components/state/TriggerEditor.jsx`, `frontend/src/components/state/TriggerCard.jsx`

- [ ] **Step 1: 删除 TriggerEditor.jsx 和 TriggerCard.jsx**

  ```bash
  rm frontend/src/components/state/TriggerEditor.jsx
  rm frontend/src/components/state/TriggerCard.jsx
  ```

- [ ] **Step 2: 更新 WorldConfigPage.jsx**

  完整替换 `frontend/src/pages/WorldConfigPage.jsx` 内容为（保留现有四栏 grid 结构，将第4列由触发器改为状态条目）：

  ```jsx
  import { useState, useEffect } from 'react';
  import { useParams, useNavigate } from 'react-router-dom';
  import { listWorldEntries } from '../api/prompt-entries';
  import EntrySection from '../components/state/EntrySection';
  import { BackButton } from '../components';

  export default function WorldConfigPage() {
    const { worldId } = useParams();
    const navigate = useNavigate();
    const [entries, setEntries] = useState([]);

    useEffect(() => {
      listWorldEntries(worldId).then(setEntries).catch(() => {});
    }, [worldId]);

    function refresh() {
      listWorldEntries(worldId).then(setEntries).catch(() => {});
    }

    const alwaysEntries  = entries.filter((e) => e.trigger_type === 'always');
    const keywordEntries = entries.filter((e) => e.trigger_type === 'keyword');
    const llmEntries     = entries.filter((e) => e.trigger_type === 'llm');
    const stateEntries   = entries.filter((e) => e.trigger_type === 'state');

    return (
      <div className="we-characters-canvas">
        <BackButton onClick={() => navigate('/')} label="所有世界" />

        <div className="we-config-grid">
          {/* 第1列：常驻条目 */}
          <div className="we-config-col">
            <EntrySection
              title="常驻条目"
              icon="❦"
              desc="始终注入"
              triggerType="always"
              entries={alwaysEntries}
              worldId={worldId}
              onRefresh={refresh}
            />
          </div>

          {/* 第2列：关键词条目 */}
          <div className="we-config-col">
            <EntrySection
              title="关键词触发条目"
              icon="❦"
              desc="对话中出现指定词语时自动注入"
              triggerType="keyword"
              entries={keywordEntries}
              worldId={worldId}
              onRefresh={refresh}
            />
          </div>

          {/* 第3列：AI召回条目 */}
          <div className="we-config-col">
            <EntrySection
              title="AI 召回条目"
              icon="❦"
              desc="由 AI 判断当前情境是否需要注入"
              triggerType="llm"
              entries={llmEntries}
              worldId={worldId}
              onRefresh={refresh}
            />
          </div>

          {/* 第4列：状态条件条目（替换旧触发器列） */}
          <div className="we-config-col">
            <EntrySection
              title="状态条件条目"
              icon="❦"
              desc="当状态字段满足设定条件时自动注入"
              triggerType="state"
              entries={stateEntries}
              worldId={worldId}
              onRefresh={refresh}
            />
          </div>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/pages/WorldConfigPage.jsx
  git rm frontend/src/components/state/TriggerEditor.jsx frontend/src/components/state/TriggerCard.jsx
  git commit -m "feat: WorldConfigPage 替换触发器面板为状态条目区块，删除旧组件"
  ```

---

## Task 10: 文档同步

**Files:**
- Modify: `SCHEMA.md`
- Modify: `ARCHITECTURE.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 更新 SCHEMA.md**

  1. 删除 `triggers` / `trigger_conditions` / `trigger_actions` 三表的文档描述
  2. 新增 `entry_conditions` 表文档（结构、字段、级联删除说明）
  3. 将 `world_prompt_entries.trigger_type` 可选值更新为 4 种：`always` / `keyword` / `llm` / `state`
  4. 删除策略中移除"删除触发器 → 级联删除..."条目

- [ ] **Step 2: 更新 ARCHITECTURE.md**

  1. 更新 §4 assembler [7] 段注释：说明 matchEntries 支持第四类 state 分支
  2. 删除 trigger-evaluator 相关章节描述（如有）
  3. 更新 entry-matcher.js 的功能说明（增加 state 分支描述）

- [ ] **Step 3: 追加 CHANGELOG.md 记录**

  在 CHANGELOG.md 末尾追加一条记录，包含：
  - 废除触发器三表（triggers / trigger_conditions / trigger_actions）的决策
  - 新增 state 类型条目的设计意图
  - 评估时机变化：由"对话后异步"改为"提示词组装时同步"
  - 迁移注意：旧触发器数据不迁移

- [ ] **Step 4: Commit**

  ```bash
  git add SCHEMA.md ARCHITECTURE.md CHANGELOG.md
  git commit -m "docs: 同步 SCHEMA/ARCHITECTURE/CHANGELOG — 状态条目替换触发器系统"
  ```

---

## 验证清单

完成所有任务后，按以下步骤整体验证：

1. **后端单元测试**：
   ```bash
   cd backend && node --test tests/db/queries/entry-conditions.test.js tests/prompts/entry-matcher.test.js tests/prompts/assembler.test.js
   ```
   预期：全部通过，无 trigger 相关残留用例。

2. **服务器启动**：
   ```bash
   cd backend && npm run dev
   ```
   预期：无 import 报错，`triggers.js` 路由不再注册。

3. **前端启动**：
   ```bash
   cd frontend && npm run dev
   ```
   预期：无编译报错，无 TriggerEditor/TriggerCard 引用。

4. **功能验证**：
   - 打开 WorldConfigPage → 看到 4 个区块（常驻/关键词/AI召回/状态条件）
   - 在状态条目区块新建条目，选 state 类型 → 条件编辑 UI 出现
   - 添加条件（如 `世界.体力 < 30`），保存 → 发一条消息 → 检查日志中 entry-matcher 命中日志

5. **旧触发器清理**：
   - 数据库中 `triggers` / `trigger_conditions` / `trigger_actions` 表不再存在
   - 运行 `cd backend && node -e "import('./db/index.js').then(m => { const rows = m.default.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name='triggers'\").all(); console.log(rows); })"`
   - 预期：`[]`（空数组）
