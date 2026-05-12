import { randomUUID } from 'node:crypto';

const TABLES = `
CREATE TABLE IF NOT EXISTS worlds (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  temperature       REAL,
  max_tokens        INTEGER,
  active_persona_id TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS session_nearby_characters (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  persona     TEXT NOT NULL DEFAULT '',
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
  plan_doc_content           TEXT NOT NULL DEFAULT '',
  model_context_json         TEXT,
  created_at                 INTEGER NOT NULL,
  current_step_id            TEXT,
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
`;

const INDEXES = `
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
  // T-assistant-resume: 为现有数据库补持久化计划文档正文
  try { db.exec(`ALTER TABLE assistant_tasks ADD COLUMN plan_doc_content TEXT NOT NULL DEFAULT ''`); } catch {}
  // T-chat-writing-resume: 为现有数据库补 session 级流快照字段
  try { db.exec(`ALTER TABLE session_stream_tasks ADD COLUMN streaming_text TEXT NOT NULL DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE session_stream_tasks ADD COLUMN continuing_message_id TEXT`); } catch {}
  try { db.exec(`ALTER TABLE session_stream_tasks ADD COLUMN continuing_text TEXT NOT NULL DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE session_stream_tasks ADD COLUMN options_json TEXT NOT NULL DEFAULT '[]'`); } catch {}
  try { db.exec(`ALTER TABLE session_stream_tasks ADD COLUMN activated_entries_json TEXT NOT NULL DEFAULT '[]'`); } catch {}
  // T-desc: 为现有数据库添加 characters.description / personas.description 列
  try { db.exec(`ALTER TABLE characters ADD COLUMN description TEXT NOT NULL DEFAULT ''`); } catch {}
  try { db.exec(`ALTER TABLE personas ADD COLUMN description TEXT NOT NULL DEFAULT ''`); } catch {}
  // T32: 轮次压缩字段迁移
  try { db.exec(`ALTER TABLE messages ADD COLUMN is_compressed INTEGER NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE sessions ADD COLUMN compressed_context TEXT`); } catch {}
  // T32: 字段迁移完成后才能创建依赖 is_compressed 的索引
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_session_compressed ON messages(session_id, is_compressed, created_at)`); } catch {}
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
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_world_id ON sessions(world_id, mode, created_at)`); } catch {}
  // Task 11 (nearby): 整表删除 writing_session_characters，由 nearby 全面替代
  try { db.exec(`DROP TABLE IF EXISTS writing_session_characters`); } catch {}
  // per-turn 摘要系统：新增 turn_records 表索引
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_turn_records_session ON turn_records(session_id, round_index)`); } catch {}
  // 双模式全局设置：为两张表添加 mode 列（'chat' | 'writing'）
  try { db.exec(`ALTER TABLE custom_css_snippets ADD COLUMN mode TEXT NOT NULL DEFAULT 'chat'`); } catch {}
  try { db.exec(`ALTER TABLE regex_rules ADD COLUMN mode TEXT NOT NULL DEFAULT 'chat'`); } catch {}
  // Prompt 条目：summary → description（触发条件描述），新增 keyword_scope
  try { db.exec(`ALTER TABLE world_prompt_entries RENAME COLUMN summary TO description`); } catch {}
  try { db.exec(`ALTER TABLE world_prompt_entries ADD COLUMN keyword_scope TEXT NOT NULL DEFAULT 'user,assistant'`); } catch {}
  // turn_records 改为指针模式：新增 user_message_id / asst_message_id，移除复制内容字段
  try { db.exec(`ALTER TABLE turn_records ADD COLUMN user_message_id TEXT`); } catch {}
  try { db.exec(`ALTER TABLE turn_records ADD COLUMN asst_message_id TEXT`); } catch {}
  try { db.exec(`ALTER TABLE turn_records DROP COLUMN user_context`); } catch {}
  try { db.exec(`ALTER TABLE turn_records DROP COLUMN asst_context`); } catch {}
  // 状态快照：保存该轮结束时的三层状态，用于 regenerate/删除/编辑后的状态回滚
  try { db.exec(`ALTER TABLE turn_records ADD COLUMN state_snapshot TEXT`); } catch {}
  // 长期记忆文件快照：保存该轮结束时 memory.md 的全文，用于回滚时同步还原长期记忆
  try { db.exec(`ALTER TABLE turn_records ADD COLUMN long_term_memory_snapshot TEXT`); } catch {}
  // 日记系统：sessions 记录创建时的日记模式，daily_entries 存日记元数据
  try { db.exec(`ALTER TABLE sessions ADD COLUMN diary_date_mode TEXT`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_daily_entries_session ON daily_entries(session_id, date_str)`); } catch {}
  // 章节标题系统：写作章节标题持久化
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_chapter_titles_session ON chapter_titles(session_id, chapter_index)`); } catch {}

  migrateLegacyAutoFilledNullStateValues(db);
  // State 引擎 Phase 1：为 world_prompt_entries 新增 position / trigger_type 字段
  try { db.exec("ALTER TABLE world_prompt_entries ADD COLUMN position TEXT NOT NULL DEFAULT 'post'"); } catch (_) {}
  try { db.exec("ALTER TABLE world_prompt_entries ADD COLUMN trigger_type TEXT NOT NULL DEFAULT 'always'"); } catch (_) {}
  migrateTriggerTypeInitial(db);
  migrateDropWorldsLegacyPromptColumns(db);
  // personas 多对一：移除 world_id UNIQUE 约束
  migratePersonasMultiPerWorld(db);
  // 废除触发器三表，新增 entry_conditions 表
  migrateDropTriggerTables(db);
  // worlds 新增 active_persona_id 列
  try { db.exec(`ALTER TABLE worlds ADD COLUMN active_persona_id TEXT`); } catch {}
  // token 字段：条目注入顺序权重（正整数，越大越靠后，默认 1）
  try { db.exec("ALTER TABLE world_prompt_entries ADD COLUMN token INTEGER NOT NULL DEFAULT 1"); } catch (_) {}
  // 删除废弃表：global_prompt_entries / character_prompt_entries
  migrateDropLegacyEntryTables(db);
  // token 消耗统计：messages 表新增 token_usage 字段（JSON 字符串）
  try { db.exec(`ALTER TABLE messages ADD COLUMN token_usage TEXT`); } catch {}
  // next_prompt 选项持久化：messages 表新增 next_options 字段（JSON 数组字符串）
  try { db.exec(`ALTER TABLE messages ADD COLUMN next_options TEXT`); } catch {}
  // 本轮激活的非常驻条目持久化：messages 表新增 activated_entries 字段（JSON 数组字符串）
  try { db.exec(`ALTER TABLE messages ADD COLUMN activated_entries TEXT`); } catch {}
  // worlds 封面图
  try { db.exec(`ALTER TABLE worlds ADD COLUMN cover_path TEXT`); } catch {}
  // worlds 拖拽排序
  try { db.exec(`ALTER TABLE worlds ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`); } catch {}
  migrateWorldsBackfillSortOrder(db);
  // personas 排序字段（CREATE TABLE 已含；旧库通过 ALTER 补列后再创建索引）
  try { db.exec(`ALTER TABLE personas ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_personas_world_id ON personas(world_id, sort_order)`); } catch {}
  // personas 拖拽排序
  try { db.exec(`ALTER TABLE personas ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`); } catch {}
  migratePersonasBackfillSortOrder(db);
  // 状态字段触发方式已取消：自动字段统一每轮更新，删除历史配置列
  migrateDropStateFieldTriggerColumns(db);
  // diary_time 切换到 datetime 类型 + ISO 格式
  migrateDiaryTimeToIso(db);
  // state_fields 加 prefix 列（datetime 显示前缀）
  for (const t of ['world_state_fields', 'character_state_fields', 'persona_state_fields']) {
    try { db.exec(`ALTER TABLE ${t} ADD COLUMN prefix TEXT NOT NULL DEFAULT ''`); } catch {}
  }
  // state_fields 加 table_columns 列（type='table' 时存储列定义 JSON：[{key,label,min?,max?}]）
  for (const t of ['world_state_fields', 'character_state_fields', 'persona_state_fields']) {
    try { db.exec(`ALTER TABLE ${t} ADD COLUMN table_columns TEXT`); } catch {}
  }
  // state_fields 加 unit 列（type='number' 时显示/提示单位，如 元/万元/%）
  for (const t of ['world_state_fields', 'character_state_fields', 'persona_state_fields']) {
    try { db.exec(`ALTER TABLE ${t} ADD COLUMN unit TEXT NOT NULL DEFAULT ''`); } catch {}
  }
  // persona_state_values 按 persona 拆分：UNIQUE 键从 (world_id, field_key) 改为 (persona_id, field_key)
  migratePersonaStateValuesPerPersona(db);
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_persona_state_values_persona_id ON persona_state_values(persona_id, field_key)`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_persona_state_values_world_id ON persona_state_values(world_id, field_key)`); } catch {}
  // enabled 开关：条目可单独禁用，禁用时不注入提示词
  try { db.exec(`ALTER TABLE world_prompt_entries ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1`); } catch {}
  // condition_logic：状态条件逻辑模式（'AND' | 'OR'），默认全部满足（AND）
  try { db.exec(`ALTER TABLE world_prompt_entries ADD COLUMN condition_logic TEXT NOT NULL DEFAULT 'AND'`); } catch {}
  // keyword_logic：关键词命中逻辑（'AND' | 'OR'），仅 trigger_type='keyword' 生效；默认 OR 保持向后兼容
  try { db.exec(`ALTER TABLE world_prompt_entries ADD COLUMN keyword_logic TEXT NOT NULL DEFAULT 'OR'`); } catch {}
  // active_turns：关键词命中后持续生效的轮数（0=永久；1=本轮；N=触发后续 N 轮），默认 1
  try { db.exec(`ALTER TABLE world_prompt_entries ADD COLUMN active_turns INTEGER NOT NULL DEFAULT 1`); } catch {}
  // sessions.keyword_active_state：跨轮持久化关键词激活状态（JSON：{ entry_id: { round, ttl } }）
  try { db.exec(`ALTER TABLE sessions ADD COLUMN keyword_active_state TEXT NOT NULL DEFAULT '{}'`); } catch {}
  // 附近角色：character_state_fields 新增 nearby_enabled 列；旧行由 SQLite 默认值自动填 1
  try { db.exec(`ALTER TABLE character_state_fields ADD COLUMN nearby_enabled INTEGER NOT NULL DEFAULT 1`); } catch {}
  // 附近角色：两张新表的检索索引
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_session_nearby_characters_session_id ON session_nearby_characters(session_id)`); } catch {}
  // 附近角色：memory 列改名为 persona（语义从"与玩家一句话交互总结"改为"一句话人物设定"）
  try {
    const cols = db.prepare(`PRAGMA table_info(session_nearby_characters)`).all();
    const hasMemory = cols.some((c) => c.name === 'memory');
    const hasPersona = cols.some((c) => c.name === 'persona');
    if (hasMemory && !hasPersona) {
      db.exec(`ALTER TABLE session_nearby_characters RENAME COLUMN memory TO persona`);
    }
  } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_session_nearby_character_state_values_nearby_id ON session_nearby_character_state_values(nearby_id, field_key)`); } catch {}
  // 写作会话与玩家卡绑定：sessions.persona_id（仅 writing 使用，chat 维持 NULL）
  try { db.exec(`ALTER TABLE sessions ADD COLUMN persona_id TEXT REFERENCES personas(id) ON DELETE CASCADE`); } catch {}
  try { db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_world_persona ON sessions(world_id, persona_id, mode, updated_at)`); } catch {}
  migrateBackfillWritingSessionPersonaId(db);
}

/**
 * 一次性迁移：为现存 mode='writing' 且 persona_id IS NULL 的 session
 * 回填其世界的 active_persona_id；active 为 NULL 时回退到该世界最早创建的 persona。
 * 没有任何 persona 的世界保持 NULL（后续会被自然清理或拒绝写入）。
 */
function migrateBackfillWritingSessionPersonaId(db) {
  const key = 'migration:writing_session_persona_id_backfill';
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
    const cols = db.pragma(`table_info(${table})`).map((col) => col.name);
    if (cols.includes('trigger_mode')) {
      try { db.exec(`ALTER TABLE ${table} DROP COLUMN trigger_mode`); } catch {}
    }
    const updatedCols = db.pragma(`table_info(${table})`).map((col) => col.name);
    if (updatedCols.includes('trigger_keywords')) {
      try { db.exec(`ALTER TABLE ${table} DROP COLUMN trigger_keywords`); } catch {}
    }
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
  const cols = db.pragma('table_info(worlds)').map((col) => col.name);
  if (cols.includes('system_prompt')) {
    try { db.exec('ALTER TABLE worlds DROP COLUMN system_prompt'); } catch {}
  }
  if (cols.includes('post_prompt')) {
    try { db.exec('ALTER TABLE worlds DROP COLUMN post_prompt'); } catch {}
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
