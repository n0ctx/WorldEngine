import { randomUUID } from 'node:crypto';

import { migrateAppearanceProfileKeys } from './migrations/appearance-profile-keys.js';

const TABLES = `
CREATE TABLE IF NOT EXISTS worlds (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  description           TEXT NOT NULL DEFAULT '',
  temperature           REAL,
  max_tokens            INTEGER,
  active_persona_id     TEXT,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  onboarding_dismissed  INTEGER NOT NULL DEFAULT 0,
  profile_defaults_json TEXT NOT NULL DEFAULT '{}',
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS personas (
  id             TEXT PRIMARY KEY,
  world_id       TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name           TEXT NOT NULL DEFAULT '',
  description    TEXT NOT NULL DEFAULT '',
  system_prompt  TEXT NOT NULL DEFAULT '',
  avatar_path    TEXT,
  profile_defaults_json TEXT NOT NULL DEFAULT '{}',
  sort_order     INTEGER NOT NULL DEFAULT 0,
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
  enum_options       TEXT,
  min_value          REAL,
  max_value          REAL,
  allow_empty        INTEGER NOT NULL DEFAULT 1,
  update_instruction TEXT NOT NULL DEFAULT '',
  prefix             TEXT NOT NULL DEFAULT '',
  unit               TEXT NOT NULL DEFAULT '',
  table_columns      TEXT,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  UNIQUE(world_id, field_key)
);

CREATE TABLE IF NOT EXISTS persona_state_values (
  id             TEXT PRIMARY KEY,
  persona_id     TEXT NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  world_id       TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  field_key      TEXT NOT NULL,
  default_value_json TEXT,
  runtime_value_json TEXT,
  updated_at     INTEGER NOT NULL,
  UNIQUE(persona_id, field_key)
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
  profile_defaults_json TEXT NOT NULL DEFAULT '{}',
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
  state_baseline_json TEXT,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role           TEXT NOT NULL,
  content        TEXT NOT NULL,
  attachments    TEXT,
  created_at     INTEGER NOT NULL
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
  enum_options       TEXT,
  min_value          REAL,
  max_value          REAL,
  allow_empty        INTEGER NOT NULL DEFAULT 1,
  update_instruction TEXT NOT NULL DEFAULT '',
  prefix             TEXT NOT NULL DEFAULT '',
  unit               TEXT NOT NULL DEFAULT '',
  table_columns      TEXT,
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
  enum_options       TEXT,
  min_value          REAL,
  max_value          REAL,
  allow_empty        INTEGER NOT NULL DEFAULT 1,
  update_instruction TEXT NOT NULL DEFAULT '',
  prefix             TEXT NOT NULL DEFAULT '',
  unit               TEXT NOT NULL DEFAULT '',
  table_columns      TEXT,
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

CREATE TABLE IF NOT EXISTS world_prompt_entries (
  id              TEXT PRIMARY KEY,
  world_id        TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  content         TEXT NOT NULL DEFAULT '',
  keywords        TEXT,
  keyword_scope   TEXT NOT NULL DEFAULT 'user,assistant',
  condition_logic TEXT NOT NULL DEFAULT 'AND',
  group_name      TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
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
  scene             TEXT,
  cast_json         TEXT,
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

CREATE TABLE IF NOT EXISTS assistant_tasks (
  id                         TEXT PRIMARY KEY,
  status                     TEXT NOT NULL,
  context_json               TEXT NOT NULL,
  messages_json              TEXT NOT NULL,
  pending_user_messages_json TEXT NOT NULL,
  model_context_json         TEXT,
  context_usage_json         TEXT,
  created_at                 INTEGER NOT NULL,
  error                      TEXT,
  updated_at                 INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS session_stream_tasks (
  id                     TEXT PRIMARY KEY,
  session_id             TEXT NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  mode                   TEXT NOT NULL,
  status                 TEXT NOT NULL,
  messages_json          TEXT NOT NULL,
  streaming_text         TEXT NOT NULL DEFAULT '',
  continuing_message_id  TEXT,
  continuing_text        TEXT NOT NULL DEFAULT '',
  options_json           TEXT NOT NULL,
  activated_entries_json TEXT NOT NULL,
  error                  TEXT,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL
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

CREATE TABLE IF NOT EXISTS provider_safety_events (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  tenant_id TEXT,
  session_id TEXT,
  conversation_id TEXT,
  message_id TEXT,
  internal_request_id TEXT NOT NULL,
  provider_request_id TEXT,
  mode TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  adapter TEXT NOT NULL,
  stream INTEGER NOT NULL DEFAULT 0,
  phase TEXT NOT NULL,
  signal_family TEXT NOT NULL,
  signal_name TEXT NOT NULL,
  severity TEXT NOT NULL,
  action TEXT NOT NULL,
  raw_finish_reason TEXT,
  native_finish_reason TEXT,
  stop_reason TEXT,
  stop_details_json TEXT,
  content_filter_json TEXT,
  gemini_prompt_feedback_json TEXT,
  gemini_safety_ratings_json TEXT,
  minimax_sensitive_meta_json TEXT,
  provider_error_code TEXT,
  provider_error_type TEXT,
  provider_error_message_hash TEXT,
  emitted_chars_before_trigger INTEGER,
  chunk_index INTEGER,
  prompt_hash TEXT,
  output_hash TEXT,
  raw_provider_meta_redacted_json TEXT
);

CREATE TABLE IF NOT EXISTS state_entities (
  row_id           TEXT PRIMARY KEY,
  entity_id        TEXT NOT NULL,
  session_id       TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq              INTEGER NOT NULL,
  type             TEXT NOT NULL,
  name             TEXT NOT NULL,
  aliases_json     TEXT NOT NULL DEFAULT '[]',
  card_id          TEXT REFERENCES characters(id) ON DELETE SET NULL,
  pinned           INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'active',
  valid_from_round INTEGER NOT NULL,
  valid_to_round   INTEGER
);

CREATE TABLE IF NOT EXISTS state_profile_fields (
  row_id           TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  entity_id        TEXT NOT NULL,
  field_key        TEXT NOT NULL,
  value_json       TEXT NOT NULL,
  evidence         TEXT,
  valid_from_round INTEGER NOT NULL,
  valid_to_round   INTEGER
);

CREATE TABLE IF NOT EXISTS state_dynamic (
  row_id           TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  entity_id        TEXT NOT NULL,
  key              TEXT NOT NULL,
  value            TEXT NOT NULL,
  valid_from_round INTEGER NOT NULL,
  valid_to_round   INTEGER
);

CREATE TABLE IF NOT EXISTS state_relations (
  row_id           TEXT PRIMARY KEY,
  relation_id      TEXT NOT NULL,
  session_id       TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq              INTEGER NOT NULL,
  subject_id       TEXT NOT NULL,
  predicate        TEXT NOT NULL,
  object_id        TEXT,
  object_value     TEXT,
  note             TEXT NOT NULL DEFAULT '',
  valid_from_round INTEGER NOT NULL,
  valid_to_round   INTEGER
);

CREATE TABLE IF NOT EXISTS state_threads (
  row_id             TEXT PRIMARY KEY,
  thread_id          TEXT NOT NULL,
  session_id         TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq                INTEGER NOT NULL,
  kind               TEXT NOT NULL,
  participants_json  TEXT NOT NULL DEFAULT '[]',
  content            TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'active',
  opened_round       INTEGER NOT NULL,
  last_touched_round INTEGER NOT NULL DEFAULT 0,
  deadline           TEXT,
  valid_from_round   INTEGER NOT NULL,
  valid_to_round     INTEGER
);

CREATE TABLE IF NOT EXISTS state_world_profile (
  row_id             TEXT PRIMARY KEY,
  session_id         TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  key                TEXT NOT NULL,
  value              TEXT,
  location_entity_id TEXT,
  valid_from_round   INTEGER NOT NULL,
  valid_to_round     INTEGER
);

CREATE TABLE IF NOT EXISTS state_presence (
  session_id       TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  round_index      INTEGER NOT NULL,
  entity_ids_json  TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (session_id, round_index)
);

CREATE TABLE IF NOT EXISTS session_entity_state_values (
  id                 TEXT PRIMARY KEY,
  session_id         TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  entity_id          TEXT NOT NULL,
  field_key          TEXT NOT NULL,
  runtime_value_json TEXT,
  updated_at         INTEGER NOT NULL,
  UNIQUE(entity_id, field_key)
);
`;

const INDEXES = `
CREATE INDEX IF NOT EXISTS idx_provider_safety_events_created_at
  ON provider_safety_events(created_at);
CREATE INDEX IF NOT EXISTS idx_provider_safety_events_provider_created_at
  ON provider_safety_events(provider, created_at);
CREATE INDEX IF NOT EXISTS idx_provider_safety_events_session_created_at
  ON provider_safety_events(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_provider_safety_events_signal_created_at
  ON provider_safety_events(signal_family, signal_name, created_at);
CREATE INDEX IF NOT EXISTS idx_characters_world_id ON characters(world_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_world_state_fields_world_id ON world_state_fields(world_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_world_state_values_world_id ON world_state_values(world_id, field_key);
CREATE INDEX IF NOT EXISTS idx_character_state_fields_world_id ON character_state_fields(world_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_character_state_values_character_id ON character_state_values(character_id, field_key);
CREATE INDEX IF NOT EXISTS idx_world_prompt_entries_world_id ON world_prompt_entries(world_id);
CREATE INDEX IF NOT EXISTS idx_custom_css_snippets_sort_order ON custom_css_snippets(sort_order);
CREATE INDEX IF NOT EXISTS idx_regex_rules_scope ON regex_rules(scope, sort_order);
CREATE INDEX IF NOT EXISTS idx_regex_rules_world_id ON regex_rules(world_id);
CREATE INDEX IF NOT EXISTS idx_persona_state_fields_world_id ON persona_state_fields(world_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_persona_state_values_world_id ON persona_state_values(world_id, field_key);
CREATE INDEX IF NOT EXISTS idx_assistant_tasks_status_updated_at ON assistant_tasks(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_session_stream_tasks_status_updated_at ON session_stream_tasks(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_sessions_world_id ON sessions(world_id);
CREATE INDEX IF NOT EXISTS idx_sessions_character_id ON sessions(character_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_id_created_at ON messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_state_entities_session_valid ON state_entities(session_id, valid_to_round);
CREATE INDEX IF NOT EXISTS idx_state_entities_session_entity ON state_entities(session_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_state_profile_fields_session_valid ON state_profile_fields(session_id, valid_to_round);
CREATE INDEX IF NOT EXISTS idx_state_dynamic_session_valid ON state_dynamic(session_id, valid_to_round);
CREATE INDEX IF NOT EXISTS idx_state_relations_session_valid ON state_relations(session_id, valid_to_round);
CREATE INDEX IF NOT EXISTS idx_state_threads_session_valid ON state_threads(session_id, valid_to_round);
CREATE INDEX IF NOT EXISTS idx_state_world_profile_session_valid ON state_world_profile(session_id, valid_to_round);
`;

/**
 * 结构升级步骤。库的 user_version 记录已执行到第几步，每步只执行一次；
 * 新的结构变更（含给 TABLES 里已有表补列）追加为新步骤，已上线的步骤不改。
 */
const MIGRATIONS = [
  migrateLegacySchema,
  migrateAppearanceProfileKeys,
  // 事项期限（世界日期格式），故事时间过了期限即由机器标为已过期；NULL 表示没有期限。
  (db) => addColumn(db, 'state_threads', 'deadline', 'TEXT'),
  // 写卡助手的上下文占用随任务落库，重启后面板顶栏仍能显示百分比。
  (db) => addColumn(db, 'assistant_tasks', 'context_usage_json', 'TEXT'),
];

export function initSchema(db) {
  const version = db.pragma('user_version', { simple: true });
  if (version < MIGRATIONS.length && !db.memory && hasTables(db)) backupBeforeMigration(db, version);
  db.exec(TABLES);
  for (let step = version; step < MIGRATIONS.length; step++) {
    MIGRATIONS[step](db);
    db.pragma(`user_version = ${step + 1}`);
  }
  db.exec(INDEXES);
}

function hasTables(db) {
  return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' LIMIT 1`).get();
}

/** 升级已有数据的库前，在库文件旁留一份完整副本，升级出错时可手动换回 */
function backupBeforeMigration(db, version) {
  db.prepare('VACUUM INTO ?').run(`${db.name}.v${version}-${Date.now()}.bak`);
}

function columnNames(db, table) {
  return new Set(db.pragma(`table_info(${table})`).map((column) => column.name));
}

/** 列已存在时跳过；其余错误照常抛出 */
function addColumn(db, table, column, definition) {
  if (columnNames(db, table).has(column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/** 列不存在时跳过；其余错误照常抛出 */
function dropColumn(db, table, column) {
  if (!columnNames(db, table).has(column)) return;
  db.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
}

/** 引入版本号之前的历史迁移，每项都可重复执行；旧库首次带版本号启动时整体执行一次 */
function migrateLegacySchema(db) {
  migrateInitialLegacyColumns(db);
  migrateSessionsAndStateValues(db);
  migrateDropCompressionAndSummarySchema(db);
  // 旧 sessions 缺少 world_id，重建后再创建引用该列的索引。
  db.exec(INDEXES);
  migrateSessionAndLegacyTableIndexes(db);
  migrateScopedSettingsAndPromptDescriptions(db);
  migrateTurnRecordsAndDiary(db);
  migratePromptSchema(db);
  migrateMessageMetadata(db);
  migrateSortOrders(db);
  migrateStateFieldSchema(db);
  migratePromptActivationSchema(db);
  migrateNearbyEnabledColumn(db);
  migrateProfileDefaultsColumns(db);
  migrateWritingSessionPersonaSchema(db);
  migrateWorldAppearanceSchema(db);
}

function migrateInitialLegacyColumns(db) {
  // T30: 为现有数据库添加 personas.avatar_path 列（新建库由 CREATE TABLE 覆盖）
  addColumn(db, 'personas', 'avatar_path', 'TEXT');
  // T31: 为现有数据库添加 post_prompt 列（新建库由 CREATE TABLE 覆盖）
  addColumn(db, 'worlds', 'post_prompt', "TEXT NOT NULL DEFAULT ''");
  addColumn(db, 'characters', 'post_prompt', "TEXT NOT NULL DEFAULT ''");
  // T35: 为现有数据库添加 worlds.description 列
  addColumn(db, 'worlds', 'description', "TEXT NOT NULL DEFAULT ''");
  // 写卡助手改为单代理后不再有计划文档 / 审批 / 子代理状态，移除对应列
  for (const column of [
    'plan_doc_content', 'plan_doc_data_json', 'current_step_id', 'last_tool_failure_json',
    'last_subagent_result_json', 'approval_checkpoint_json', 'loop_iteration',
  ]) {
    dropColumn(db, 'assistant_tasks', column);
  }
  // T-chat-writing-resume: 为现有数据库补 session 级流快照字段
  addColumn(db, 'session_stream_tasks', 'streaming_text', "TEXT NOT NULL DEFAULT ''");
  addColumn(db, 'session_stream_tasks', 'continuing_message_id', 'TEXT');
  addColumn(db, 'session_stream_tasks', 'continuing_text', "TEXT NOT NULL DEFAULT ''");
  addColumn(db, 'session_stream_tasks', 'options_json', "TEXT NOT NULL DEFAULT '[]'");
  addColumn(db, 'session_stream_tasks', 'activated_entries_json', "TEXT NOT NULL DEFAULT '[]'");
  // T-desc: 为现有数据库添加 characters.description / personas.description 列
  addColumn(db, 'characters', 'description', "TEXT NOT NULL DEFAULT ''");
  addColumn(db, 'personas', 'description', "TEXT NOT NULL DEFAULT ''");
}

/**
 * 旧上下文压缩结构下线：短期窗口改用未压缩全量消息，长期记忆改用剧情摘要接口，
 * 不再需要 messages.is_compressed / sessions.compressed_context / session_summaries。
 * 删列前须先删引用该列的索引，否则 SQLite 会拒绝 DROP COLUMN。
 */
function migrateDropCompressionAndSummarySchema(db) {
  db.exec(`DROP INDEX IF EXISTS idx_messages_session_compressed`);
  for (const [table, column] of [['messages', 'is_compressed'], ['sessions', 'compressed_context']]) {
    dropColumn(db, table, column);
  }
  db.exec(`DROP TABLE IF EXISTS session_summaries`);
}

function migrateSessionsAndStateValues(db) {
  // T34: sessions 表改造 — character_id 改为 nullable，新增 world_id / mode
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
        created_at          INTEGER NOT NULL,
        updated_at          INTEGER NOT NULL
      )`);
      db.exec(`INSERT INTO sessions_new (id, character_id, world_id, mode, title, created_at, updated_at)
        SELECT id, character_id, NULL, 'chat', title, created_at, updated_at FROM sessions`);
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
  addColumn(db, 'sessions', 'world_id', 'TEXT REFERENCES worlds(id) ON DELETE CASCADE');
  addColumn(db, 'sessions', 'mode', "TEXT NOT NULL DEFAULT 'chat'");
  // T59: 状态值拆分为默认值 + 运行时值；旧 value_json 迁移到 default_value_json
  for (const table of ['world_state_values', 'character_state_values', 'persona_state_values']) {
    addColumn(db, table, 'default_value_json', 'TEXT');
    addColumn(db, table, 'runtime_value_json', 'TEXT');
  }
  migrateLegacyStateValueColumns(db);
}

function migrateSessionAndLegacyTableIndexes(db) {
  // T34: 补充索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_world_id ON sessions(world_id, mode, created_at)`);
  // Task 11 (nearby): 整表删除 writing_session_characters，由 nearby 全面替代
  db.exec(`DROP TABLE IF EXISTS writing_session_characters`);
  // per-turn 摘要系统：新增 turn_records 表索引
  db.exec(`CREATE INDEX IF NOT EXISTS idx_turn_records_session ON turn_records(session_id, round_index)`);
}

function migrateScopedSettingsAndPromptDescriptions(db) {
  // 双模式全局设置：为两张表添加 mode 列（'chat' | 'writing'）
  addColumn(db, 'custom_css_snippets', 'mode', "TEXT NOT NULL DEFAULT 'chat'");
  addColumn(db, 'regex_rules', 'mode', "TEXT NOT NULL DEFAULT 'chat'");
  // Prompt 条目：summary → description（触发条件描述），新增 keyword_scope
  const entryColumns = columnNames(db, 'world_prompt_entries');
  if (entryColumns.has('summary') && !entryColumns.has('description')) {
    db.exec(`ALTER TABLE world_prompt_entries RENAME COLUMN summary TO description`);
  }
  addColumn(db, 'world_prompt_entries', 'keyword_scope', "TEXT NOT NULL DEFAULT 'user,assistant'");
}

function migrateTurnRecordsAndDiary(db) {
  // turn_records 逐步补列：
  //   user_message_id / asst_message_id — 指针模式，替代已移除的复制内容字段
  //   state_snapshot — 该轮结束时的三层状态，用于 regenerate/删除/编辑后的状态回滚
  //   scene / cast_json — 摘要锚点：场景与在场角色，只用于召回时定位
  //   middle_summary / middle_covered_to — 该轮结束时的滚动中期摘要及其覆盖到的轮次，NULL 表示旧数据未生成
  for (const [name, type] of [
    ['user_message_id', 'TEXT'],
    ['asst_message_id', 'TEXT'],
    ['state_snapshot', 'TEXT'],
    ['scene', 'TEXT'],
    ['cast_json', 'TEXT'],
    ['middle_summary', 'TEXT'],
    ['middle_covered_to', 'INTEGER'],
  ]) {
    addColumn(db, 'turn_records', name, type);
  }
  // user_context / asst_context 为已移除的复制内容字段；long_term_memory_snapshot 随
  // 剧情摘要接口取代长期记忆文件而不再需要
  for (const column of ['user_context', 'asst_context', 'long_term_memory_snapshot']) {
    dropColumn(db, 'turn_records', column);
  }
  // 日记系统：sessions 记录创建时的日记模式，daily_entries 存日记元数据
  addColumn(db, 'sessions', 'diary_date_mode', 'TEXT');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_daily_entries_session ON daily_entries(session_id, date_str)`);
  // 章节标题系统：写作章节标题持久化
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chapter_titles_session ON chapter_titles(session_id, chapter_index)`);
}

function migratePromptSchema(db) {
  migrateLegacyAutoFilledNullStateValues(db);
  // State 引擎 Phase 1：为 world_prompt_entries 新增 position / trigger_type 字段
  addColumn(db, 'world_prompt_entries', 'position', "TEXT NOT NULL DEFAULT 'post'");
  addColumn(db, 'world_prompt_entries', 'trigger_type', "TEXT NOT NULL DEFAULT 'always'");
  migrateTriggerTypeInitial(db);
  migrateDropWorldsLegacyPromptColumns(db);
  // personas 多对一：移除 world_id UNIQUE 约束
  migratePersonasMultiPerWorld(db);
  // 废除触发器三表，新增 entry_conditions 表
  migrateDropTriggerTables(db);
  // worlds 新增 active_persona_id 列
  addColumn(db, 'worlds', 'active_persona_id', 'TEXT');
  // token 字段：条目注入顺序权重（正整数，越大越靠后，默认 1）
  addColumn(db, 'world_prompt_entries', 'token', 'INTEGER NOT NULL DEFAULT 1');
  // 删除废弃表：global_prompt_entries / character_prompt_entries
  migrateDropLegacyEntryTables(db);
}

function migrateMessageMetadata(db) {
  // token 消耗统计：messages 表新增 token_usage 字段（JSON 字符串）
  addColumn(db, 'messages', 'token_usage', 'TEXT');
  // next_prompt 选项持久化：messages 表新增 next_options 字段（JSON 数组字符串）
  addColumn(db, 'messages', 'next_options', 'TEXT');
  // 本轮激活的非常驻条目持久化：messages 表新增 activated_entries 字段（JSON 数组字符串）
  addColumn(db, 'messages', 'activated_entries', 'TEXT');
  // 弹幕持久化：messages 表新增 danmaku 字段（JSON 字符串数组）；随消息删除/会话级联清理
  addColumn(db, 'messages', 'danmaku', 'TEXT');
}

function migrateSortOrders(db) {
  // worlds 封面图
  addColumn(db, 'worlds', 'cover_path', 'TEXT');
  // worlds 拖拽排序
  addColumn(db, 'worlds', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');
  migrateWorldsBackfillSortOrder(db);
  // personas 拖拽排序字段（CREATE TABLE 已含；旧库通过 ALTER 补列后再创建索引）
  addColumn(db, 'personas', 'sort_order', 'INTEGER NOT NULL DEFAULT 0');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_personas_world_id ON personas(world_id, sort_order)`);
  migratePersonasBackfillSortOrder(db);
}

function migrateStateFieldSchema(db) {
  // 状态字段触发方式已取消：自动字段统一每轮更新，删除历史配置列
  migrateDropStateFieldTriggerColumns(db);
  // diary_time 切换到 datetime 类型 + ISO 格式
  migrateDiaryTimeToIso(db);
  for (const t of ['world_state_fields', 'character_state_fields', 'persona_state_fields']) {
    // state_fields 加 prefix 列（datetime 显示前缀）
    addColumn(db, t, 'prefix', "TEXT NOT NULL DEFAULT ''");
    // state_fields 加 table_columns 列（type='table' 时存储列定义 JSON：[{key,label,min?,max?}]）
    addColumn(db, t, 'table_columns', 'TEXT');
    // state_fields 加 unit 列（type='number' 时显示/提示单位，如 元/万元/%）
    addColumn(db, t, 'unit', "TEXT NOT NULL DEFAULT ''");
  }
  // persona_state_values 按 persona 拆分：UNIQUE 键从 (world_id, field_key) 改为 (persona_id, field_key)
  migratePersonaStateValuesPerPersona(db);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_persona_state_values_persona_id ON persona_state_values(persona_id, field_key)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_persona_state_values_world_id ON persona_state_values(world_id, field_key)`);
}

function migratePromptActivationSchema(db) {
  // enabled 开关：条目可单独禁用，禁用时不注入提示词
  addColumn(db, 'world_prompt_entries', 'enabled', 'INTEGER NOT NULL DEFAULT 1');
  // condition_logic：状态条件逻辑模式（'AND' | 'OR'），默认全部满足（AND）
  addColumn(db, 'world_prompt_entries', 'condition_logic', "TEXT NOT NULL DEFAULT 'AND'");
  // keyword_logic：关键词命中逻辑（'AND' | 'OR'），仅 trigger_type='keyword' 生效；默认 OR 保持向后兼容
  addColumn(db, 'world_prompt_entries', 'keyword_logic', "TEXT NOT NULL DEFAULT 'OR'");
  // active_turns：关键词命中后持续生效的轮数（0=永久；1=本轮；N=触发后续 N 轮），默认 1
  addColumn(db, 'world_prompt_entries', 'active_turns', 'INTEGER NOT NULL DEFAULT 1');
  // sessions.keyword_active_state：跨轮持久化关键词激活状态（JSON：{ entry_id: { round, ttl } }）
  addColumn(db, 'sessions', 'keyword_active_state', "TEXT NOT NULL DEFAULT '{}'");
}

function migrateNearbyEnabledColumn(db) {
  // 附近角色：character_state_fields 新增 nearby_enabled 列；旧行由 SQLite 默认值自动填 1
  addColumn(db, 'character_state_fields', 'nearby_enabled', 'INTEGER NOT NULL DEFAULT 1');
}

function migrateProfileDefaultsColumns(db) {
  // 角色卡 / 人设的档案初始值（身份、外貌、人格），以及世界卡的开场时间、开场地点，{字段key: 值}
  for (const table of ['characters', 'personas', 'worlds']) {
    addColumn(db, table, 'profile_defaults_json', "TEXT NOT NULL DEFAULT '{}'");
  }
}

function migrateWritingSessionPersonaSchema(db) {
  // 写作会话与玩家卡绑定：sessions.persona_id（仅 writing 使用，chat 维持 NULL）
  addColumn(db, 'sessions', 'persona_id', 'TEXT REFERENCES personas(id) ON DELETE CASCADE');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_world_persona ON sessions(world_id, persona_id, mode, updated_at)`);
  // 首轮前状态基线快照：重生成第一轮（回滚到零残留 turn record）时的回滚锚点，
  // 区分"用户首轮前手动预设"与"被丢弃轮次的污染"。老会话为 NULL → 回滚退回保留现状（向下兼容）。
  addColumn(db, 'sessions', 'state_baseline_json', 'TEXT');
  migrateBackfillWritingSessionPersonaId(db);
}

function migrateWorldAppearanceSchema(db) {
  // 设定条目分组：触发机制从左栏分类维度降级为条目属性，条目改按用户自定义分组导航。
  // 可空，默认 NULL（未分组）；不按 trigger_type 回填，避免"换个名字继续当分类"。
  addColumn(db, 'world_prompt_entries', 'group_name', 'TEXT');
  // 世界主色（"封面即光源"）：从封面图取色后压低饱和度存入，NULL 表示未取色/无封面时走主题默认色。
  addColumn(db, 'worlds', 'accent_color', 'TEXT');
  // 主色来源：'auto'（默认，随封面自动重算）| 'manual'（用户手工指定，封面变化不再覆盖）。
  // 旧库回填为 NULL，读取时按 'auto' 处理。
  addColumn(db, 'worlds', 'accent_source', 'TEXT');
  // 新建世界引导：用户主动关闭引导时置 1，与「三步是否完成」（客观判断，不落库）彻底分开。
  // 关闭后即使三步仍未做完也不再弹出；完成三步则无论是否被关闭过都会消失（判断逻辑见前端）。
  addColumn(db, 'worlds', 'onboarding_dismissed', 'INTEGER NOT NULL DEFAULT 0');
}

/**
 * 一次性迁移：为现存 mode='writing' 且 persona_id IS NULL 的 session
 * 回填其世界的 active_persona_id；active 为 NULL 时回退到该世界最早创建的 persona。
 * 没有任何 persona 的世界保持 NULL（后续会被自然清理或拒绝写入）。
 */
// guard-allow(perf-shape): 一次性数据迁移，由 internal_meta 标记保证只跑一次
function migrateBackfillWritingSessionPersonaId(db) {
  const key = 'migration:writing_session_persona_id_backfill';
  // 事项上次被对话碰到的轮次。旧行用立案轮次回填，不回放历史对话。判断放在这里，避免抬高 initSchema。
  const threadColumns = db.prepare('PRAGMA table_info(state_threads)').all();
  if (!threadColumns.some((column) => column.name === 'last_touched_round')) {
    db.exec('ALTER TABLE state_threads ADD COLUMN last_touched_round INTEGER NOT NULL DEFAULT 0');
    db.exec('UPDATE state_threads SET last_touched_round = opened_round');
  }
  if (db.prepare('SELECT value FROM internal_meta WHERE key = ?').get(key)?.value === '1') return;

  const now = Date.now();
  db.exec('BEGIN');
  try {
    // 第一步：能从 worlds.active_persona_id 或最早 persona 解析出 persona 的，直接回填
    db.prepare(`
      UPDATE sessions
      SET persona_id = (
        SELECT COALESCE(
          w.active_persona_id,
          (SELECT p.id FROM personas p WHERE p.world_id = sessions.world_id ORDER BY p.created_at ASC, p.id ASC LIMIT 1)
        )
        FROM worlds w WHERE w.id = sessions.world_id
      )
      WHERE mode = 'writing' AND persona_id IS NULL AND world_id IS NOT NULL
    `).run();

    // 第二步：仍为 NULL 的写作 session = 该世界没任何 persona。
    // 为这些孤儿 session 各自所在的世界建一张兜底 persona，然后把孤儿挂上去；
    // 否则它们会在 list 接口（按 active persona 过滤）下从 UI 中消失，等同数据丢失。
    const orphanWorlds = db.prepare(`
      SELECT DISTINCT world_id FROM sessions
      WHERE mode = 'writing' AND persona_id IS NULL AND world_id IS NOT NULL
    `).all();
    if (orphanWorlds.length > 0) {
      const insertPersona = db.prepare(`
        INSERT INTO personas (id, world_id, name, description, system_prompt, sort_order, created_at, updated_at)
        VALUES (?, ?, '玩家', '', '', 0, ?, ?)
      `);
      const updateWorldActive = db.prepare(`
        UPDATE worlds SET active_persona_id = ? WHERE id = ? AND active_persona_id IS NULL
      `);
      const reassignSessions = db.prepare(`
        UPDATE sessions SET persona_id = ?
        WHERE mode = 'writing' AND persona_id IS NULL AND world_id = ?
      `);
      for (const row of orphanWorlds) {
        const personaId = randomUUID();
        insertPersona.run(personaId, row.world_id, now, now);
        updateWorldActive.run(personaId, row.world_id);
        reassignSessions.run(personaId, row.world_id);
      }
    }

    db.prepare(`
      INSERT INTO internal_meta (key, value, updated_at) VALUES (?, '1', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, now);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/**
 * 将历史 "N年N月N日N时N分" / "N年N月N日N时" 格式的 diary_time 值转为 ISO 局部时间
 * "YYYY-MM-DDTHH:mm"（4 位年份补零）。无法解析的值置 NULL。
 * 同时把 world_state_fields.type 由 'text' 修正为 'datetime'。
 */
// guard-allow(perf-shape): 一次性数据迁移，由 internal_meta 标记保证只跑一次
// guard-allow(duplication): 已上线的迁移冻结不改，三张表的同形转换保持原样
function migrateDiaryTimeToIso(db) {
  const key = 'migration:diary_time_to_iso_datetime';
  if (db.prepare('SELECT value FROM internal_meta WHERE key = ?').get(key)?.value === '1') return;

  const RE = /^(\d+)年(\d+)月(\d+)日(\d+)时(?:(\d+)分)?$/;
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const toIso = (raw) => {
    if (raw == null) return null;
    let str = raw;
    try { const parsed = JSON.parse(raw); if (typeof parsed === 'string') str = parsed; } catch {}
    if (typeof str !== 'string') return null;
    const m = str.match(RE);
    if (!m) return null;
    return `${pad(m[1], 4)}-${pad(m[2])}-${pad(m[3])}T${pad(m[4])}:${pad(m[5] ?? 0)}`;
  };
  // 字段层 default_value 是裸字符串（非 JSON），单独处理
  const toIsoBare = (raw) => {
    if (typeof raw !== 'string') return null;
    const m = raw.match(RE);
    if (!m) return null;
    return `${pad(m[1], 4)}-${pad(m[2])}-${pad(m[3])}T${pad(m[4])}:${pad(m[5] ?? 0)}`;
  };

  db.exec('BEGIN');
  try {
    // world_state_fields：type 升级 + default_value 文本转 ISO
    const fieldRows = db.prepare(
      `SELECT id, type, default_value FROM world_state_fields WHERE field_key = 'diary_time'`
    ).all();
    const updField = db.prepare(
      `UPDATE world_state_fields SET type = 'datetime', default_value = ?, updated_at = ? WHERE id = ?`
    );
    const now = Date.now();
    for (const row of fieldRows) {
      const iso = toIsoBare(row.default_value) ?? (row.default_value && /^\d+-\d{2}-\d{2}T\d{2}:\d{2}$/.test(row.default_value) ? row.default_value : null);
      updField.run(iso, now, row.id);
    }

    // world_state_values：default_value_json / runtime_value_json
    const valueRows = db.prepare(
      `SELECT id, default_value_json, runtime_value_json FROM world_state_values
       WHERE field_key = 'diary_time'`
    ).all();
    const updValue = db.prepare(
      `UPDATE world_state_values SET default_value_json = ?, runtime_value_json = ?, updated_at = ? WHERE id = ?`
    );
    for (const row of valueRows) {
      const dIso = toIso(row.default_value_json);
      const rIso = toIso(row.runtime_value_json);
      const dOut = dIso != null ? JSON.stringify(dIso) : (looksIsoJson(row.default_value_json) ? row.default_value_json : null);
      const rOut = rIso != null ? JSON.stringify(rIso) : (looksIsoJson(row.runtime_value_json) ? row.runtime_value_json : null);
      updValue.run(dOut, rOut, now, row.id);
    }

    // session_world_state_values：runtime_value_json
    const sessionRows = db.prepare(
      `SELECT id, runtime_value_json FROM session_world_state_values
       WHERE field_key = 'diary_time'`
    ).all();
    const updSession = db.prepare(
      `UPDATE session_world_state_values SET runtime_value_json = ?, updated_at = ? WHERE id = ?`
    );
    for (const row of sessionRows) {
      const iso = toIso(row.runtime_value_json);
      const out = iso != null ? JSON.stringify(iso) : (looksIsoJson(row.runtime_value_json) ? row.runtime_value_json : null);
      updSession.run(out, now, row.id);
    }

    db.prepare(`
      INSERT INTO internal_meta (key, value, updated_at) VALUES (?, '1', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, now);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function looksIsoJson(raw) {
  if (raw == null) return false;
  try {
    const v = JSON.parse(raw);
    return typeof v === 'string' && /^\d+-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v);
  } catch {
    return false;
  }
}

function migrateDropStateFieldTriggerColumns(db) {
  const tables = ['world_state_fields', 'character_state_fields', 'persona_state_fields'];
  for (const table of tables) {
    dropColumn(db, table, 'trigger_mode');
    dropColumn(db, table, 'trigger_keywords');
  }
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

function migrateDropWorldsLegacyPromptColumns(db) {
  dropColumn(db, 'worlds', 'system_prompt');
  dropColumn(db, 'worlds', 'post_prompt');
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

function migrateDropLegacyEntryTables(db) {
  const migKey = 'migration:drop_legacy_entry_tables';
  const already = db.prepare('SELECT value FROM internal_meta WHERE key = ?').get(migKey);
  if (already) return;

  db.exec('DROP TABLE IF EXISTS character_prompt_entries');
  db.exec('DROP TABLE IF EXISTS global_prompt_entries');

  db.prepare("INSERT OR REPLACE INTO internal_meta (key, value, updated_at) VALUES (?, '1', ?)")
    .run(migKey, Date.now());
}

function migrateWorldsBackfillSortOrder(db) {
  const key = 'migration:worlds_backfill_sort_order';
  const applied = db.prepare('SELECT value FROM internal_meta WHERE key = ?').get(key);
  if (applied?.value === '1') return;

  const now = Date.now();
  const rows = db.prepare('SELECT id FROM worlds ORDER BY created_at ASC, id ASC').all();
  const upd = db.prepare('UPDATE worlds SET sort_order = ? WHERE id = ?');
  const tx = db.transaction(() => {
    rows.forEach((row, idx) => upd.run(idx, row.id));
    db.prepare(`
      INSERT INTO internal_meta (key, value, updated_at)
      VALUES (?, '1', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, now);
  });
  tx();
}

// guard-allow(duplication): 已上线的迁移冻结不改，与 migrateWorldsBackfillSortOrder 同形
function migratePersonasBackfillSortOrder(db) {
  const key = 'migration:personas_backfill_sort_order';
  const applied = db.prepare('SELECT value FROM internal_meta WHERE key = ?').get(key);
  if (applied?.value === '1') return;

  const now = Date.now();
  const rows = db.prepare('SELECT id FROM personas ORDER BY created_at ASC, id ASC').all();
  const upd = db.prepare('UPDATE personas SET sort_order = ? WHERE id = ?');
  const tx = db.transaction(() => {
    rows.forEach((row, idx) => upd.run(idx, row.id));
    db.prepare(`
      INSERT INTO internal_meta (key, value, updated_at)
      VALUES (?, '1', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, now);
  });
  tx();
}

function migratePersonaStateValuesPerPersona(db) {
  const migKey = 'migration:persona_state_values_per_persona';
  const already = db.prepare('SELECT value FROM internal_meta WHERE key = ?').get(migKey);
  if (already) return;

  const cols = db.pragma('table_info(persona_state_values)').map((c) => c.name);
  if (cols.includes('persona_id')) {
    // 新建库 DDL 已包含 persona_id，直接标记完成
    db.prepare("INSERT OR REPLACE INTO internal_meta (key, value, updated_at) VALUES (?, '1', ?)").run(migKey, Date.now());
    return;
  }

  // 旧库迁移：表重建，UNIQUE 从 (world_id, field_key) 改为 (persona_id, field_key)
  db.pragma('foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    db.exec(`CREATE TABLE persona_state_values_new (
      id             TEXT PRIMARY KEY,
      persona_id     TEXT NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
      world_id       TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
      field_key      TEXT NOT NULL,
      default_value_json TEXT,
      runtime_value_json TEXT,
      updated_at     INTEGER NOT NULL,
      UNIQUE(persona_id, field_key)
    )`);
    // 将旧行挂到该世界当前 active_persona；无 active_persona 则取最早创建的 persona
    db.exec(`
      INSERT INTO persona_state_values_new (id, persona_id, world_id, field_key, default_value_json, runtime_value_json, updated_at)
      SELECT
        psv.id,
        COALESCE(w.active_persona_id,
          (SELECT p.id FROM personas p WHERE p.world_id = psv.world_id ORDER BY p.created_at ASC, p.id ASC LIMIT 1)
        ) AS persona_id,
        psv.world_id,
        psv.field_key,
        psv.default_value_json,
        psv.runtime_value_json,
        psv.updated_at
      FROM persona_state_values psv
      JOIN worlds w ON w.id = psv.world_id
      WHERE COALESCE(w.active_persona_id,
        (SELECT p2.id FROM personas p2 WHERE p2.world_id = psv.world_id ORDER BY p2.created_at ASC, p2.id ASC LIMIT 1)
      ) IS NOT NULL
    `);
    db.exec('DROP TABLE persona_state_values');
    db.exec('ALTER TABLE persona_state_values_new RENAME TO persona_state_values');
    db.prepare("INSERT OR REPLACE INTO internal_meta (key, value, updated_at) VALUES (?, '1', ?)").run(migKey, Date.now());
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    db.pragma('foreign_keys = ON');
  }
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
