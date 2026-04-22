# State 引擎 Phase 1 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现触发器系统，让世界和角色的状态字段满足条件时自动激活 Prompt 条目、注入提示词或发送通知。

**Architecture:** 新增三张表（triggers/trigger_conditions/trigger_actions）存储触发器定义；每轮 AI 回复结束、状态更新完成后同步评估触发器；`world_prompt_entries` 新增 `position`（注入位置）和 `trigger_type`（激活方式）字段，State 页统一管理。前端新增世界详情三标签导航和 State 管理页面。

**Tech Stack:** Node.js + Express + better-sqlite3（后端）；React 18 + TailwindCSS + Zustand（前端）；CSS 变量 `--we-*`；framer-motion（动效）

**设计文档:** `docs/superpowers/specs/2026-04-22-state-engine-phase1-design.md`

---

## 文件结构

**新建文件：**
- `backend/db/queries/triggers.js` — triggers/trigger_conditions/trigger_actions CRUD
- `backend/services/trigger-evaluator.js` — 状态收集 + 条件评估 + 动作执行
- `backend/routes/triggers.js` — HTTP CRUD 路由
- `backend/tests/services/trigger-evaluator.test.js` — 评估引擎单元测试
- `backend/tests/db/queries/triggers.test.js` — 查询层测试
- `frontend/src/api/triggers.js` — 前端 HTTP 封装
- `frontend/src/pages/WorldStatePage.jsx` — State 标签页（四分区）
- `frontend/src/components/state/TriggerCard.jsx` — 触发器卡片
- `frontend/src/components/state/TriggerEditor.jsx` — 触发器编辑弹窗
- `frontend/src/components/state/EntrySection.jsx` — 条目分区组件（常驻/关键词/AI召回）
- `frontend/src/components/state/EntryEditor.jsx` — 条目编辑弹窗（含位置选择）

**修改文件：**
- `backend/db/schema.js` — 新增三表 + `position`/`trigger_type` 字段
- `backend/db/queries/prompt-entries.js` — 支持 `position`/`trigger_type`
- `backend/services/prompt-entries.js` — 透传新字段
- `backend/routes/prompt-entries.js` — 接收新字段
- `backend/prompts/assembler.js` — 按 position 注入条目 + inject_prompt 支持
- `backend/prompts/entry-matcher.js` — 按 trigger_type 分流匹配逻辑
- `backend/routes/chat.js` — buildChatTaskSpecs 加触发器评估
- `backend/routes/writing.js` — taskSpecs 加触发器评估
- `backend/server.js` — 注册 triggers 路由
- `frontend/src/App.jsx` — 新增 WorldStatePage 路由
- `frontend/src/pages/CharactersPage.jsx` — 加三标签导航
- `frontend/src/api/prompt-entries.js` — 支持 position/trigger_type
- `SCHEMA.md` — 文档同步

---

## Task 1: DB Schema — 新表 + 字段

**Files:**
- Modify: `backend/db/schema.js`

- [ ] **Step 1: 阅读现有 schema.js**

  运行：`head -80 backend/db/schema.js` 确认末尾表结构，找到最后一个 `CREATE TABLE IF NOT EXISTS` 块。

- [ ] **Step 2: 追加三张新表定义到 schema.js 的 TABLES 字符串末尾（在最后一个分号前）**

```js
// 在 schema.js 的 TABLES 字符串末尾追加（internal_meta 之后）：

CREATE TABLE IF NOT EXISTS triggers (
  id                    TEXT PRIMARY KEY,
  world_id              TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  enabled               INTEGER NOT NULL DEFAULT 1,
  one_shot              INTEGER NOT NULL DEFAULT 0,
  last_triggered_round  INTEGER,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_triggers_world_id ON triggers(world_id);

CREATE TABLE IF NOT EXISTS trigger_conditions (
  id            TEXT PRIMARY KEY,
  trigger_id    TEXT NOT NULL REFERENCES triggers(id) ON DELETE CASCADE,
  target_field  TEXT NOT NULL,
  operator      TEXT NOT NULL,
  value         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trigger_conditions_trigger_id ON trigger_conditions(trigger_id);

CREATE TABLE IF NOT EXISTS trigger_actions (
  id          TEXT PRIMARY KEY,
  trigger_id  TEXT NOT NULL UNIQUE REFERENCES triggers(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  params      TEXT NOT NULL DEFAULT '{}'
);
```

- [ ] **Step 3: 追加 `position` 和 `trigger_type` 列迁移到 schema.js 的 MIGRATIONS 字符串（或 initDb 函数中）**

  先阅读 schema.js 中现有迁移的写法模式，然后追加：

```js
// 追加到现有 ALTER TABLE 迁移块中（参照已有迁移格式）：
try { db.prepare("ALTER TABLE world_prompt_entries ADD COLUMN position TEXT NOT NULL DEFAULT 'post'").run(); } catch (_) {}
try { db.prepare("ALTER TABLE world_prompt_entries ADD COLUMN trigger_type TEXT NOT NULL DEFAULT 'always'").run(); } catch (_) {}
```

- [ ] **Step 4: 为现有条目执行一次性数据迁移（迁移 trigger_type）**

  在 `initDb()` 函数中，在上述 ALTER 之后追加：

```js
// 仅当 migration 未执行时运行（internal_meta 模式）
const migKey = 'migration:trigger_type_initial';
const already = db.prepare("SELECT value FROM internal_meta WHERE key = ?").get(migKey);
if (!already) {
  db.prepare(`
    UPDATE world_prompt_entries SET trigger_type = 'keyword'
    WHERE keywords IS NOT NULL AND keywords != 'null' AND keywords != '[]'
  `).run();
  db.prepare(`
    UPDATE world_prompt_entries SET trigger_type = 'llm'
    WHERE (keywords IS NULL OR keywords = 'null' OR keywords = '[]')
      AND description IS NOT NULL AND TRIM(description) != ''
      AND trigger_type = 'always'
  `).run();
  db.prepare("INSERT OR REPLACE INTO internal_meta (key, value, updated_at) VALUES (?, '1', ?)").run(migKey, Date.now());
}
```

- [ ] **Step 5: 重启后端，确认无启动报错**

```bash
cd backend && npm run dev 2>&1 | head -20
```

  预期：无 `SQLITE_ERROR` 或 `already exists` 之外的错误。

- [ ] **Step 6: Commit**

```bash
git add backend/db/schema.js
git commit -m "feat: DB schema — triggers tables + position/trigger_type on world_prompt_entries"
```

---

## Task 2: 后端查询层 — triggers CRUD

**Files:**
- Create: `backend/db/queries/triggers.js`
- Create: `backend/tests/db/queries/triggers.test.js`

- [ ] **Step 1: 写失败测试**

  创建 `backend/tests/db/queries/triggers.test.js`：

```js
import { describe, test, expect, beforeEach } from 'vitest';
import { freshImport } from '../helpers/test-env.js';
import { createTestDb, createWorld } from '../helpers/fixtures.js';

describe('triggers queries', () => {
  let queries;
  beforeEach(async () => {
    createTestDb();
    queries = await freshImport('backend/db/queries/triggers.js');
  });

  test('createTrigger 返回完整记录', () => {
    const world = createWorld();
    const t = queries.createTrigger({ world_id: world.id, name: '测试触发器' });
    expect(t.id).toBeTruthy();
    expect(t.name).toBe('测试触发器');
    expect(t.enabled).toBe(1);
    expect(t.one_shot).toBe(0);
  });

  test('listTriggersByWorld 按世界过滤', () => {
    const world = createWorld();
    queries.createTrigger({ world_id: world.id, name: 'A' });
    queries.createTrigger({ world_id: world.id, name: 'B' });
    const list = queries.listTriggersByWorld(world.id);
    expect(list).toHaveLength(2);
  });

  test('replaceTriggerConditions 替换已有条件', () => {
    const world = createWorld();
    const t = queries.createTrigger({ world_id: world.id, name: 'T' });
    queries.replaceTriggerConditions(t.id, [
      { target_field: '凛.好感度', operator: '>', value: '50' },
      { target_field: '世界.戒严等级', operator: '<', value: '4' },
    ]);
    const conds = queries.listConditionsByTrigger(t.id);
    expect(conds).toHaveLength(2);
    expect(conds[0].operator).toBe('>');
  });

  test('upsertTriggerAction 保存动作', () => {
    const world = createWorld();
    const t = queries.createTrigger({ world_id: world.id, name: 'T' });
    queries.upsertTriggerAction(t.id, 'notify', { text: '触发了！' });
    const action = queries.getActionByTriggerId(t.id);
    expect(action.action_type).toBe('notify');
    const params = JSON.parse(action.params);
    expect(params.text).toBe('触发了！');
  });

  test('updateTrigger 修改 enabled/one_shot', () => {
    const world = createWorld();
    const t = queries.createTrigger({ world_id: world.id, name: 'T' });
    const updated = queries.updateTrigger(t.id, { enabled: 0, one_shot: 1 });
    expect(updated.enabled).toBe(0);
    expect(updated.one_shot).toBe(1);
  });

  test('deleteTrigger 级联删除条件和动作', () => {
    const world = createWorld();
    const t = queries.createTrigger({ world_id: world.id, name: 'T' });
    queries.replaceTriggerConditions(t.id, [{ target_field: 'x.y', operator: '>', value: '1' }]);
    queries.upsertTriggerAction(t.id, 'notify', { text: 'hi' });
    queries.deleteTrigger(t.id);
    expect(queries.getTriggerById(t.id)).toBeUndefined();
    expect(queries.listConditionsByTrigger(t.id)).toHaveLength(0);
    expect(queries.getActionByTriggerId(t.id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd backend && npx vitest run tests/db/queries/triggers.test.js 2>&1 | tail -10
```

  预期：`Cannot find module 'backend/db/queries/triggers.js'`

- [ ] **Step 3: 实现 backend/db/queries/triggers.js**

```js
import crypto from 'node:crypto';
import db from '../index.js';

// ─── triggers ───────────────────────────────────────────────────────

export function createTrigger(data) {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(`
    INSERT INTO triggers (id, world_id, name, enabled, one_shot, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.world_id, data.name, data.enabled ?? 1, data.one_shot ?? 0, now, now);
  return getTriggerById(id);
}

export function getTriggerById(id) {
  return db.prepare('SELECT * FROM triggers WHERE id = ?').get(id);
}

export function listTriggersByWorld(worldId) {
  return db.prepare('SELECT * FROM triggers WHERE world_id = ? ORDER BY created_at ASC').all(worldId);
}

export function updateTrigger(id, patch) {
  const allowed = ['name', 'enabled', 'one_shot', 'last_triggered_round'];
  const sets = [];
  const values = [];
  for (const field of allowed) {
    if (field in patch) { sets.push(`${field} = ?`); values.push(patch[field]); }
  }
  if (sets.length === 0) return getTriggerById(id);
  sets.push('updated_at = ?');
  values.push(Date.now(), id);
  db.prepare(`UPDATE triggers SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getTriggerById(id);
}

export function deleteTrigger(id) {
  return db.prepare('DELETE FROM triggers WHERE id = ?').run(id);
}

// ─── trigger_conditions ─────────────────────────────────────────────

export function replaceTriggerConditions(triggerId, conditions) {
  db.transaction(() => {
    db.prepare('DELETE FROM trigger_conditions WHERE trigger_id = ?').run(triggerId);
    const stmt = db.prepare(
      'INSERT INTO trigger_conditions (id, trigger_id, target_field, operator, value) VALUES (?, ?, ?, ?, ?)'
    );
    for (const c of conditions) {
      stmt.run(crypto.randomUUID(), triggerId, c.target_field, c.operator, c.value);
    }
  })();
}

export function listConditionsByTrigger(triggerId) {
  return db.prepare('SELECT * FROM trigger_conditions WHERE trigger_id = ?').all(triggerId);
}

// ─── trigger_actions ────────────────────────────────────────────────

export function upsertTriggerAction(triggerId, actionType, params) {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO trigger_actions (id, trigger_id, action_type, params)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(trigger_id) DO UPDATE SET action_type = excluded.action_type, params = excluded.params
  `).run(id, triggerId, actionType, JSON.stringify(params));
  return getActionByTriggerId(triggerId);
}

export function getActionByTriggerId(triggerId) {
  return db.prepare('SELECT * FROM trigger_actions WHERE trigger_id = ?').get(triggerId);
}

export function updateActionParams(triggerId, paramsPatch) {
  const existing = getActionByTriggerId(triggerId);
  if (!existing) return null;
  const currentParams = JSON.parse(existing.params || '{}');
  const merged = { ...currentParams, ...paramsPatch };
  db.prepare('UPDATE trigger_actions SET params = ? WHERE trigger_id = ?').run(JSON.stringify(merged), triggerId);
  return getActionByTriggerId(triggerId);
}

// ─── 专用查询：查找有 inject_prompt 动作且 rounds_remaining > 0 的触发器动作 ─

export function getActiveInjectPromptActions(worldId) {
  return db.prepare(`
    SELECT ta.*, t.world_id
    FROM trigger_actions ta
    JOIN triggers t ON t.id = ta.trigger_id
    WHERE t.world_id = ? AND t.enabled = 1
      AND ta.action_type = 'inject_prompt'
  `).all(worldId).filter((row) => {
    const p = JSON.parse(row.params || '{}');
    if (p.mode === 'persistent') return true;
    return typeof p.rounds_remaining === 'number' && p.rounds_remaining > 0;
  });
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd backend && npx vitest run tests/db/queries/triggers.test.js 2>&1 | tail -15
```

  预期：`✓ 所有测试通过`

- [ ] **Step 5: Commit**

```bash
git add backend/db/queries/triggers.js backend/tests/db/queries/triggers.test.js
git commit -m "feat: triggers CRUD queries"
```

---

## Task 3: 后端查询层 — prompt_entries 支持 position/trigger_type

**Files:**
- Modify: `backend/db/queries/prompt-entries.js`

- [ ] **Step 1: 阅读现有 createWorldEntry 和 updateWorldEntry 函数**

  阅读 `backend/db/queries/prompt-entries.js` 第 117-183 行，确认现有字段列表。

- [ ] **Step 2: 修改 createWorldEntry — 加入 position 和 trigger_type**

  将 `createWorldEntry` 中的 INSERT 语句和字段列表修改如下：

```js
export function createWorldEntry(data) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const maxRow = db.prepare('SELECT MAX(sort_order) AS m FROM world_prompt_entries WHERE world_id = ?').get(data.world_id);
  const sortOrder = data.sort_order ?? ((maxRow?.m ?? -1) + 1);

  db.prepare(`
    INSERT INTO world_prompt_entries
      (id, world_id, title, description, content, keywords, keyword_scope, position, trigger_type, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.world_id,
    data.title,
    data.description ?? '',
    data.content ?? '',
    data.keywords != null ? JSON.stringify(data.keywords) : null,
    normalizeKeywordScopeValue(data.keyword_scope),
    data.position ?? 'post',
    data.trigger_type ?? 'always',
    sortOrder,
    now,
    now,
  );
  return getWorldEntryById(id);
}
```

- [ ] **Step 3: 修改 updateWorldEntry — 允许更新 position 和 trigger_type**

  将 `allowed` 数组扩展：

```js
const allowed = ['title', 'description', 'content', 'keywords', 'keyword_scope', 'position', 'trigger_type', 'sort_order'];
```

- [ ] **Step 4: Commit**

```bash
git add backend/db/queries/prompt-entries.js
git commit -m "feat: prompt_entries 支持 position 和 trigger_type 字段"
```

---

## Task 4: 后端 service + route — prompt_entries 透传新字段

**Files:**
- Modify: `backend/services/prompt-entries.js`
- Modify: `backend/routes/prompt-entries.js`

- [ ] **Step 1: 阅读 backend/services/prompt-entries.js 中 createWorldPromptEntry 函数**

  确认 service 层如何从 route 层接收参数并传给 query 层。

- [ ] **Step 2: 修改 service — 透传 position 和 trigger_type**

  在 `createWorldPromptEntry` 和 `updateWorldPromptEntry` 函数中，确保 `position` 和 `trigger_type` 字段从 `data` 透传到 query 层（通常只需确认 data 整体传递，无需额外修改；如有字段白名单则加入这两个字段）。

- [ ] **Step 3: 修改 route — 接收 position 和 trigger_type**

  在 `backend/routes/prompt-entries.js` 的 world entries 路由中：

```js
// POST /api/worlds/:worldId/entries
router.post('/worlds/:worldId/entries', (req, res) => {
  const { title, description, content, keywords, keyword_scope, position, trigger_type, sort_order } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const entry = createWorldPromptEntry(req.params.worldId, {
    title, description, content, keywords, keyword_scope, position, trigger_type, sort_order,
  });
  res.status(201).json(entry);
});
```

  同样修改对应的 PUT 路由（update）接收这两个字段。

- [ ] **Step 4: Commit**

```bash
git add backend/services/prompt-entries.js backend/routes/prompt-entries.js
git commit -m "feat: prompt-entries service/route 透传 position/trigger_type"
```

---

## Task 5: 后端服务 — 触发器评估引擎

**Files:**
- Create: `backend/services/trigger-evaluator.js`
- Create: `backend/tests/services/trigger-evaluator.test.js`

- [ ] **Step 1: 写失败测试**

```js
// backend/tests/services/trigger-evaluator.test.js
import { describe, test, expect, beforeEach } from 'vitest';
import { freshImport } from '../helpers/test-env.js';
import { createTestDb, createWorld } from '../helpers/fixtures.js';

describe('trigger-evaluator', () => {
  let evaluator;
  beforeEach(async () => {
    createTestDb();
    evaluator = await freshImport('backend/services/trigger-evaluator.js');
  });

  describe('evaluateCondition', () => {
    const { evaluateCondition } = evaluator;

    test('数值 > 比较', () => {
      expect(evaluator.evaluateCondition(
        { target_field: '凛.好感度', operator: '>', value: '50' },
        new Map([['凛.好感度', '60']])
      )).toBe(true);
    });

    test('数值 <= 比较', () => {
      expect(evaluator.evaluateCondition(
        { target_field: '世界.戒严等级', operator: '<=', value: '4' },
        new Map([['世界.戒严等级', '4']])
      )).toBe(true);
    });

    test('数值 != 比较', () => {
      expect(evaluator.evaluateCondition(
        { target_field: '世界.戒严等级', operator: '!=', value: '5' },
        new Map([['世界.戒严等级', '3']])
      )).toBe(true);
    });

    test('文本 包含 比较', () => {
      expect(evaluator.evaluateCondition(
        { target_field: '玩家.状态', operator: '包含', value: '受伤' },
        new Map([['玩家.状态', '严重受伤']])
      )).toBe(true);
    });

    test('文本 等于 比较', () => {
      expect(evaluator.evaluateCondition(
        { target_field: '玩家.状态', operator: '等于', value: '正常' },
        new Map([['玩家.状态', '正常']])
      )).toBe(true);
    });

    test('字段不存在时返回 false', () => {
      expect(evaluator.evaluateCondition(
        { target_field: '不存在.字段', operator: '>', value: '0' },
        new Map()
      )).toBe(false);
    });
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
cd backend && npx vitest run tests/services/trigger-evaluator.test.js 2>&1 | tail -5
```

- [ ] **Step 3: 实现 backend/services/trigger-evaluator.js**

```js
/**
 * trigger-evaluator.js
 *
 * 对外：
 *   evaluateCondition(condition, stateMap) → boolean
 *   collectStateValues(worldId, sessionId)  → Map<"实体名.字段标签", string>
 *   evaluateTriggers(worldId, sessionId, roundIndex) → { notifications: Array }
 */

import {
  listTriggersByWorld,
  listConditionsByTrigger,
  getActionByTriggerId,
  updateTrigger,
  updateActionParams,
} from '../db/queries/triggers.js';
import { getWorldEntryById } from '../db/queries/prompt-entries.js';
import { updateWorldEntry } from '../db/queries/prompt-entries.js';
import {
  getSessionWorldStateValues,
  getSessionPersonaStateValues,
  getSessionCharacterStateValues,
} from '../db/queries/session-state-values.js';
import { getSessionById } from '../db/queries/sessions.js';
import { getWritingSessionCharacters } from '../db/queries/writing-sessions.js';
import { getCharacterById } from '../db/queries/characters.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('trigger-eval');

/**
 * 将数据库 effective_value_json 解析为可比较的字符串。
 * 数值字段返回数字字符串，文本字段返回字符串。
 */
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

/**
 * 收集当前会话所有状态字段的有效值。
 * Map key 格式：实体标签.字段标签（如 "凛.好感度"，"世界.戒严等级"，"玩家.体力"）
 */
export function collectStateValues(worldId, sessionId) {
  const map = new Map();

  // 世界状态
  const worldRows = getSessionWorldStateValues(sessionId, worldId);
  for (const row of worldRows) {
    const v = parseEffectiveValue(row.effective_value_json);
    if (v !== null) map.set(`世界.${row.label}`, v);
  }

  // 玩家状态
  const personaRows = getSessionPersonaStateValues(sessionId, worldId);
  for (const row of personaRows) {
    const v = parseEffectiveValue(row.effective_value_json);
    if (v !== null) map.set(`玩家.${row.label}`, v);
  }

  // 角色状态（chat 会话单角色；writing 会话多角色）
  const session = getSessionById(sessionId);
  let characterIds = [];
  if (session?.character_id) {
    characterIds = [session.character_id];
  } else if (session?.mode === 'writing') {
    characterIds = getWritingSessionCharacters(sessionId).map((c) => c.id);
  }

  if (characterIds.length > 0) {
    const charRows = getSessionCharacterStateValues(sessionId, worldId, characterIds);
    for (const row of charRows) {
      const char = getCharacterById(row.character_id);
      if (!char) continue;
      const v = parseEffectiveValue(row.effective_value_json);
      if (v !== null) map.set(`${char.name}.${row.label}`, v);
    }
  }

  return map;
}

/**
 * 评估单个条件。
 * @param {{ target_field, operator, value }} condition
 * @param {Map<string, string>} stateMap
 * @returns {boolean}
 */
export function evaluateCondition(condition, stateMap) {
  const currentRaw = stateMap.get(condition.target_field);
  if (currentRaw == null) return false;

  const { operator, value: condValue } = condition;

  // 文本操作符
  if (operator === '包含') return currentRaw.includes(condValue);
  if (operator === '等于') return currentRaw === condValue;
  if (operator === '不包含') return !currentRaw.includes(condValue);

  // 数值操作符
  const current = parseFloat(currentRaw);
  const target = parseFloat(condValue);
  if (isNaN(current) || isNaN(target)) return false;

  if (operator === '>') return current > target;
  if (operator === '<') return current < target;
  if (operator === '=') return current === target;
  if (operator === '>=') return current >= target;
  if (operator === '<=') return current <= target;
  if (operator === '!=') return current !== target;

  return false;
}

/**
 * 评估所有触发器，执行满足条件的动作。
 * @param {string} worldId
 * @param {string} sessionId
 * @param {number} roundIndex  当前轮次序号
 * @returns {{ notifications: Array<{ name: string, text: string }> }}
 */
export function evaluateTriggers(worldId, sessionId, roundIndex) {
  const triggers = listTriggersByWorld(worldId).filter((t) => t.enabled);
  if (triggers.length === 0) return { notifications: [] };

  const stateMap = collectStateValues(worldId, sessionId);
  const notifications = [];

  for (const trigger of triggers) {
    const conditions = listConditionsByTrigger(trigger.id);
    const allMet = conditions.length > 0 && conditions.every((c) => evaluateCondition(c, stateMap));
    if (!allMet) continue;

    log.info(`触发器命中: "${trigger.name}" (session=${sessionId.slice(0,8)} round=${roundIndex})`);

    const action = getActionByTriggerId(trigger.id);
    if (action) {
      executeAction(action, trigger, roundIndex, notifications);
    }

    // 更新 last_triggered_round
    updateTrigger(trigger.id, { last_triggered_round: roundIndex });

    // one_shot: 触发后禁用
    if (trigger.one_shot) {
      updateTrigger(trigger.id, { enabled: 0 });
    }
  }

  return { notifications };
}

function executeAction(action, trigger, roundIndex, notifications) {
  const params = JSON.parse(action.params || '{}');

  switch (action.action_type) {
    case 'activate_entry': {
      if (params.entry_id) {
        const entry = getWorldEntryById(params.entry_id);
        if (entry) {
          // world_prompt_entries 没有 enabled 字段；activate_entry 改为添加 trigger_type='always' + 手动启用标记
          // 实际上：直接将 trigger_type 置为 'always' 并不改变激活状态，
          // activate_entry 的语义是：将目标条目 trigger_type 设为 'always'（常驻），
          // 用户在 State 页可以看到它已被激活。
          // 注：world_prompt_entries 无 enabled 字段，"激活"=切换为常驻类型
          updateWorldEntry(entry.id, { trigger_type: 'always' });
          log.info(`activate_entry: "${entry.title}" (trigger="${trigger.name}")`);
        }
      }
      break;
    }

    case 'inject_prompt': {
      if (params.mode === 'consumed' && typeof params.inject_rounds === 'number') {
        // 设置 rounds_remaining = inject_rounds（触发时重置）
        updateActionParams(trigger.id, { rounds_remaining: params.inject_rounds });
      }
      // persistent: 不需要额外操作，assembler 在每次组装时检查
      log.info(`inject_prompt: mode=${params.mode} (trigger="${trigger.name}")`);
      break;
    }

    case 'notify': {
      if (params.text) {
        notifications.push({ name: trigger.name, text: params.text });
        log.info(`notify: "${params.text}" (trigger="${trigger.name}")`);
      }
      break;
    }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd backend && npx vitest run tests/services/trigger-evaluator.test.js 2>&1 | tail -15
```

  预期：`✓ 所有 evaluateCondition 测试通过`

- [ ] **Step 5: Commit**

```bash
git add backend/services/trigger-evaluator.js backend/tests/services/trigger-evaluator.test.js
git commit -m "feat: trigger evaluation engine — collectStateValues + evaluateCondition + evaluateTriggers"
```

---

## Task 6: 后端路由 — triggers

**Files:**
- Create: `backend/routes/triggers.js`
- Modify: `backend/server.js`

- [ ] **Step 1: 创建 backend/routes/triggers.js**

```js
import { Router } from 'express';
import {
  createTrigger,
  getTriggerById,
  listTriggersByWorld,
  updateTrigger,
  deleteTrigger,
  replaceTriggerConditions,
  listConditionsByTrigger,
  upsertTriggerAction,
  getActionByTriggerId,
} from '../db/queries/triggers.js';
import { assertExists } from '../utils/route-helpers.js';

const router = Router();

// GET /api/worlds/:worldId/triggers
router.get('/worlds/:worldId/triggers', (req, res) => {
  const list = listTriggersByWorld(req.params.worldId);
  const enriched = list.map((t) => ({
    ...t,
    conditions: listConditionsByTrigger(t.id),
    action: getActionByTriggerId(t.id) || null,
  }));
  res.json(enriched);
});

// POST /api/worlds/:worldId/triggers
router.post('/worlds/:worldId/triggers', (req, res) => {
  const { name, enabled, one_shot, conditions, action } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const trigger = createTrigger({ world_id: req.params.worldId, name, enabled, one_shot });
  if (Array.isArray(conditions)) replaceTriggerConditions(trigger.id, conditions);
  if (action?.action_type) upsertTriggerAction(trigger.id, action.action_type, action.params || {});
  res.status(201).json({
    ...trigger,
    conditions: listConditionsByTrigger(trigger.id),
    action: getActionByTriggerId(trigger.id) || null,
  });
});

// PUT /api/triggers/:id
router.put('/triggers/:id', (req, res) => {
  const trigger = getTriggerById(req.params.id);
  if (!assertExists(res, trigger, 'Trigger not found')) return;
  const { name, enabled, one_shot, conditions, action } = req.body;
  const updated = updateTrigger(req.params.id, { name, enabled, one_shot });
  if (Array.isArray(conditions)) replaceTriggerConditions(req.params.id, conditions);
  if (action?.action_type) upsertTriggerAction(req.params.id, action.action_type, action.params || {});
  res.json({
    ...updated,
    conditions: listConditionsByTrigger(req.params.id),
    action: getActionByTriggerId(req.params.id) || null,
  });
});

// DELETE /api/triggers/:id
router.delete('/triggers/:id', (req, res) => {
  const trigger = getTriggerById(req.params.id);
  if (!assertExists(res, trigger, 'Trigger not found')) return;
  deleteTrigger(req.params.id);
  res.json({ ok: true });
});

export default router;
```

- [ ] **Step 2: 在 server.js 注册路由**

  阅读 `backend/server.js`，找到其他路由的注册模式（如 `app.use('/api', xxxRouter)`），添加：

```js
import triggersRouter from './routes/triggers.js';
// ... 在其他路由注册之后：
app.use('/api', triggersRouter);
```

- [ ] **Step 3: 验证路由注册**

```bash
cd backend && curl -s http://localhost:3000/api/worlds/nonexistent/triggers
```

  预期：返回 `[]`（空数组，不报 404）

- [ ] **Step 4: Commit**

```bash
git add backend/routes/triggers.js backend/server.js
git commit -m "feat: triggers REST routes"
```

---

## Task 7: Assembler — 按 position 注入条目 + inject_prompt

**Files:**
- Modify: `backend/prompts/assembler.js`
- Modify: `backend/prompts/entry-matcher.js`

- [ ] **Step 1: 阅读 assembler.js 全文**

  重点看 [8-10] 条目注入逻辑（约第 210-230 行）和 [15] 后置提示词逻辑（约第 287-294 行）。

- [ ] **Step 2: 修改 entry-matcher.js — 按 trigger_type 分流**

  修改 `matchEntries` 函数：

```js
export async function matchEntries(sessionId, entries) {
  if (!entries || entries.length === 0) return new Set();

  // trigger_type='always' 的条目直接触发，不走 LLM/关键词
  const alwaysEntries = entries.filter((e) => e.trigger_type === 'always');
  const triggered = new Set(alwaysEntries.map((e) => e.id));

  // trigger_type='keyword' 的条目只走关键词匹配
  const keywordEntries = entries.filter((e) => e.trigger_type === 'keyword');
  // trigger_type='llm' 或无 trigger_type 的条目走 LLM preflight（向后兼容）
  const llmEntries = entries.filter((e) => !e.trigger_type || e.trigger_type === 'llm');

  const allMessages = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const lastUser = [...allMessages].reverse().find((m) => m.role === 'user');
  const lastAsst = [...allMessages].reverse().find((m) => m.role === 'assistant');
  const contextLines = [
    lastAsst ? `AI：${lastAsst.content}` : '',
    lastUser ? `用户：${lastUser.content}` : '',
  ].filter(Boolean).join('\n');

  const recentMessages = allMessages.slice(-PROMPT_ENTRY_SCAN_WINDOW);
  const userScanText = recentMessages.filter((m) => m.role === 'user').map((m) => m.content).join('\n').toLowerCase();
  const asstScanText = recentMessages.filter((m) => m.role === 'assistant').map((m) => m.content).join('\n').toLowerCase();

  // LLM preflight（llm 类型条目）
  const entriesWithDesc = llmEntries.filter((e) => e.description && e.description.trim());
  if (entriesWithDesc.length > 0 && contextLines) {
    const llmTriggered = await tryLlmMatch(entriesWithDesc, contextLines);
    for (const id of llmTriggered) triggered.add(id);
  }

  // 关键词匹配（keyword 类型）
  for (const entry of keywordEntries) {
    if (matchByKeywords(entry, userScanText, asstScanText)) triggered.add(entry.id);
  }

  // LLM 类型条目的关键词兜底
  for (const entry of llmEntries) {
    if (!triggered.has(entry.id) && matchByKeywords(entry, userScanText, asstScanText)) {
      triggered.add(entry.id);
    }
  }

  return triggered;
}
```

- [ ] **Step 3: 修改 assembler.js — 按 position 分配条目注入位置**

  在 `buildPrompt` 函数中，修改 [8-10] 条目注入逻辑：

```js
// [8-10] Prompt 条目：按 position 字段分配到 system 或 post
// ... （保留现有 triggeredIds 计算）

const systemEntryTexts = [];  // position='system' 的条目
const postEntryTexts = [];    // position='post' 的条目（默认）

for (const entry of allEntries) {
  if (triggeredIds.has(entry.id) && entry.content) {
    const text = `【${tv(entry.title)}】\n${tv(entry.content)}`;
    if (entry.position === 'system') {
      systemEntryTexts.push(text);
    } else {
      postEntryTexts.push(text);
    }
  }
}

// system 位置条目：追加到 systemParts（在 [7] 角色状态之后）
if (systemEntryTexts.length > 0) {
  systemParts.push(systemEntryTexts.join('\n\n'));
}
```

  然后在 [15] 后置提示词部分，在 `postParts` 数组末尾追加 post 位置条目和 inject_prompt：

```js
// [15] 后置提示词 + post 位置条目 + inject_prompt 注入
import { getActiveInjectPromptActions, updateActionParams } from '../db/queries/triggers.js';

const postParts = [
  config.global_post_prompt,
  world.post_prompt,
  character.post_prompt,
].filter(Boolean).map(tv);

// post 位置的 prompt 条目
if (postEntryTexts.length > 0) {
  postParts.push(postEntryTexts.join('\n\n'));
}

// inject_prompt 触发器注入（consumed/persistent 模式）
const injectActions = getActiveInjectPromptActions(world.id);
for (const action of injectActions) {
  const p = JSON.parse(action.params || '{}');
  if (p.text) {
    postParts.push(`[触发注入]\n${p.text}`);
    // consumed 模式：递减 rounds_remaining
    if (p.mode === 'consumed' && typeof p.rounds_remaining === 'number') {
      const newRemaining = p.rounds_remaining - 1;
      updateActionParams(action.trigger_id, { rounds_remaining: newRemaining });
    }
  }
}

if (postParts.length > 0) {
  messages.push({ role: 'user', content: postParts.join('\n\n') });
}
```

  对 `buildWritingPrompt` 做相同修改（注意写作模式无角色后置提示词）。

- [ ] **Step 4: Commit**

```bash
git add backend/prompts/assembler.js backend/prompts/entry-matcher.js
git commit -m "feat: assembler 按 position 注入条目 + inject_prompt 支持；entry-matcher 按 trigger_type 分流"
```

---

## Task 8: Post-gen 集成 — 触发器评估

**Files:**
- Modify: `backend/routes/chat.js`
- Modify: `backend/routes/writing.js`

- [ ] **Step 1: 阅读 chat.js 的 buildChatTaskSpecs 函数（约第 63-100 行）**

  确认现有 TaskSpec 数组结构。

- [ ] **Step 2: 在 chat.js 顶部导入 evaluateTriggers**

```js
import { evaluateTriggers } from '../services/trigger-evaluator.js';
```

- [ ] **Step 3: 在 buildChatTaskSpecs 中追加触发器评估任务**

  在 `all-state` TaskSpec 之后、`turn-record` 之前：

```js
// trigger-eval（p2）：状态更新后评估触发器，结果通过 SSE trigger_fired 发送
{
  label: 'trigger-eval',
  priority: 2,
  fn: async () => {
    const latestTurnRecord = getLatestTurnRecord(sessionId);
    const roundIndex = latestTurnRecord ? latestTurnRecord.round_index + 1 : 1;
    return evaluateTriggers(worldId, sessionId, roundIndex);
  },
  condition: !!worldId,
  sseEvent: 'trigger_fired',
  ssePayload: (result) =>
    result?.notifications?.length > 0
      ? { type: 'trigger_fired', notifications: result.notifications }
      : null,
  keepSseAlive: true,
},
```

- [ ] **Step 4: 对 writing.js 做相同修改**

  阅读 `backend/routes/writing.js` 中的 taskSpecs 数组（约第 240-296 行），找到 all-state 任务之后，追加相同的 trigger-eval TaskSpec（注意写作模式的 worldId 来源为 `session.world_id`）。

- [ ] **Step 5: 验证触发器评估被执行**

  在后端日志中确认每轮后有 `[trigger-eval]` 日志行（即使没有触发器也会有空调用日志）。

- [ ] **Step 6: Commit**

```bash
git add backend/routes/chat.js backend/routes/writing.js
git commit -m "feat: post-gen 集成触发器评估，trigger_fired SSE 事件"
```

---

## Task 9: SCHEMA.md 同步

**Files:**
- Modify: `SCHEMA.md`

- [ ] **Step 1: 在 SCHEMA.md 中添加三张新表的文档**

  在 `internal_meta` 表之前插入：

```markdown
### triggers — 触发器

\`\`\`sql
CREATE TABLE IF NOT EXISTS triggers (
  id                    TEXT PRIMARY KEY,
  world_id              TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  enabled               INTEGER NOT NULL DEFAULT 1,
  one_shot              INTEGER NOT NULL DEFAULT 0,
  last_triggered_round  INTEGER,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);
\`\`\`

### trigger_conditions — 触发条件

\`\`\`sql
CREATE TABLE IF NOT EXISTS trigger_conditions (
  id            TEXT PRIMARY KEY,
  trigger_id    TEXT NOT NULL REFERENCES triggers(id) ON DELETE CASCADE,
  target_field  TEXT NOT NULL,  -- 格式: 实体名.字段标签，如 凛.好感度
  operator      TEXT NOT NULL,  -- > < = >= <= != 包含 等于 不包含
  value         TEXT NOT NULL
);
\`\`\`

### trigger_actions — 触发动作（每个触发器一条）

\`\`\`sql
CREATE TABLE IF NOT EXISTS trigger_actions (
  id          TEXT PRIMARY KEY,
  trigger_id  TEXT NOT NULL UNIQUE REFERENCES triggers(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,  -- activate_entry | inject_prompt | notify
  params      TEXT NOT NULL DEFAULT '{}'  -- JSON
);
\`\`\`

params 格式：
- activate_entry: `{"entry_id": "xxx"}`
- inject_prompt: `{"text": "...", "mode": "consumed"|"persistent", "inject_rounds": 3, "rounds_remaining": 3}`
- notify: `{"text": "..."}`
```

- [ ] **Step 2: 记录 world_prompt_entries 新增字段**

  在 `world_prompt_entries` 表定义中追加两个字段的说明：

```
position      TEXT NOT NULL DEFAULT 'post'   -- 'system'（system 区）/ 'post'（后置区）
trigger_type  TEXT NOT NULL DEFAULT 'always' -- 'always'（常驻）/ 'keyword'（关键词）/ 'llm'（AI召回）
```

- [ ] **Step 3: Commit**

```bash
git add SCHEMA.md
git commit -m "docs: SCHEMA.md 同步 triggers 三表 + prompt_entries 新字段"
```

---

## Task 10: 前端 API 层

**Files:**
- Create: `frontend/src/api/triggers.js`
- Modify: `frontend/src/api/prompt-entries.js`

- [ ] **Step 1: 创建 frontend/src/api/triggers.js**

```js
import { request } from './request.js';

const BASE = '/api';

export function listTriggers(worldId) {
  return request(`${BASE}/worlds/${worldId}/triggers`);
}

export function createTrigger(worldId, data) {
  return request(`${BASE}/worlds/${worldId}/triggers`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateTrigger(triggerId, data) {
  return request(`${BASE}/triggers/${triggerId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteTrigger(triggerId) {
  return request(`${BASE}/triggers/${triggerId}`, { method: 'DELETE' });
}
```

- [ ] **Step 2: 修改 frontend/src/api/prompt-entries.js — 支持 position/trigger_type**

  阅读现有 `createWorldEntry` 和 `updateWorldEntry` 函数，确认参数透传 `position` 和 `trigger_type` 字段（如 data 对象已整体传递则无需修改；若有字段过滤则加入这两字段）。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/triggers.js frontend/src/api/prompt-entries.js
git commit -m "feat: 前端 API 层 — triggers + prompt-entries position/trigger_type"
```

---

## Task 11: 前端 — CharactersPage 三标签导航

**Files:**
- Modify: `frontend/src/pages/CharactersPage.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: 阅读 CharactersPage.jsx 全文**

  了解现有页面结构、路由参数使用方式。

- [ ] **Step 2: 在 App.jsx 添加 WorldStatePage 路由**

```jsx
const WorldStatePage = lazy(() => import('./pages/WorldStatePage'));
// 在 Routes 中：
<Route path="/worlds/:worldId/state" element={<WorldStatePage />} />
```

- [ ] **Step 3: 在 CharactersPage.jsx 顶部添加三标签导航**

  在页面顶部（世界名称标题下方）添加三个标签：

```jsx
// 导入
import { useNavigate, useParams, useLocation } from 'react-router-dom';

// 在组件内：
const { worldId } = useParams();
const navigate = useNavigate();
const location = useLocation();
const isStatePage = location.pathname.endsWith('/state');

// JSX：
<div style={{
  display: 'flex',
  borderBottom: '1px solid var(--we-paper-shadow)',
  marginBottom: '16px',
}}>
  {[
    { label: '构建', path: null, disabled: true },
    { label: '故事', path: `/worlds/${worldId}` },
    { label: '状态', path: `/worlds/${worldId}/state` },
  ].map(({ label, path, disabled }) => {
    const isActive = path === location.pathname;
    return (
      <button
        key={label}
        disabled={disabled}
        onClick={() => path && navigate(path)}
        style={{
          padding: '8px 20px',
          fontFamily: 'var(--we-font-serif)',
          fontSize: '14px',
          color: disabled
            ? 'var(--we-ink-faded)'
            : isActive
              ? 'var(--we-ink-primary)'
              : 'var(--we-ink-secondary)',
          borderBottom: isActive ? '2px solid var(--we-vermilion)' : '2px solid transparent',
          background: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'color 0.15s',
        }}
      >
        {label}
      </button>
    );
  })}
</div>
```

- [ ] **Step 4: 人工验证**

  访问 `http://localhost:5173/worlds/{任意worldId}`，确认顶部显示"构建 · 故事 · 状态"三个标签，点击"状态"跳转到 `/worlds/:id/state`。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/pages/CharactersPage.jsx
git commit -m "feat: 世界详情三标签导航（构建/故事/状态）"
```

---

## Task 12: 前端 — WorldStatePage 四分区骨架

**Files:**
- Create: `frontend/src/pages/WorldStatePage.jsx`

- [ ] **Step 1: 创建页面骨架**

  参照 `frontend/src/pages/WorldEditPage.jsx` 的样式规范（`--we-*` 变量、书卷风格），创建 `WorldStatePage.jsx`：

```jsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { listWorldEntries } from '../api/prompt-entries';
import { listTriggers } from '../api/triggers';
import EntrySection from '../components/state/EntrySection';
import TriggerCard from '../components/state/TriggerCard';
import TriggerEditor from '../components/state/TriggerEditor';

export default function WorldStatePage() {
  const { worldId } = useParams();
  const [entries, setEntries] = useState([]);
  const [triggers, setTriggers] = useState([]);
  const [editingTrigger, setEditingTrigger] = useState(null); // null=关闭, {}=新建, trigger对象=编辑

  useEffect(() => {
    listWorldEntries(worldId).then(setEntries).catch(() => {});
    listTriggers(worldId).then(setTriggers).catch(() => {});
  }, [worldId]);

  const alwaysEntries = entries.filter((e) => e.trigger_type === 'always');
  const keywordEntries = entries.filter((e) => e.trigger_type === 'keyword');
  const llmEntries = entries.filter((e) => e.trigger_type === 'llm');

  function refresh() {
    listWorldEntries(worldId).then(setEntries).catch(() => {});
    listTriggers(worldId).then(setTriggers).catch(() => {});
  }

  return (
    <div style={{
      padding: '24px 32px',
      maxWidth: '900px',
      margin: '0 auto',
      fontFamily: 'var(--we-font-serif)',
    }}>
      {/* 常驻条目 */}
      <EntrySection
        title="常驻条目"
        icon="📌"
        desc="始终注入，适合世界观基础设定和写作风格规范"
        triggerType="always"
        entries={alwaysEntries}
        worldId={worldId}
        onRefresh={refresh}
      />

      {/* 关键词触发条目 */}
      <EntrySection
        title="关键词触发条目"
        icon="🔑"
        desc="对话中出现指定词语时自动注入"
        triggerType="keyword"
        entries={keywordEntries}
        worldId={worldId}
        onRefresh={refresh}
      />

      {/* AI 召回条目 */}
      <EntrySection
        title="AI 召回条目"
        icon="🤖"
        desc="由 AI 判断当前情境是否需要注入"
        triggerType="llm"
        entries={llmEntries}
        worldId={worldId}
        onRefresh={refresh}
      />

      {/* 状态触发器 */}
      <div style={{ marginTop: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <span style={{ fontSize: '18px', marginRight: '8px' }}>⚡</span>
            <span style={{ fontFamily: 'var(--we-font-display)', fontSize: '16px', color: 'var(--we-ink-primary)', fontStyle: 'italic' }}>
              状态触发器
            </span>
            <p style={{ fontSize: '13px', color: 'var(--we-ink-secondary)', marginTop: '2px' }}>
              当世界或角色状态满足条件时执行动作
            </p>
          </div>
          <button
            onClick={() => setEditingTrigger({})}
            style={{
              fontFamily: 'var(--we-font-serif)',
              fontSize: '13px',
              color: 'var(--we-vermilion)',
              background: 'none',
              border: '1px solid var(--we-vermilion)',
              borderRadius: 'var(--we-radius-sm)',
              padding: '4px 12px',
              cursor: 'pointer',
            }}
          >
            + 新建触发器
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {triggers.map((t) => (
            <TriggerCard
              key={t.id}
              trigger={t}
              onEdit={() => setEditingTrigger(t)}
              onDelete={() => { /* deleteTrigger */ refresh(); }}
              onToggle={() => { /* updateTrigger enabled */ refresh(); }}
            />
          ))}
          {triggers.length === 0 && (
            <p style={{ fontSize: '13px', color: 'var(--we-ink-faded)', textAlign: 'center', padding: '24px 0' }}>
              暂无触发器
            </p>
          )}
        </div>
      </div>

      {editingTrigger !== null && (
        <TriggerEditor
          worldId={worldId}
          trigger={editingTrigger?.id ? editingTrigger : null}
          entries={entries}
          onClose={() => setEditingTrigger(null)}
          onSave={() => { setEditingTrigger(null); refresh(); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: 人工验证骨架可渲染**

  访问 `/worlds/:id/state`，确认页面不报错，四个区块标题可见。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/WorldStatePage.jsx
git commit -m "feat: WorldStatePage 骨架"
```

---

## Task 13: 前端 — EntrySection + EntryEditor

**Files:**
- Create: `frontend/src/components/state/EntrySection.jsx`
- Create: `frontend/src/components/state/EntryEditor.jsx`

- [ ] **Step 1: 参照 SettingsPage 中的条目卡片样式，创建 EntrySection.jsx**

  阅读现有条目卡片样式（在 `SettingsPage.jsx` 中搜索 `prompt_entries` 或 `EntryCard`），然后：

```jsx
// frontend/src/components/state/EntrySection.jsx
import { useState } from 'react';
import { deleteWorldEntry } from '../../api/prompt-entries';
import EntryEditor from './EntryEditor';

export default function EntrySection({ title, icon, desc, triggerType, entries, worldId, onRefresh }) {
  const [editing, setEditing] = useState(null); // null=关闭, {}=新建, entry=编辑

  async function handleDelete(entryId) {
    await deleteWorldEntry(entryId);
    onRefresh();
  }

  return (
    <div style={{ marginBottom: '28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <div>
          <span style={{ fontSize: '16px', marginRight: '6px' }}>{icon}</span>
          <span style={{ fontFamily: 'var(--we-font-display)', fontSize: '16px', color: 'var(--we-ink-primary)', fontStyle: 'italic' }}>
            {title}
          </span>
          <p style={{ fontSize: '13px', color: 'var(--we-ink-secondary)', marginTop: '2px', marginLeft: '22px' }}>
            {desc}
          </p>
        </div>
        <button
          onClick={() => setEditing({})}
          style={{
            fontFamily: 'var(--we-font-serif)',
            fontSize: '13px',
            color: 'var(--we-vermilion)',
            background: 'none',
            border: '1px solid var(--we-vermilion)',
            borderRadius: 'var(--we-radius-sm)',
            padding: '4px 12px',
            cursor: 'pointer',
          }}
        >
          + 新建
        </button>
      </div>

      <div style={{
        border: '1px solid var(--we-paper-shadow)',
        borderRadius: 'var(--we-radius)',
        overflow: 'hidden',
      }}>
        {entries.map((entry, i) => (
          <div key={entry.id} style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderBottom: i < entries.length - 1 ? '1px solid var(--we-paper-shadow)' : 'none',
            background: 'var(--we-paper-base)',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontFamily: 'var(--we-font-serif)', fontSize: '14px', color: 'var(--we-ink-primary)' }}>
                {entry.title}
              </span>
              <span style={{
                marginLeft: '8px',
                fontSize: '11px',
                color: 'var(--we-ink-faded)',
                background: 'var(--we-paper-shadow)',
                borderRadius: '4px',
                padding: '1px 6px',
              }}>
                {entry.position === 'system' ? '系统提示词' : '后置提示词'}
              </span>
              {triggerType === 'keyword' && entry.keywords?.length > 0 && (
                <span style={{ marginLeft: '6px', fontSize: '12px', color: 'var(--we-ink-secondary)' }}>
                  触发词：{entry.keywords.slice(0, 3).join(' / ')}
                  {entry.keywords.length > 3 ? '…' : ''}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setEditing(entry)}
                style={{ fontSize: '12px', color: 'var(--we-ink-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                编辑
              </button>
              <button
                onClick={() => handleDelete(entry.id)}
                style={{ fontSize: '12px', color: 'var(--we-vermilion)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                删除
              </button>
            </div>
          </div>
        ))}
        {entries.length === 0 && (
          <div style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: 'var(--we-ink-faded)' }}>
            暂无条目
          </div>
        )}
      </div>

      {editing !== null && (
        <EntryEditor
          worldId={worldId}
          entry={editing?.id ? editing : null}
          defaultTriggerType={triggerType}
          onClose={() => setEditing(null)}
          onSave={() => { setEditing(null); onRefresh(); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: 创建 EntryEditor.jsx**

  阅读 WorldEditPage.jsx 中现有的条目编辑表单样式，然后：

```jsx
// frontend/src/components/state/EntryEditor.jsx
import { useState } from 'react';
import { createWorldEntry, updateWorldEntry } from '../../api/prompt-entries';

const POSITION_OPTIONS = [
  { value: 'post', label: '后置提示词' },
  { value: 'system', label: '系统提示词' },
];

export default function EntryEditor({ worldId, entry, defaultTriggerType, onClose, onSave }) {
  const isNew = !entry?.id;
  const [form, setForm] = useState({
    title: entry?.title ?? '',
    content: entry?.content ?? '',
    description: entry?.description ?? '',
    keywords: entry?.keywords ? entry.keywords.join(', ') : '',
    position: entry?.position ?? 'post',
    trigger_type: entry?.trigger_type ?? defaultTriggerType ?? 'always',
  });
  const [saving, setSaving] = useState(false);

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
    if (isNew) {
      await createWorldEntry(worldId, data);
    } else {
      await updateWorldEntry(entry.id, data);
    }
    setSaving(false);
    onSave();
  }

  const fieldStyle = {
    width: '100%',
    padding: '6px 10px',
    fontFamily: 'var(--we-font-serif)',
    fontSize: '13px',
    background: 'var(--we-paper-base)',
    border: '1px solid var(--we-paper-shadow)',
    borderRadius: 'var(--we-radius-sm)',
    color: 'var(--we-ink-primary)',
    boxSizing: 'border-box',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div style={{
        background: 'var(--we-paper-base)',
        border: '1px solid var(--we-paper-shadow)',
        borderRadius: 'var(--we-radius)',
        width: '100%',
        maxWidth: '520px',
        padding: '24px',
        maxHeight: '80vh',
        overflowY: 'auto',
      }}>
        <h3 style={{ fontFamily: 'var(--we-font-display)', fontSize: '16px', color: 'var(--we-ink-primary)', fontStyle: 'italic', marginBottom: '16px' }}>
          {isNew ? '新建条目' : '编辑条目'}
        </h3>

        {/* 标题 */}
        <label style={{ display: 'block', fontSize: '12px', color: 'var(--we-ink-secondary)', marginBottom: '4px' }}>标题</label>
        <input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          style={{ ...fieldStyle, marginBottom: '12px' }}
        />

        {/* 内容 */}
        <label style={{ display: 'block', fontSize: '12px', color: 'var(--we-ink-secondary)', marginBottom: '4px' }}>内容</label>
        <textarea
          value={form.content}
          onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
          rows={4}
          style={{ ...fieldStyle, resize: 'vertical', marginBottom: '12px' }}
        />

        {/* 关键词（仅 keyword 类型显示） */}
        {form.trigger_type === 'keyword' && (
          <>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--we-ink-secondary)', marginBottom: '4px' }}>触发关键词（逗号分隔）</label>
            <input
              value={form.keywords}
              onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
              placeholder="如：暗影帮, 影堂, 黑市"
              style={{ ...fieldStyle, marginBottom: '12px' }}
            />
          </>
        )}

        {/* 触发描述（仅 llm 类型显示） */}
        {form.trigger_type === 'llm' && (
          <>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--we-ink-secondary)', marginBottom: '4px' }}>触发条件描述（供 AI 判断）</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              style={{ ...fieldStyle, resize: 'vertical', marginBottom: '12px' }}
            />
          </>
        )}

        {/* 注入位置 */}
        <label style={{ display: 'block', fontSize: '12px', color: 'var(--we-ink-secondary)', marginBottom: '4px' }}>注入位置</label>
        <select
          value={form.position}
          onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
          style={{ ...fieldStyle, marginBottom: '16px' }}
        >
          {POSITION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} style={{ fontSize: '13px', color: 'var(--we-ink-faded)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--we-font-serif)' }}>
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.title.trim()}
            style={{
              fontFamily: 'var(--we-font-serif)',
              fontSize: '13px',
              background: 'var(--we-vermilion)',
              color: 'var(--we-paper-base)',
              border: 'none',
              borderRadius: 'var(--we-radius-sm)',
              padding: '6px 16px',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 人工验证**

  访问 `/worlds/:id/state`，在"常驻条目"区点击"+ 新建"，填写标题和内容，保存后出现在列表中。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/state/EntrySection.jsx frontend/src/components/state/EntryEditor.jsx
git commit -m "feat: EntrySection + EntryEditor 组件（三类条目管理）"
```

---

## Task 14: 前端 — TriggerCard + TriggerEditor

**Files:**
- Create: `frontend/src/components/state/TriggerCard.jsx`
- Create: `frontend/src/components/state/TriggerEditor.jsx`

- [ ] **Step 1: 创建 TriggerCard.jsx**

```jsx
// frontend/src/components/state/TriggerCard.jsx
import { deleteTrigger, updateTrigger } from '../../api/triggers';

function conditionSummary(conditions) {
  if (!conditions?.length) return '（无条件）';
  return conditions.map((c) => `${c.target_field} ${c.operator} ${c.value}`).join(' 且 ');
}

function actionSummary(action) {
  if (!action) return '（无动作）';
  const p = JSON.parse(action.params || '{}');
  switch (action.action_type) {
    case 'activate_entry': return `激活条目`;
    case 'inject_prompt': return `注入提示词（${p.mode === 'persistent' ? '持续' : `${p.inject_rounds}轮`}）`;
    case 'notify': return `通知：${p.text || ''}`;
    default: return action.action_type;
  }
}

export default function TriggerCard({ trigger, onEdit, onDelete, onToggle }) {
  async function handleToggle() {
    await updateTrigger(trigger.id, { enabled: trigger.enabled ? 0 : 1 });
    onToggle();
  }

  async function handleDelete() {
    await deleteTrigger(trigger.id);
    onDelete();
  }

  return (
    <div style={{
      background: 'var(--we-paper-base)',
      border: '1px solid var(--we-paper-shadow)',
      borderRadius: 'var(--we-radius)',
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
    }}>
      {/* 启用 toggle */}
      <button
        onClick={handleToggle}
        title={trigger.enabled ? '点击禁用' : '点击启用'}
        style={{
          width: '32px',
          height: '18px',
          borderRadius: '9px',
          background: trigger.enabled ? 'var(--we-vermilion)' : 'var(--we-paper-shadow)',
          border: 'none',
          cursor: 'pointer',
          flexShrink: 0,
          marginTop: '2px',
          position: 'relative',
          transition: 'background 0.2s',
        }}
      >
        <span style={{
          position: 'absolute',
          top: '2px',
          left: trigger.enabled ? '16px' : '2px',
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          background: 'white',
          transition: 'left 0.2s',
        }} />
      </button>

      {/* 内容 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--we-font-serif)', fontSize: '14px', color: 'var(--we-ink-primary)', fontWeight: 500, marginBottom: '4px' }}>
          {trigger.name}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--we-ink-secondary)', marginBottom: '2px' }}>
          当 {conditionSummary(trigger.conditions)}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--we-ink-secondary)', marginBottom: '4px' }}>
          则 {actionSummary(trigger.action)}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--we-ink-faded)' }}>
          {trigger.last_triggered_round != null
            ? `上次触发：第 ${trigger.last_triggered_round} 轮`
            : '从未触发'}
          {trigger.one_shot ? '  ·  仅触发一次' : ''}
        </div>
      </div>

      {/* 操作 */}
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <button onClick={onEdit} style={{ fontSize: '12px', color: 'var(--we-ink-secondary)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--we-font-serif)' }}>
          编辑
        </button>
        <button onClick={handleDelete} style={{ fontSize: '12px', color: 'var(--we-vermilion)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--we-font-serif)' }}>
          删除
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 TriggerEditor.jsx**

```jsx
// frontend/src/components/state/TriggerEditor.jsx
import { useState } from 'react';
import { createTrigger, updateTrigger } from '../../api/triggers';

const OPERATORS_NUMERIC = ['>', '<', '=', '>=', '<=', '!='];
const OPERATORS_TEXT = ['包含', '等于', '不包含'];

const ACTION_TYPES = [
  { value: 'activate_entry', label: '激活 Prompt 条目' },
  { value: 'inject_prompt', label: '注入系统提示' },
  { value: 'notify', label: '前端通知' },
];

function emptyCondition() {
  return { target_field: '', operator: '>', value: '' };
}

export default function TriggerEditor({ worldId, trigger, entries, onClose, onSave }) {
  const isNew = !trigger?.id;
  const [name, setName] = useState(trigger?.name ?? '');
  const [enabled, setEnabled] = useState(trigger?.enabled ?? 1);
  const [oneShot, setOneShot] = useState(trigger?.one_shot ?? 0);
  const [conditions, setConditions] = useState(
    trigger?.conditions?.length > 0 ? trigger.conditions : [emptyCondition()]
  );
  const [actionType, setActionType] = useState(trigger?.action?.action_type ?? 'notify');
  const [actionParams, setActionParams] = useState(
    trigger?.action ? JSON.parse(trigger.action.params || '{}') : {}
  );
  const [saving, setSaving] = useState(false);

  function updateCondition(index, patch) {
    setConditions((prev) => prev.map((c, i) => i === index ? { ...c, ...patch } : c));
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    const payload = {
      name: name.trim(),
      enabled,
      one_shot: oneShot,
      conditions: conditions.filter((c) => c.target_field && c.value),
      action: { action_type: actionType, params: actionParams },
    };
    if (isNew) {
      await createTrigger(worldId, payload);
    } else {
      await updateTrigger(trigger.id, payload);
    }
    setSaving(false);
    onSave();
  }

  const fieldStyle = {
    padding: '6px 10px',
    fontFamily: 'var(--we-font-serif)',
    fontSize: '13px',
    background: 'var(--we-paper-base)',
    border: '1px solid var(--we-paper-shadow)',
    borderRadius: 'var(--we-radius-sm)',
    color: 'var(--we-ink-primary)',
    boxSizing: 'border-box',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div style={{
        background: 'var(--we-paper-base)',
        border: '1px solid var(--we-paper-shadow)',
        borderRadius: 'var(--we-radius)',
        width: '100%',
        maxWidth: '560px',
        padding: '24px',
        maxHeight: '85vh',
        overflowY: 'auto',
      }}>
        <h3 style={{ fontFamily: 'var(--we-font-display)', fontSize: '16px', color: 'var(--we-ink-primary)', fontStyle: 'italic', marginBottom: '16px' }}>
          {isNew ? '新建触发器' : '编辑触发器'}
        </h3>

        {/* 名称 + 开关 */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="触发器名称"
            style={{ ...fieldStyle, flex: 1 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: 'var(--we-ink-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!oneShot} onChange={(e) => setOneShot(e.target.checked ? 1 : 0)} />
            仅触发一次
          </label>
        </div>

        {/* 条件列表 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', color: 'var(--we-ink-secondary)', marginBottom: '6px' }}>条件（全部满足时触发）</div>
          {conditions.map((cond, i) => (
            <div key={i} style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
              <input
                value={cond.target_field}
                onChange={(e) => updateCondition(i, { target_field: e.target.value })}
                placeholder="实体名.字段标签"
                style={{ ...fieldStyle, flex: 2 }}
              />
              <select
                value={cond.operator}
                onChange={(e) => updateCondition(i, { operator: e.target.value })}
                style={{ ...fieldStyle, flex: 1 }}
              >
                {[...OPERATORS_NUMERIC, ...OPERATORS_TEXT].map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
              <input
                value={cond.value}
                onChange={(e) => updateCondition(i, { value: e.target.value })}
                placeholder="值"
                style={{ ...fieldStyle, flex: 1 }}
              />
              <button
                onClick={() => setConditions((prev) => prev.filter((_, idx) => idx !== i))}
                style={{ color: 'var(--we-vermilion)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={() => setConditions((prev) => [...prev, emptyCondition()])}
            style={{ fontSize: '12px', color: 'var(--we-vermilion)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--we-font-serif)' }}
          >
            + 添加条件
          </button>
        </div>

        {/* 动作 */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', color: 'var(--we-ink-secondary)', marginBottom: '6px' }}>动作</div>
          <select
            value={actionType}
            onChange={(e) => { setActionType(e.target.value); setActionParams({}); }}
            style={{ ...fieldStyle, width: '100%', marginBottom: '8px' }}
          >
            {ACTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>

          {actionType === 'activate_entry' && (
            <select
              value={actionParams.entry_id ?? ''}
              onChange={(e) => setActionParams({ entry_id: e.target.value })}
              style={{ ...fieldStyle, width: '100%' }}
            >
              <option value="">选择条目…</option>
              {entries.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          )}

          {actionType === 'inject_prompt' && (
            <>
              <textarea
                value={actionParams.text ?? ''}
                onChange={(e) => setActionParams((p) => ({ ...p, text: e.target.value }))}
                placeholder="注入的提示文本"
                rows={3}
                style={{ ...fieldStyle, width: '100%', resize: 'vertical', marginBottom: '6px' }}
              />
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select
                  value={actionParams.mode ?? 'consumed'}
                  onChange={(e) => setActionParams((p) => ({ ...p, mode: e.target.value }))}
                  style={fieldStyle}
                >
                  <option value="consumed">消耗型（N轮后停止）</option>
                  <option value="persistent">持久型（持续注入）</option>
                </select>
                {(actionParams.mode ?? 'consumed') === 'consumed' && (
                  <input
                    type="number"
                    min={1}
                    value={actionParams.inject_rounds ?? 1}
                    onChange={(e) => setActionParams((p) => ({ ...p, inject_rounds: parseInt(e.target.value) || 1 }))}
                    style={{ ...fieldStyle, width: '80px' }}
                  />
                )}
                {(actionParams.mode ?? 'consumed') === 'consumed' && (
                  <span style={{ fontSize: '12px', color: 'var(--we-ink-secondary)' }}>轮</span>
                )}
              </div>
            </>
          )}

          {actionType === 'notify' && (
            <input
              value={actionParams.text ?? ''}
              onChange={(e) => setActionParams({ text: e.target.value })}
              placeholder="通知文本"
              style={{ ...fieldStyle, width: '100%' }}
            />
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} style={{ fontSize: '13px', color: 'var(--we-ink-faded)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--we-font-serif)' }}>
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            style={{
              fontFamily: 'var(--we-font-serif)',
              fontSize: '13px',
              background: 'var(--we-vermilion)',
              color: 'var(--we-paper-base)',
              border: 'none',
              borderRadius: 'var(--we-radius-sm)',
              padding: '6px 16px',
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 人工验证**

  - 访问 `/worlds/:id/state`
  - 点击"+ 新建触发器"，填写名称、至少一个条件（如 `凛.好感度 > 50`）、选择通知动作
  - 保存后触发器卡片出现在列表中
  - 点击"编辑"重新打开弹窗，数据正确回显
  - 切换 enabled toggle，卡片颜色变化

- [ ] **Step 4: 验证触发器实际触发**

  1. 确保后端运行中
  2. 在某个世界里，创建一个角色状态字段（如 `好感度`，数字类型）并设置初始值 60
  3. 创建触发器：条件 `凛.好感度 > 50`，动作类型"前端通知"，文本"信任度突破！"
  4. 开始一次对话，发送一条消息
  5. 查看后端日志，确认有 `触发器命中: "..."` 日志
  6. 前端收到 `trigger_fired` SSE 事件（可在 DevTools Network 中验证）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/state/TriggerCard.jsx frontend/src/components/state/TriggerEditor.jsx
git commit -m "feat: TriggerCard + TriggerEditor 组件"
```

---

## 自检：Spec 对照

| 设计要求 | 对应任务 | 状态 |
|---|---|---|
| triggers/trigger_conditions/trigger_actions 三表 | Task 1, 2 | ✓ |
| inject_prompt consumed/persistent 模式 + inject_rounds | Task 2, 5, 7 | ✓ |
| one_shot 与 consumed 独立维度 | Task 2, 5 | ✓ |
| 触发器检查在 Priority 2 状态更新后执行 | Task 8 | ✓ |
| activate_entry 动作 | Task 5 | ✓ |
| inject_prompt 动作（assembler 注入） | Task 7 | ✓ |
| notify 动作 → SSE trigger_fired | Task 5, 8 | ✓ |
| world_prompt_entries 新增 position 字段 | Task 1, 3, 4 | ✓ |
| world_prompt_entries 新增 trigger_type 字段 | Task 1, 3, 4 | ✓ |
| 现有条目数据迁移（trigger_type 默认值） | Task 1 | ✓ |
| entry-matcher 按 trigger_type 分流 | Task 7 | ✓ |
| 世界详情三标签导航（构建/故事/状态） | Task 11 | ✓ |
| State 页四分区（常驻/关键词/AI召回/触发器） | Task 12, 13, 14 | ✓ |
| 条目注入位置选择（system/post） | Task 7, 13 | ✓ |
| 触发器编辑弹窗（条件构建器+动作表单） | Task 14 | ✓ |
| 视觉风格遵循 DESIGN.md + --we-* 变量 | Task 12, 13, 14 | ✓ |
| SCHEMA.md 同步 | Task 9 | ✓ |

**已知风险：**
- `getActiveInjectPromptActions` 过滤逻辑在 JS 层（非 SQL），大量 inject_prompt 时性能可接受（触发器数量一般 < 20）
- TriggerEditor 的条件字段 `target_field` 为自由文本输入；如需下拉选择，需另外加载世界状态字段列表（作为后续优化）
- `activate_entry` 动作将目标条目改为 `trigger_type='always'`，这改变了条目的原始分类；如需"仅本轮激活"语义，需另设 `activated_by_trigger` 字段（设计文档说持续生效，此实现符合规格）
