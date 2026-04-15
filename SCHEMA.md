# WorldEngine — 数据库 Schema

## 总览

### 存储分工

| 数据类型 | 存储位置 |
|---|---|
| 结构化数据（世界、角色、会话、消息等） | SQLite（`worldengine.db`）|
| Prompt 条目 embedding 向量 | JSON 文件（`/data/vectors/`）|
| 头像、附件图片、上传文件 | 本地文件（`/data/uploads/`）|
| 全局配置（API Key、字号等） | JSON 文件（`/data/config.json`）|

### 文件目录结构

```
/data
  worldengine.db         # SQLite 数据库
  config.json            # 全局配置
  /uploads
    /avatars             # 角色头像，文件名：{character_id}.{ext}
    /attachments         # 消息附件，文件名：{message_id}_{index}.{ext}
  /vectors
    prompt_entries.json  # Prompt 条目的 embedding 向量索引
```

### 删除策略

- 删除世界 → 级联删除其下所有角色、会话、消息、时间线条目、Prompt 条目
- 删除角色 → 级联删除其下所有会话、消息、Prompt 条目，清空对应头像文件
- 删除会话 → 级联删除其下所有消息、summary，清空对应附件文件
- 删除消息 → 清空对应附件文件
- 所有删除均为硬删除，无软删除

级联删除由 SQLite 外键约束（`ON DELETE CASCADE`）自动处理，不在业务代码中手动实现。

---

## 表结构

### worlds — 世界

```sql
CREATE TABLE worlds (
  id             TEXT PRIMARY KEY,          -- UUID
  name           TEXT NOT NULL,
  system_prompt  TEXT NOT NULL DEFAULT '',  -- 世界层 system prompt，注入 [2] 位置
  post_prompt    TEXT NOT NULL DEFAULT '',  -- 世界层后置提示词，注入 [8] 位置（user 角色）
  temperature    REAL,                      -- 生成参数覆盖，NULL 时使用全局配置
  max_tokens     INTEGER,                   -- 生成参数覆盖，NULL 时使用全局配置
  created_at     INTEGER NOT NULL,          -- Unix 时间戳（毫秒）
  updated_at     INTEGER NOT NULL
);
```

> 玩家（Persona）已从 worlds 表移出到独立的 `personas` 表（见下），每个世界一对一持有一条 persona 记录。

---

### personas — 玩家（用户代入身份）

每个世界一对一持有一条 persona 记录（`world_id UNIQUE`）。创建世界时由业务层自动初始化一条空记录。

```sql
CREATE TABLE personas (
  id             TEXT PRIMARY KEY,          -- UUID
  world_id       TEXT NOT NULL UNIQUE REFERENCES worlds(id) ON DELETE CASCADE,
  name           TEXT NOT NULL DEFAULT '',  -- 玩家在该世界的称呼
  system_prompt  TEXT NOT NULL DEFAULT '',  -- 玩家人设描述，注入到 [2] 位置
  avatar_path    TEXT,                      -- 头像相对路径（T30）
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
```

---

### persona_state_fields — 玩家状态字段定义

字段模板属于 world（类似 character_state_fields 的归属方式），所有字段复制自 character_state_fields 的结构。

```sql
CREATE TABLE persona_state_fields (
  id                 TEXT PRIMARY KEY,
  world_id           TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  field_key          TEXT NOT NULL,
  label              TEXT NOT NULL,
  type               TEXT NOT NULL,             -- 'text' | 'number' | 'boolean' | 'enum'
  description        TEXT NOT NULL DEFAULT '',
  default_value      TEXT,
  update_mode        TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'llm_auto'
  trigger_mode       TEXT NOT NULL DEFAULT 'manual_only', -- 'manual_only' | 'every_turn' | 'keyword_based'
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

CREATE INDEX idx_persona_state_fields_world_id ON persona_state_fields(world_id, sort_order);
```

---

### persona_state_values — 玩家状态当前值

一个 world 一份当前值（和 world_state_values 的粒度一致，因为一个 world 只有一个 persona）。

```sql
CREATE TABLE persona_state_values (
  id             TEXT PRIMARY KEY,
  world_id       TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  field_key      TEXT NOT NULL,
  value_json     TEXT,                      -- 统一按 JSON 字符串存储
  updated_at     INTEGER NOT NULL,
  UNIQUE(world_id, field_key)
);

CREATE INDEX idx_persona_state_values_world_id ON persona_state_values(world_id, field_key);
```

---

### characters — 角色

```sql
CREATE TABLE characters (
  id             TEXT PRIMARY KEY,          -- UUID
  world_id       TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  system_prompt  TEXT NOT NULL DEFAULT '',  -- 角色层 system prompt，注入 [4] 位置
  post_prompt    TEXT NOT NULL DEFAULT '',  -- 角色层后置提示词，注入 [8] 位置（user 角色）
  first_message  TEXT NOT NULL DEFAULT '',  -- 会话创建时自动插入的开场白，为空则不插入
  avatar_path    TEXT,                      -- 相对路径，如 avatars/abc123.png，无头像则 NULL
  sort_order     INTEGER NOT NULL DEFAULT 0, -- 同世界下角色的显示排序，支持拖拽修改
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX idx_characters_world_id ON characters(world_id, sort_order);
```

---

### sessions — 会话

```sql
CREATE TABLE sessions (
  id                  TEXT PRIMARY KEY,          -- UUID
  character_id        TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  title               TEXT,                      -- 会话标题，NULL 时前端显示 created_at 对应的日期（如 2024-01-15）
  compressed_context  TEXT,                      -- T32：压缩触发时快照的摘要文本；assembler.js 在 [6] 之前注入；清空聊天时置 NULL
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL           -- 最后一条消息的时间，用于排序
);
```

---

### messages — 消息

```sql
CREATE TABLE messages (
  id             TEXT PRIMARY KEY,          -- UUID
  session_id     TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role           TEXT NOT NULL,             -- 'user' | 'assistant' | 'system'
  content        TEXT NOT NULL,             -- 消息正文
  attachments    TEXT,                      -- JSON 数组，相对路径列表，无附件则 NULL
                                            -- 例：["attachments/msg1_0.png", "attachments/msg1_1.pdf"]
  is_compressed  INTEGER NOT NULL DEFAULT 0, -- T32：0=未压缩（送入 LLM），1=已压缩（仅存档）
  created_at     INTEGER NOT NULL           -- 消息发送时间，用于排序
);

CREATE INDEX idx_messages_session_compressed ON messages(session_id, is_compressed, created_at);
```

content 字段更新规则（/continue 操作场景）：更新时在 Service 层读出完整 content，在内存中拼接新内容，将完整字符串写回，不使用 SQL 字符串拼接，避免并发问题。

---

### session_summaries — 会话摘要

每个 session 至多一条 summary，summary 由异步队列生成，不阻塞对话。

```sql
CREATE TABLE session_summaries (
  id             TEXT PRIMARY KEY,          -- UUID
  session_id     TEXT NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  content        TEXT NOT NULL,             -- LLM 生成的摘要文本
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL           -- 每次重新生成时更新
);
```

---

### world_timeline — 世界时间线

T32 起重新设计：不再是"时序事件列表"，改为"该世界所有历史会话的摘要档案"，每个 session 对应一行（one-row-per-session）。每次压缩或手动 /summary 时 upsert（同 session 覆盖，不追加新行）。

```sql
CREATE TABLE world_timeline (
  id             TEXT PRIMARY KEY,          -- UUID
  world_id       TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  session_id     TEXT REFERENCES sessions(id) ON DELETE CASCADE, -- T32：关联 session，NULL 表示旧格式条目
  content        TEXT NOT NULL,             -- T32 后：该 session 的摘要文本；T32 前：事件一句话描述
  is_compressed  INTEGER NOT NULL DEFAULT 0, -- 保留字段，T32 后不再使用
  seq            INTEGER NOT NULL,          -- 插入顺序编号（T32 后仍维持单调递增，用于兜底排序）
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL DEFAULT 0  -- T32：最后 upsert 时间；recall.js 按此排序取最近 N 条
);

CREATE INDEX idx_world_timeline_world_id ON world_timeline(world_id, seq);
CREATE INDEX idx_world_timeline_session_id ON world_timeline(world_id, session_id);
```

upsert 规则：`upsertSessionTimeline(worldId, sessionId, content)` 先查 `world_id + session_id` 是否存在，存在则 UPDATE content/updated_at，不存在则 INSERT（seq 取 MAX+1）。  
前端记忆面板展示最新 5 条（按 updated_at DESC），格式：`- 【日期 · 会话标题】摘要内容`。

---

### world_state_fields — 世界状态字段定义

```sql
CREATE TABLE world_state_fields (
  id                 TEXT PRIMARY KEY,
  world_id           TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  field_key          TEXT NOT NULL,
  label              TEXT NOT NULL,
  type               TEXT NOT NULL,             -- 'text' | 'number' | 'boolean' | 'enum'
  description        TEXT NOT NULL DEFAULT '',  -- 给 LLM 的字段说明
  default_value      TEXT,                      -- 统一以 JSON 字符串存储，读取时解析
  update_mode        TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'llm_auto' | 'system_rule'
  trigger_mode       TEXT NOT NULL DEFAULT 'manual_only', -- 'manual_only' | 'every_turn' | 'keyword_based'
  trigger_keywords   TEXT,                      -- JSON 字符串数组或 NULL
  enum_options       TEXT,                      -- JSON 字符串数组或 NULL
  min_value          REAL,
  max_value          REAL,
  allow_empty        INTEGER NOT NULL DEFAULT 1,
  update_instruction TEXT NOT NULL DEFAULT '',
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  UNIQUE(world_id, field_key)
);

CREATE INDEX idx_world_state_fields_world_id ON world_state_fields(world_id, sort_order);
```

---

### world_state_values — 世界状态当前值

```sql
CREATE TABLE world_state_values (
  id             TEXT PRIMARY KEY,
  world_id       TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  field_key      TEXT NOT NULL,
  value_json     TEXT,                      -- 当前值，统一按 JSON 字符串存储
  updated_at     INTEGER NOT NULL,
  UNIQUE(world_id, field_key)
);

CREATE INDEX idx_world_state_values_world_id ON world_state_values(world_id, field_key);
```

---

### character_state_fields — 角色状态字段定义

```sql
CREATE TABLE character_state_fields (
  id                 TEXT PRIMARY KEY,
  world_id           TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  field_key          TEXT NOT NULL,
  label              TEXT NOT NULL,
  type               TEXT NOT NULL,             -- 'text' | 'number' | 'boolean' | 'enum'
  description        TEXT NOT NULL DEFAULT '',
  default_value      TEXT,
  update_mode        TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'llm_auto'
  trigger_mode       TEXT NOT NULL DEFAULT 'manual_only', -- 'manual_only' | 'every_turn' | 'keyword_based'
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

CREATE INDEX idx_character_state_fields_world_id ON character_state_fields(world_id, sort_order);
```

---

### character_state_values — 角色状态当前值

```sql
CREATE TABLE character_state_values (
  id             TEXT PRIMARY KEY,
  character_id   TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  field_key      TEXT NOT NULL,
  value_json     TEXT,
  updated_at     INTEGER NOT NULL,
  UNIQUE(character_id, field_key)
);

CREATE INDEX idx_character_state_values_character_id ON character_state_values(character_id, field_key);
```

---

### global_prompt_entries — 全局 Prompt 条目

```sql
CREATE TABLE global_prompt_entries (
  id             TEXT PRIMARY KEY,          -- UUID
  title          TEXT NOT NULL,
  summary        TEXT NOT NULL DEFAULT '',  -- ~50字简介，用于未触发时注入
  content        TEXT NOT NULL DEFAULT '',  -- 完整正文，触发时注入
  keywords       TEXT,                      -- JSON 字符串数组，兜底触发用，NULL 表示不启用关键词匹配
                                            -- 例：["魔法", "法术", "咒语"]
  embedding_id   TEXT,                      -- 对应 vectors/prompt_entries.json 中的条目 ID，NULL 表示尚未向量化
  sort_order     INTEGER NOT NULL DEFAULT 0, -- 同层条目的显示排序
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
```

---

### world_prompt_entries — 世界 Prompt 条目

```sql
CREATE TABLE world_prompt_entries (
  id             TEXT PRIMARY KEY,
  world_id       TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  summary        TEXT NOT NULL DEFAULT '',
  content        TEXT NOT NULL DEFAULT '',
  keywords       TEXT,                      -- JSON 字符串数组或 NULL
  embedding_id   TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX idx_world_prompt_entries_world_id ON world_prompt_entries(world_id);
```

---

### character_prompt_entries — 角色 Prompt 条目

```sql
CREATE TABLE character_prompt_entries (
  id             TEXT PRIMARY KEY,
  character_id   TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  summary        TEXT NOT NULL DEFAULT '',
  content        TEXT NOT NULL DEFAULT '',
  keywords       TEXT,                      -- JSON 字符串数组或 NULL
  embedding_id   TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX idx_character_prompt_entries_character_id ON character_prompt_entries(character_id);
```

---

### custom_css_snippets — 自定义 CSS 片段

用于前端外观自定义。多条片段独立启用/禁用，启用项按 `sort_order` 拼接后注入 DOM 的 `<style id="we-custom-css">`。全部为全局作用，不与世界/角色绑定。

```sql
CREATE TABLE custom_css_snippets (
  id             TEXT PRIMARY KEY,          -- UUID
  name           TEXT NOT NULL,             -- 片段显示名
  enabled        INTEGER NOT NULL DEFAULT 1, -- 0: 禁用 / 1: 启用
  content        TEXT NOT NULL DEFAULT '',  -- CSS 源文本，原样注入
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX idx_custom_css_snippets_sort_order ON custom_css_snippets(sort_order);
```

> 前端拉取所有 `enabled=1` 条目，按 `sort_order ASC, created_at ASC` 拼接为一段 CSS 文本注入。禁用条目保留数据库中记录，不参与注入。

---

### regex_rules — 正则替换规则

对标 SillyTavern Regex 扩展的能力。每条规则按 `scope` 指定作用时机，按 `world_id` 决定作用范围（全局或仅某世界）。

```sql
CREATE TABLE regex_rules (
  id             TEXT PRIMARY KEY,          -- UUID
  name           TEXT NOT NULL,             -- 规则显示名
  enabled        INTEGER NOT NULL DEFAULT 1, -- 0: 禁用 / 1: 启用
  pattern        TEXT NOT NULL,             -- JavaScript 正则 source（不含 / 分隔符和 flags）
  replacement    TEXT NOT NULL DEFAULT '',  -- 替换文本，支持 $1 $2 等回引
  flags          TEXT NOT NULL DEFAULT 'g', -- 正则 flags，如 'g' / 'gi' / 'gm' / 'gim'
  scope          TEXT NOT NULL,             -- 作用时机，见下文四类
  world_id       TEXT REFERENCES worlds(id) ON DELETE CASCADE, -- NULL: 全局生效；非 NULL: 仅此世界
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX idx_regex_rules_scope ON regex_rules(scope, sort_order);
CREATE INDEX idx_regex_rules_world_id ON regex_rules(world_id);
```

**scope 取值与作用位置**：

| scope | 作用时机 | 影响存库 | 影响显示 | 影响 LLM prompt |
|---|---|---|---|---|
| `user_input` | 前端发送前处理用户消息文本 | 是 | 是 | 是 |
| `ai_output` | 后端流式完结后、写入 `messages` 前处理 assistant 文本 | 是 | 是 | 是 |
| `display_only` | 前端渲染消息时即时处理，仅影响视觉 | 否 | 是 | 否 |
| `prompt_only` | 后端 `assembler.js` 组装 [7] 历史消息时处理，仅影响送入 LLM 的副本 | 否 | 否 | 是 |

> 这是 `assembler.js` 继 T21 之后第二个**明确允许**的修改点，仅限 [7] 历史消息位置对 `prompt_only` 规则调用 `regex-runner.applyRules()`，其它位置禁止改动。

**执行规则**：

- 同 scope 内按 `sort_order ASC` 顺序依次套用（链式），前一条结果作为后一条输入
- `world_id IS NULL` 的规则对所有世界生效；`world_id` 非空的规则仅在该世界的会话中生效，两类规则混合时仍按 `sort_order` 统一排序
- 规则无效（pattern 编译失败、flags 非法）时跳过该条并在后端日志记录，不中断整条管线
- `enabled=0` 的规则不执行，保留数据库记录

---

## 向量文件结构

路径：`/data/vectors/prompt_entries.json`

由 vectra 风格的本地向量库管理，结构如下：

```json
{
  "version": 1,
  "entries": [
    {
      "id": "uuid",
      "source_id": "prompt_entry 的 id",
      "source_table": "global_prompt_entries | world_prompt_entries | character_prompt_entries",
      "vector": [0.123, -0.456, ...],      // embedding 向量，float 数组
      "updated_at": 1710000000000
    }
  ]
}
```

条目创建或内容修改时，后端异步更新此文件中对应条目的向量。  
条目删除时，同步从此文件中移除对应条目。  
向量计算完成后，将 `embedding_id` 写回对应的 prompt_entries 表。`embedding_id` 为 NULL 表示尚未向量化，触发时只走关键词匹配兜底。

---

## 全局配置文件结构

路径：`/data/config.json`

```json
{
  "version": 1,
  "llm": {
    "provider": "openai",                  // "openai" | "anthropic" | "gemini" | "openrouter" | "glm" | "kimi" | "minimax" | "deepseek" | "grok" | "siliconflow" | "ollama" | "lmstudio"
    "api_key": "",                         // 云端 API Key，本地模型留空
    "base_url": "",                        // 自定义 API base URL，留空使用各 provider 默认值
    "model": "",                           // 模型名称
    "max_tokens": 4096,
    "temperature": 0.8
  },
  "embedding": {
    "provider": "openai",                  // "openai" | "ollama" | null（null 表示不启用 embedding）
    "api_key": "",
    "base_url": "",
    "model": "text-embedding-3-small"
  },
  "ui": {
    "font_size": 16
  },
  "context_compress_rounds": 10,   // 历史消息保留轮次，0 表示禁用，仅用 token 截断兜底
  "global_system_prompt": ""              // 全局层 system prompt
}
```

> API Key 存在本地文件，不进数据库，不随 JSON 导出一起导出。导出时此字段自动清空。

## 导入导出 JSON 格式

### 角色卡格式：.wechar.json

```json
{
  "format": "worldengine-character-v1",
  "character": {
    "name": "角色名",
    "system_prompt": "",
    "first_message": "",
    "avatar_path": null
  },
  "prompt_entries": [
    {
      "title": "",
      "summary": "",
      "content": "",
      "keywords": [],
      "sort_order": 0
    }
  ],
  "character_state_values": [
    {
      "field_key": "mood",
      "value_json": "\"平静\""
    }
  ]
}
```

约束：
- 不包含数据库 id、character_id、world_id、embedding_id、created_at、updated_at
- `avatar_path` 仅用于导出时指示是否有头像；若实际导出头像内容，则使用独立字段 `avatar_base64`，否则为 `null`
- `character_state_values` 仅导出 field_key 和 value_json，不导出字段定义本身（定义在世界卡里）
- 导入时为角色、条目重新生成 UUID 和时间戳；state_values 的 field_key 与目标世界的字段模板对齐，key 不存在则跳过
- 不包含 API Key 等任何配置项

### 世界卡格式：.weworld.json

```json
{
  "format": "worldengine-world-v1",
  "world": {
    "name": "世界名",
    "system_prompt": "",
    "temperature": null,
    "max_tokens": null
  },
  "persona": {
    "name": "",
    "system_prompt": ""
  },
  "persona_state_fields": [
    {
      "field_key": "stamina",
      "label": "体力",
      "type": "text",
      "description": "",
      "default_value": null,
      "update_mode": "llm_auto",
      "trigger_mode": "every_turn",
      "trigger_keywords": null,
      "enum_options": null,
      "min_value": null,
      "max_value": null,
      "allow_empty": 1,
      "update_instruction": "",
      "sort_order": 0
    }
  ],
  "persona_state_values": [
    {
      "field_key": "stamina",
      "value_json": "\"充沛\""
    }
  ],
  "prompt_entries": [
    {
      "title": "",
      "summary": "",
      "content": "",
      "keywords": [],
      "sort_order": 0
    }
  ],
  "world_state_fields": [
    {
      "field_key": "date",
      "label": "当前日期",
      "type": "text",
      "description": "",
      "default_value": null,
      "update_mode": "manual",
      "trigger_mode": "manual_only",
      "trigger_keywords": null,
      "enum_options": null,
      "min_value": null,
      "max_value": null,
      "allow_empty": 1,
      "update_instruction": "",
      "sort_order": 0
    }
  ],
  "world_state_values": [
    {
      "field_key": "date",
      "value_json": "\"第三纪元第100年\""
    }
  ],
  "character_state_fields": [
    {
      "field_key": "mood",
      "label": "心情",
      "type": "text",
      "description": "",
      "default_value": null,
      "update_mode": "llm_auto",
      "trigger_mode": "every_turn",
      "trigger_keywords": null,
      "enum_options": null,
      "min_value": null,
      "max_value": null,
      "allow_empty": 1,
      "update_instruction": "",
      "sort_order": 0
    }
  ],
  "characters": [
    {
      "name": "角色名",
      "system_prompt": "",
      "first_message": "",
      "avatar_path": null,
      "sort_order": 0,
      "prompt_entries": [
        {
          "title": "",
          "summary": "",
          "content": "",
          "keywords": [],
          "sort_order": 0
        }
      ],
      "character_state_values": [
        {
          "field_key": "mood",
          "value_json": "\"平静\""
        }
      ]
    }
  ]
}
```

约束：
- 不包含数据库 id、world_id、character_id、embedding_id、created_at、updated_at
- `characters` 字段可为空数组
- `persona` 为对象（非数组），一对一挂在 world 下；导出字段仅含 name、system_prompt
- `world_state_fields`、`character_state_fields` 和 `persona_state_fields` 导出字段定义（不含 id、world_id、created_at、updated_at）
- `world_state_values`、`character_state_values` 和 `persona_state_values` 仅导出 field_key 和 value_json
- 导入时世界、角色、玩家、字段定义、状态值、条目全部重新生成 UUID 和时间戳
- 导入世界卡时，不导入 session、messages、session_summaries、world_timeline

---

## 关键约束汇总

| 约束 | 实现方式 |
|---|---|
| 级联删除 | SQLite `ON DELETE CASCADE` 外键约束，需在连接时开启 `PRAGMA foreign_keys = ON` |
| 主键格式 | 全部使用 UUID（`crypto.randomUUID()`），不用自增整数 |
| 时间戳格式 | Unix 毫秒整数（`Date.now()`），不用字符串 |
| JSON 字段 | `keywords`、`attachments` 存为 JSON 字符串，读取时在 Service 层解析，不在路由层解析 |
| 外键开启 | 每次获取 SQLite 连接后立即执行 `PRAGMA foreign_keys = ON` |
| 索引 | 只对高频查询字段建索引（已在上方标注），不过度索引 |
| 排序字段 | `characters.sort_order`、三层 `prompt_entries.sort_order` 均用于同层手动排序；默认取当前同父级最大值 + 1 |
| 导入导出字段裁剪 | 所有导入导出 JSON 均不包含数据库主键、外键、embedding_id、created_at、updated_at，也不包含任何 API Key |

---

## 常见查询示例

```sql
-- 获取某世界下所有角色
SELECT * FROM characters WHERE world_id = ? ORDER BY created_at ASC;

-- 获取某角色的所有会话（按最后活跃时间倒序）
SELECT * FROM sessions WHERE character_id = ? ORDER BY updated_at DESC;

-- 获取某会话的所有消息（按时间正序）
SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC;

-- 获取某世界时间线（按顺序，压缩段排在前面）
SELECT * FROM world_timeline WHERE world_id = ? ORDER BY seq ASC;

-- 获取某角色的所有 Prompt 条目（按排序字段）
SELECT * FROM character_prompt_entries WHERE character_id = ? ORDER BY sort_order ASC;

-- 检查某 session 是否已有 summary
SELECT id FROM session_summaries WHERE session_id = ? LIMIT 1;

-- 获取某世界下所有角色（按排序字段）
SELECT * FROM characters WHERE world_id = ? ORDER BY sort_order ASC, created_at ASC;

-- 获取某世界的所有 Prompt 条目（按排序字段）
SELECT * FROM world_prompt_entries WHERE world_id = ? ORDER BY sort_order ASC, created_at ASC;
```
