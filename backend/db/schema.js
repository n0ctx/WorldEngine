const TABLES = `
CREATE TABLE IF NOT EXISTS worlds (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  system_prompt  TEXT NOT NULL DEFAULT '',
  post_prompt    TEXT NOT NULL DEFAULT '',
  temperature    REAL,
  max_tokens     INTEGER,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS personas (
  id             TEXT PRIMARY KEY,
  world_id       TEXT NOT NULL UNIQUE REFERENCES worlds(id) ON DELETE CASCADE,
  name           TEXT NOT NULL DEFAULT '',
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
  value_json     TEXT,
  updated_at     INTEGER NOT NULL,
  UNIQUE(world_id, field_key)
);

CREATE TABLE IF NOT EXISTS characters (
  id             TEXT PRIMARY KEY,
  world_id       TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS world_timeline (
  id             TEXT PRIMARY KEY,
  world_id       TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  session_id     TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  content        TEXT NOT NULL,
  is_compressed  INTEGER NOT NULL DEFAULT 0,
  seq            INTEGER NOT NULL,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL DEFAULT 0
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
  value_json     TEXT,
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
  value_json     TEXT,
  updated_at     INTEGER NOT NULL,
  UNIQUE(character_id, field_key)
);

CREATE TABLE IF NOT EXISTS global_prompt_entries (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  summary        TEXT NOT NULL DEFAULT '',
  content        TEXT NOT NULL DEFAULT '',
  keywords       TEXT,
  embedding_id   TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS world_prompt_entries (
  id             TEXT PRIMARY KEY,
  world_id       TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  summary        TEXT NOT NULL DEFAULT '',
  content        TEXT NOT NULL DEFAULT '',
  keywords       TEXT,
  embedding_id   TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS character_prompt_entries (
  id             TEXT PRIMARY KEY,
  character_id   TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  summary        TEXT NOT NULL DEFAULT '',
  content        TEXT NOT NULL DEFAULT '',
  keywords       TEXT,
  embedding_id   TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS custom_css_snippets (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  enabled        INTEGER NOT NULL DEFAULT 1,
  content        TEXT NOT NULL DEFAULT '',
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
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
`;

const INDEXES = `
CREATE INDEX IF NOT EXISTS idx_characters_world_id ON characters(world_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_world_timeline_world_id ON world_timeline(world_id, seq);
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
CREATE INDEX IF NOT EXISTS idx_writing_session_characters_session_id ON writing_session_characters(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_world_id ON sessions(world_id, mode, created_at);
`;

export function initSchema(db) {
  db.exec(TABLES);
  db.exec(INDEXES);
  // T30: 为现有数据库添加 personas.avatar_path 列（新建库由 CREATE TABLE 覆盖）
  try { db.exec(`ALTER TABLE personas ADD COLUMN avatar_path TEXT`); } catch {}
  // T31: 为现有数据库添加 post_prompt 列（新建库由 CREATE TABLE 覆盖）
  try { db.exec(`ALTER TABLE worlds ADD COLUMN post_prompt TEXT NOT NULL DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE characters ADD COLUMN post_prompt TEXT NOT NULL DEFAULT ''`); } catch {}
  // T32: 轮次压缩字段迁移
  try { db.exec(`ALTER TABLE messages ADD COLUMN is_compressed INTEGER NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE sessions ADD COLUMN compressed_context TEXT`); } catch {}
  try { db.exec(`ALTER TABLE world_timeline ADD COLUMN session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE`); } catch {}
  try { db.exec(`ALTER TABLE world_timeline ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0`); } catch {}
  // T32: 字段迁移完成后才能创建依赖 is_compressed 的索引
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_session_compressed ON messages(session_id, is_compressed, created_at)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_world_timeline_session_id ON world_timeline(world_id, session_id)`); } catch {}
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
  // T34: 补充索引
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_writing_session_characters_session_id ON writing_session_characters(session_id)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_world_id ON sessions(world_id, mode, created_at)`); } catch {}
}
