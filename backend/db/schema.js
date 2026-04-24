import crypto from 'node:crypto';

const TABLES = `
CREATE TABLE IF NOT EXISTS worlds (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  system_prompt     TEXT NOT NULL DEFAULT '',
  post_prompt       TEXT NOT NULL DEFAULT '',
  temperature       REAL,
  max_tokens        INTEGER,
  active_persona_id TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS personas (
  id             TEXT PRIMARY KEY,
  world_id       TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name           TEXT NOT NULL DEFAULT '',
  description    TEXT NOT NULL DEFAULT '',
  system_prompt  TEXT NOT NULL DEFAULT '',
  avatar_path    TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS persona_state_fields (
  id                 TEXT PRIMARY KEY,
  world_id           TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  field_key          TEXT NOT NULL,
  label              TEXT NOT NULL,
  type               TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  default_value      TEXT,
  update_mode        TEXT NOT NULL DEFAULT 'manual',
  trigger_mode       TEXT NOT NULL DEFAULT 'manual_only',
  trigger_keywords   TEXT,
  enum_options       TEXT,
  min_value          REAL,
  max_value          REAL,
  allow_empty        INTEGER NOT NULL DEFAULT 1,
  update_instruction TEXT NOT NULL DEFAULT '',
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  UNIQUE(world_id, field_key)
);

CREATE TABLE IF NOT EXISTS persona_state_values (
  id             TEXT PRIMARY KEY,
  world_id       TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  field_key      TEXT NOT NULL,
  default_value_json TEXT,
  runtime_value_json TEXT,
  updated_at     INTEGER NOT NULL,
  UNIQUE(world_id, field_key)
);

CREATE TABLE IF NOT EXISTS characters (
  id             TEXT PRIMARY KEY,
  world_id       TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  system_prompt  TEXT NOT NULL DEFAULT '',
  post_prompt    TEXT NOT NULL DEFAULT '',
  first_message  TEXT NOT NULL DEFAULT '',
  avatar_path    TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id                  TEXT PRIMARY KEY,
  character_id        TEXT REFERENCES characters(id) ON DELETE CASCADE,
  world_id            TEXT REFERENCES worlds(id) ON DELETE CASCADE,
  mode                TEXT NOT NULL DEFAULT 'chat',
  title               TEXT,
  compressed_context  TEXT,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS writing_session_characters (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  UNIQUE(session_id, character_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role           TEXT NOT NULL,
  content        TEXT NOT NULL,
  attachments    TEXT,
  is_compressed  INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session_summaries (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  content        TEXT NOT NULL,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS world_state_fields (
  id                 TEXT PRIMARY KEY,
  world_id           TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  field_key          TEXT NOT NULL,
  label              TEXT NOT NULL,
  type               TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  default_value      TEXT,
  update_mode        TEXT NOT NULL DEFAULT 'manual',
  trigger_mode       TEXT NOT NULL DEFAULT 'manual_only',
  trigger_keywords   TEXT,
  enum_options       TEXT,
  min_value          REAL,
  max_value          REAL,
  allow_empty        INTEGER NOT NULL DEFAULT 1,
  update_instruction TEXT NOT NULL DEFAULT '',
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  UNIQUE(world_id, field_key)
);

CREATE TABLE IF NOT EXISTS world_state_values (
  id             TEXT PRIMARY KEY,
  world_id       TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  field_key      TEXT NOT NULL,
  default_value_json TEXT,
  runtime_value_json TEXT,
  updated_at     INTEGER NOT NULL,
  UNIQUE(world_id, field_key)
);

CREATE TABLE IF NOT EXISTS character_state_fields (
  id                 TEXT PRIMARY KEY,
  world_id           TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  field_key          TEXT NOT NULL,
  label              TEXT NOT NULL,
  type               TEXT NOT NULL,
  description        TEXT NOT NULL DEFAULT '',
  default_value      TEXT,
  update_mode        TEXT NOT NULL DEFAULT 'manual',
  trigger_mode       TEXT NOT NULL DEFAULT 'manual_only',
  trigger_keywords   TEXT,
  enum_options       TEXT,
  min_value          REAL,
  max_value          REAL,
  allow_empty        INTEGER NOT NULL DEFAULT 1,
  update_instruction TEXT NOT NULL DEFAULT '',
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  UNIQUE(world_id, field_key)
);

CREATE TABLE IF NOT EXISTS character_state_values (
  id             TEXT PRIMARY KEY,
  character_id   TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  field_key      TEXT NOT NULL,
  default_value_json TEXT,
  runtime_value_json TEXT,
  updated_at     INTEGER NOT NULL,
  UNIQUE(character_id, field_key)
);

CREATE TABLE IF NOT EXISTS global_prompt_entries (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  content        TEXT NOT NULL DEFAULT '',
  keywords       TEXT,
  keyword_scope  TEXT NOT NULL DEFAULT 'user,assistant',
  mode           TEXT NOT NULL DEFAULT 'chat',
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS world_prompt_entries (
  id             TEXT PRIMARY KEY,
  world_id       TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  content        TEXT NOT NULL DEFAULT '',
  keywords       TEXT,
  keyword_scope  TEXT NOT NULL DEFAULT 'user,assistant',
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS character_prompt_entries (
  id             TEXT PRIMARY KEY,
  character_id   TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  content        TEXT NOT NULL DEFAULT '',
  keywords       TEXT,
  keyword_scope  TEXT NOT NULL DEFAULT 'user,assistant',
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS custom_css_snippets (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  enabled        INTEGER NOT NULL DEFAULT 1,
  content        TEXT NOT NULL DEFAULT '',
  mode           TEXT NOT NULL DEFAULT 'chat',
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS regex_rules (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  enabled        INTEGER NOT NULL DEFAULT 1,
  pattern        TEXT NOT NULL,
  replacement    TEXT NOT NULL DEFAULT '',
  flags          TEXT NOT NULL DEFAULT 'g',
  scope          TEXT NOT NULL,
  world_id       TEXT REFERENCES worlds(id) ON DELETE CASCADE,
  mode           TEXT NOT NULL DEFAULT 'chat',
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS turn_records (
  id                TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  round_index       INTEGER NOT NULL,
  summary           TEXT NOT NULL,
  user_message_id   TEXT,
  asst_message_id   TEXT,
  created_at        INTEGER NOT NULL,
  UNIQUE(session_id, round_index)
);

CREATE TABLE IF NOT EXISTS daily_entries (
  id                       TEXT PRIMARY KEY,
  session_id               TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  date_str                 TEXT NOT NULL,      -- 文件名用，如 "1000-03-15"（补零）
  date_display             TEXT NOT NULL,      -- 显示用，如 "1000年3月15日"
  summary                  TEXT NOT NULL,      -- LLM 生成的 1-2 句摘要
  triggered_by_round_index INTEGER,            -- 触发此日记的轮次（删除定位用）
  created_at               INTEGER NOT NULL,
  UNIQUE(session_id, date_str)
);

CREATE TABLE IF NOT EXISTS internal_meta (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session_world_state_values (
  id                 TEXT PRIMARY KEY,
  session_id         TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  world_id           TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  field_key          TEXT NOT NULL,
  runtime_value_json TEXT,
  updated_at         INTEGER NOT NULL,
  UNIQUE(session_id, world_id, field_key)
);

CREATE TABLE IF NOT EXISTS session_persona_state_values (
  id                 TEXT PRIMARY KEY,
  session_id         TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  world_id           TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  field_key          TEXT NOT NULL,
  runtime_value_json TEXT,
  updated_at         INTEGER NOT NULL,
  UNIQUE(session_id, world_id, field_key)
);

CREATE TABLE IF NOT EXISTS session_character_state_values (
  id                 TEXT PRIMARY KEY,
  session_id         TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  character_id       TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  field_key          TEXT NOT NULL,
  runtime_value_json TEXT,
  updated_at         INTEGER NOT NULL,
  UNIQUE(session_id, character_id, field_key)
);

CREATE TABLE IF NOT EXISTS chapter_titles (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  chapter_index INTEGER NOT NULL,   -- 1-based，与前端 groupMessagesIntoChapters 保持一致
  title         TEXT NOT NULL,
  is_default    INTEGER NOT NULL DEFAULT 1,  -- 1=占位默认，0=LLM/用户真实标题
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE(session_id, chapter_index)
);

CREATE TABLE IF NOT EXISTS entry_conditions (
  id           TEXT PRIMARY KEY,
  entry_id     TEXT NOT NULL REFERENCES world_prompt_entries(id) ON DELETE CASCADE,
  target_field TEXT NOT NULL,
  operator     TEXT NOT NULL,
  value        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entry_conditions_entry_id ON entry_conditions(entry_id);
`;

const INDEXES = `
CREATE INDEX IF NOT EXISTS idx_characters_world_id ON characters(world_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_world_state_fields_world_id ON world_state_fields(world_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_world_state_values_world_id ON world_state_values(world_id, field_key);
CREATE INDEX IF NOT EXISTS idx_character_state_fields_world_id ON character_state_fields(world_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_character_state_values_character_id ON character_state_values(character_id, field_key);
CREATE INDEX IF NOT EXISTS idx_world_prompt_entries_world_id ON world_prompt_entries(world_id);
CREATE INDEX IF NOT EXISTS idx_character_prompt_entries_character_id ON character_prompt_entries(character_id);
CREATE INDEX IF NOT EXISTS idx_custom_css_snippets_sort_order ON custom_css_snippets(sort_order);
CREATE INDEX IF NOT EXISTS idx_regex_rules_scope ON regex_rules(scope, sort_order);
CREATE INDEX IF NOT EXISTS idx_regex_rules_world_id ON regex_rules(world_id);
CREATE INDEX IF NOT EXISTS idx_persona_state_fields_world_id ON persona_state_fields(world_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_persona_state_values_world_id ON persona_state_values(world_id, field_key);
`;

export function initSchema(db) {
  db.exec(TABLES);
  db.exec(INDEXES);
  // T30: 为现有数据库添加 personas.avatar_path 列（新建库由 CREATE TABLE 覆盖）
  try { db.exec(`ALTER TABLE personas ADD COLUMN avatar_path TEXT`); } catch {}
  // T31: 为现有数据库添加 post_prompt 列（新建库由 CREATE TABLE 覆盖）
  try { db.exec(`ALTER TABLE worlds ADD COLUMN post_prompt TEXT NOT NULL DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE characters ADD COLUMN post_prompt TEXT NOT NULL DEFAULT ''`); } catch {}
  // T35: 为现有数据库添加 worlds.description 列
  try { db.exec(`ALTER TABLE worlds ADD COLUMN description TEXT NOT NULL DEFAULT ''`); } catch {}
  // T-desc: 为现有数据库添加 characters.description / personas.description 列
  try { db.exec(`ALTER TABLE characters ADD COLUMN description TEXT NOT NULL DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE personas ADD COLUMN description TEXT NOT NULL DEFAULT ''`); } catch {}
  // T32: 轮次压缩字段迁移
  try { db.exec(`ALTER TABLE messages ADD COLUMN is_compressed INTEGER NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE sessions ADD COLUMN compressed_context TEXT`); } catch {}
  // T32: 字段迁移完成后才能创建依赖 is_compressed 的索引
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_session_compressed ON messages(session_id, is_compressed, created_at)`); } catch {}
  // T34: sessions 表改造 — character_id 改为 nullable，新增 world_id / mode；新建 writing_session_characters 表
  const colInfo = db.pragma('table_info(sessions)');
  const charCol = colInfo.find(c => c.name === 'character_id');
  if (charCol && charCol.notnull === 1) {
    db.pragma('foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(`CREATE TABLE sessions_new (
        id                  TEXT PRIMARY KEY,
        character_id        TEXT REFERENCES characters(id) ON DELETE CASCADE,
        world_id            TEXT REFERENCES worlds(id) ON DELETE CASCADE,
        mode                TEXT NOT NULL DEFAULT 'chat',
        title               TEXT,
        compressed_context  TEXT,
        created_at          INTEGER NOT NULL,
        updated_at          INTEGER NOT NULL
      )`);
      db.exec(`INSERT INTO sessions_new (id, character_id, world_id, mode, title, compressed_context, created_at, updated_at)
        SELECT id, character_id, NULL, 'chat', title, compressed_context, created_at, updated_at FROM sessions`);
      db.exec('DROP TABLE sessions');
      db.exec('ALTER TABLE sessions_new RENAME TO sessions');
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      db.pragma('foreign_keys = ON');
      throw e;
    }
    db.pragma('foreign_keys = ON');
  }
  // T34: 为现有 sessions 表补充 world_id / mode 列（已经过 table-recreation 的库跳过）
  try { db.exec(`ALTER TABLE sessions ADD COLUMN world_id TEXT REFERENCES worlds(id) ON DELETE CASCADE`); } catch {}
  try { db.exec(`ALTER TABLE sessions ADD COLUMN mode TEXT NOT NULL DEFAULT 'chat'`); } catch {}
  // T59: 状态值拆分为默认值 + 运行时值；旧 value_json 迁移到 default_value_json
  try { db.exec(`ALTER TABLE world_state_values ADD COLUMN default_value_json TEXT`); } catch {}
  try { db.exec(`ALTER TABLE world_state_values ADD COLUMN runtime_value_json TEXT`); } catch {}
  try { db.exec(`ALTER TABLE character_state_values ADD COLUMN default_value_json TEXT`); } catch {}
  try { db.exec(`ALTER TABLE character_state_values ADD COLUMN runtime_value_json TEXT`); } catch {}
  try { db.exec(`ALTER TABLE persona_state_values ADD COLUMN default_value_json TEXT`); } catch {}
  try { db.exec(`ALTER TABLE persona_state_values ADD COLUMN runtime_value_json TEXT`); } catch {}
  migrateLegacyStateValueColumns(db);
  // T34: 补充索引
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_writing_session_characters_session_id ON writing_session_characters(session_id)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_world_id ON sessions(world_id, mode, created_at)`); } catch {}
  // per-turn 摘要系统：新增 turn_records 表索引
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_turn_records_session ON turn_records(session_id, round_index)`); } catch {}
  // 双模式全局设置：为三张表添加 mode 列（'chat' | 'writing'）
  try { db.exec(`ALTER TABLE global_prompt_entries ADD COLUMN mode TEXT NOT NULL DEFAULT 'chat'`); } catch {}
  try { db.exec(`ALTER TABLE custom_css_snippets ADD COLUMN mode TEXT NOT NULL DEFAULT 'chat'`); } catch {}
  try { db.exec(`ALTER TABLE regex_rules ADD COLUMN mode TEXT NOT NULL DEFAULT 'chat'`); } catch {}
  // Prompt 条目：summary → description（触发条件描述），新增 keyword_scope
  try { db.exec(`ALTER TABLE global_prompt_entries RENAME COLUMN summary TO description`); } catch {}
  try { db.exec(`ALTER TABLE world_prompt_entries RENAME COLUMN summary TO description`); } catch {}
  try { db.exec(`ALTER TABLE character_prompt_entries RENAME COLUMN summary TO description`); } catch {}
  try { db.exec(`ALTER TABLE global_prompt_entries ADD COLUMN keyword_scope TEXT NOT NULL DEFAULT 'user,assistant'`); } catch {}
  try { db.exec(`ALTER TABLE world_prompt_entries ADD COLUMN keyword_scope TEXT NOT NULL DEFAULT 'user,assistant'`); } catch {}
  try { db.exec(`ALTER TABLE character_prompt_entries ADD COLUMN keyword_scope TEXT NOT NULL DEFAULT 'user,assistant'`); } catch {}
  // turn_records 改为指针模式：新增 user_message_id / asst_message_id，移除复制内容字段
  try { db.exec(`ALTER TABLE turn_records ADD COLUMN user_message_id TEXT`); } catch {}
  try { db.exec(`ALTER TABLE turn_records ADD COLUMN asst_message_id TEXT`); } catch {}
  try { db.exec(`ALTER TABLE turn_records DROP COLUMN user_context`); } catch {}
  try { db.exec(`ALTER TABLE turn_records DROP COLUMN asst_context`); } catch {}
  // 状态快照：保存该轮结束时的三层状态，用于 regenerate/删除/编辑后的状态回滚
  try { db.exec(`ALTER TABLE turn_records ADD COLUMN state_snapshot TEXT`); } catch {}
  // 日记系统：sessions 记录创建时的日记模式，daily_entries 存日记元数据
  try { db.exec(`ALTER TABLE sessions ADD COLUMN diary_date_mode TEXT`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_daily_entries_session ON daily_entries(session_id, date_str)`); } catch {}
  // 章节标题系统：写作空间章节标题持久化
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_chapter_titles_session ON chapter_titles(session_id, chapter_index)`); } catch {}

  migrateLegacyAutoFilledNullStateValues(db);
  // State 引擎 Phase 1：为 world_prompt_entries 新增 position / trigger_type 字段
  try { db.exec("ALTER TABLE world_prompt_entries ADD COLUMN position TEXT NOT NULL DEFAULT 'post'"); } catch (_) {}
  try { db.exec("ALTER TABLE world_prompt_entries ADD COLUMN trigger_type TEXT NOT NULL DEFAULT 'always'"); } catch (_) {}
  // 扩展 character_prompt_entries 支持 position 字段（与 world_prompt_entries 对齐）
  try { db.exec("ALTER TABLE character_prompt_entries ADD COLUMN position TEXT NOT NULL DEFAULT 'post'"); } catch (_) {}
  migrateTriggerTypeInitial(db);
  migrateLegacyWorldPromptColumns(db);
  // personas 多对一：移除 world_id UNIQUE 约束
  migratePersonasMultiPerWorld(db);
  // 废除触发器三表，新增 entry_conditions 表
  migrateDropTriggerTables(db);
  // worlds 新增 active_persona_id 列
  try { db.exec(`ALTER TABLE worlds ADD COLUMN active_persona_id TEXT`); } catch {}
}

function migrateLegacyAutoFilledNullStateValues(db) {
  const key = 'migration:t56_clear_legacy_auto_filled_null_state_values';
  const applied = db.prepare('SELECT value FROM internal_meta WHERE key = ?').get(key);
  if (applied?.value === '1') return;

  // 仅清理旧版本自动写入的占位默认值：
  // 1) 字段本身没有 default_value
  // 2) 值等于旧逻辑注入的类型默认值
  // 3) updated_at 非常接近对象/字段创建时刻，缩小误伤范围
  const WINDOW_MS = 10_000;
  const now = Date.now();

  db.exec('BEGIN');
  try {
    db.prepare(`
      UPDATE world_state_values
      SET default_value_json = NULL
      WHERE id IN (
        SELECT wsv.id
        FROM world_state_values wsv
        JOIN world_state_fields wsf
          ON wsf.world_id = wsv.world_id AND wsf.field_key = wsv.field_key
        JOIN worlds w
          ON w.id = wsv.world_id
        WHERE wsf.default_value IS NULL
          AND wsv.updated_at <= w.created_at + ?
          AND (
            (wsf.type = 'text' AND wsv.default_value_json = '""') OR
            (wsf.type = 'number' AND wsv.default_value_json = '0') OR
            (wsf.type = 'boolean' AND wsv.default_value_json = 'false') OR
            (wsf.type = 'list' AND wsv.default_value_json = '[]')
          )
      )
    `).run(WINDOW_MS);

    db.prepare(`
      UPDATE character_state_values
      SET default_value_json = NULL
      WHERE id IN (
        SELECT csv.id
        FROM character_state_values csv
        JOIN characters c
          ON c.id = csv.character_id
        JOIN character_state_fields csf
          ON csf.world_id = c.world_id AND csf.field_key = csv.field_key
        WHERE csf.default_value IS NULL
          AND csv.updated_at <= c.created_at + ?
          AND (
            (csf.type = 'text' AND csv.default_value_json = '""') OR
            (csf.type = 'number' AND csv.default_value_json = '0') OR
            (csf.type = 'boolean' AND csv.default_value_json = 'false') OR
            (csf.type = 'list' AND csv.default_value_json = '[]')
          )
      )
    `).run(WINDOW_MS);

    db.prepare(`
      UPDATE persona_state_values
      SET default_value_json = NULL
      WHERE id IN (
        SELECT psv.id
        FROM persona_state_values psv
        JOIN persona_state_fields psf
          ON psf.world_id = psv.world_id AND psf.field_key = psv.field_key
        JOIN worlds w
          ON w.id = psv.world_id
        WHERE psf.default_value IS NULL
          AND (
            psv.updated_at <= w.created_at + ?
            OR psv.updated_at <= psf.created_at + ?
          )
          AND (
            (psf.type = 'text' AND psv.default_value_json = '""') OR
            (psf.type = 'number' AND psv.default_value_json = '0') OR
            (psf.type = 'boolean' AND psv.default_value_json = 'false') OR
            (psf.type = 'list' AND psv.default_value_json = '[]')
          )
      )
    `).run(WINDOW_MS, WINDOW_MS);

    db.prepare(`
      INSERT INTO internal_meta (key, value, updated_at)
      VALUES (?, '1', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, now);

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function migrateTriggerTypeInitial(db) {
  const migKey = 'migration:trigger_type_initial';
  const already = db.prepare("SELECT value FROM internal_meta WHERE key = ?").get(migKey);
  if (already) return;

  const now = Date.now();
  db.exec('BEGIN');
  try {
    // 有关键词的条目 → keyword 类型
    db.prepare(`
      UPDATE world_prompt_entries SET trigger_type = 'keyword'
      WHERE keywords IS NOT NULL AND keywords != 'null' AND keywords != '[]'
    `).run();
    // 无关键词但有 description 的条目 → llm 类型
    db.prepare(`
      UPDATE world_prompt_entries SET trigger_type = 'llm'
      WHERE (keywords IS NULL OR keywords = 'null' OR keywords = '[]')
        AND description IS NOT NULL AND TRIM(description) != ''
        AND trigger_type = 'always'
    `).run();
    db.prepare("INSERT OR REPLACE INTO internal_meta (key, value, updated_at) VALUES (?, '1', ?)").run(migKey, now);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function migrateLegacyWorldPromptColumns(db) {
  const migKey = 'migration:t182_world_prompt_columns_to_state_entries';
  const already = db.prepare('SELECT value FROM internal_meta WHERE key = ?').get(migKey);
  if (already) return;

  const now = Date.now();
  const worlds = db.prepare('SELECT id, system_prompt, post_prompt FROM worlds').all();
  const hasMatchingEntry = db.prepare(`
    SELECT id
    FROM world_prompt_entries
    WHERE world_id = ?
      AND trigger_type = 'always'
      AND position = ?
      AND content = ?
    LIMIT 1
  `);
  const getMaxSortOrder = db.prepare('SELECT MAX(sort_order) AS m FROM world_prompt_entries WHERE world_id = ?');
  const insertEntry = db.prepare(`
    INSERT INTO world_prompt_entries (
      id, world_id, title, description, content, keywords, keyword_scope,
      position, trigger_type, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, '', ?, NULL, 'user,assistant', ?, 'always', ?, ?, ?)
  `);

  db.exec('BEGIN');
  try {
    for (const world of worlds) {
      const entries = [
        { title: '世界系统提示', position: 'system', content: world.system_prompt },
        { title: '世界后置提示词', position: 'post', content: world.post_prompt },
      ].filter((item) => typeof item.content === 'string' && item.content.trim());

      for (const entry of entries) {
        const existing = hasMatchingEntry.get(world.id, entry.position, entry.content);
        if (existing) continue;
        const maxRow = getMaxSortOrder.get(world.id);
        insertEntry.run(
          crypto.randomUUID(),
          world.id,
          entry.title,
          entry.content,
          entry.position,
          (maxRow?.m ?? -1) + 1,
          now,
          now,
        );
      }
    }
    db.prepare("INSERT OR REPLACE INTO internal_meta (key, value, updated_at) VALUES (?, '1', ?)").run(migKey, now);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function migratePersonasMultiPerWorld(db) {
  const migKey = 'migration:personas_multi_per_world';
  const already = db.prepare('SELECT value FROM internal_meta WHERE key = ?').get(migKey);
  if (already) return;

  // 检测当前 personas 表是否仍有 UNIQUE 约束（旧库）
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='personas'").get();
  if (!tableInfo || !tableInfo.sql.includes('UNIQUE')) {
    // 新库无 UNIQUE，直接记录迁移完成
    db.prepare("INSERT OR REPLACE INTO internal_meta (key, value, updated_at) VALUES (?, '1', ?)").run(migKey, Date.now());
    return;
  }

  db.pragma('foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec(`CREATE TABLE personas_new (
      id             TEXT PRIMARY KEY,
      world_id       TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
      name           TEXT NOT NULL DEFAULT '',
      system_prompt  TEXT NOT NULL DEFAULT '',
      avatar_path    TEXT,
      created_at     INTEGER NOT NULL,
      updated_at     INTEGER NOT NULL
    )`);
    db.exec('INSERT INTO personas_new SELECT id, world_id, name, system_prompt, avatar_path, created_at, updated_at FROM personas');
    db.exec('DROP TABLE personas');
    db.exec('ALTER TABLE personas_new RENAME TO personas');
    db.prepare("INSERT OR REPLACE INTO internal_meta (key, value, updated_at) VALUES (?, '1', ?)").run(migKey, Date.now());
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

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

function migrateLegacyStateValueColumns(db) {
  const key = 'migration:t59_split_state_default_and_runtime';
  const applied = db.prepare('SELECT value FROM internal_meta WHERE key = ?').get(key);
  if (applied?.value === '1') return;

  const now = Date.now();
  const hasWorldLegacyCol = db.pragma('table_info(world_state_values)').some((col) => col.name === 'value_json');
  const hasCharLegacyCol = db.pragma('table_info(character_state_values)').some((col) => col.name === 'value_json');
  const hasPersonaLegacyCol = db.pragma('table_info(persona_state_values)').some((col) => col.name === 'value_json');

  db.exec('BEGIN');
  try {
    if (hasWorldLegacyCol) {
      db.exec(`
        UPDATE world_state_values
        SET default_value_json = COALESCE(default_value_json, value_json)
        WHERE default_value_json IS NULL
      `);
    }
    if (hasCharLegacyCol) {
      db.exec(`
        UPDATE character_state_values
        SET default_value_json = COALESCE(default_value_json, value_json)
        WHERE default_value_json IS NULL
      `);
    }
    if (hasPersonaLegacyCol) {
      db.exec(`
        UPDATE persona_state_values
        SET default_value_json = COALESCE(default_value_json, value_json)
        WHERE default_value_json IS NULL
      `);
    }

    db.prepare(`
      INSERT INTO internal_meta (key, value, updated_at)
      VALUES (?, '1', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, now);

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
