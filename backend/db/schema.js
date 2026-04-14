const TABLES = `
CREATE TABLE IF NOT EXISTS worlds (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  system_prompt  TEXT NOT NULL DEFAULT '',
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
  first_message  TEXT NOT NULL DEFAULT '',
  avatar_path    TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id             TEXT PRIMARY KEY,
  character_id   TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  title          TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role           TEXT NOT NULL,
  content        TEXT NOT NULL,
  attachments    TEXT,
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
  content        TEXT NOT NULL,
  is_compressed  INTEGER NOT NULL DEFAULT 0,
  seq            INTEGER NOT NULL,
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
`;

export function initSchema(db) {
  db.exec(TABLES);
  db.exec(INDEXES);
}
