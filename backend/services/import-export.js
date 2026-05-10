import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../db/index.js';
import { getConfig, updateConfig } from './config.js';
import {
  validateCharacterImportPayload,
  validateWorldImportPayload,
} from './import-export-validation.js';
import { listConditionsByEntry, replaceEntryConditions } from '../db/queries/entry-conditions.js';
import { createLogger, formatMeta } from '../utils/logger.js';

const log = createLogger('svc', 'green');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = process.env.WE_DATA_DIR
  ? path.resolve(process.env.WE_DATA_DIR)
  : path.resolve(__dirname, '..', '..', 'data');
const AVATARS_DIR = path.join(DATA_ROOT, 'uploads', 'avatars');

// ─── 内部导入辅助函数 ─────────────────────────────────────────────────────────

function normalizeToken(value, triggerType = 'always') {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return 1;
  if (triggerType === 'always') {
    return n >= 0 ? n : 1;
  }
  return n >= 1 ? n : 1;
}

function normalizeActiveTurnsImport(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return 1;
  return n;
}

/**
 * 保存 base64 头像到磁盘，返回 `avatars/<filename>` 相对路径；无数据或失败返回 null。
 * 注意：文件系统操作在事务内调用，不受 SQLite 事务保护（已知限制）。
 */
function saveAvatarFile(entityId, avatarBase64, avatarMime) {
  if (!avatarBase64 || !avatarMime) return null;
  const ext = avatarMime.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  const filename = `${entityId}.${ext}`;
  fs.writeFileSync(path.join(AVATARS_DIR, filename), Buffer.from(avatarBase64, 'base64'));
  return `avatars/${filename}`;
}

/**
 * 批量插入 world_prompt_entries。
 * 返回插入的条目 id 数组（与 entries 一一对应）。
 */
function insertPromptEntries(stmt, entityId, entries, now) {
  const ids = [];
  for (const entry of (entries ?? [])) {
    const id = crypto.randomUUID();
    stmt.run(
      id, entityId,
      entry.title, entry.description ?? entry.summary ?? '', entry.content ?? '',
      entry.keywords != null ? JSON.stringify(entry.keywords) : null,
      entry.keyword_scope ?? 'user,assistant',
      entry.trigger_type ?? 'always',
      entry.condition_logic === 'OR' ? 'OR' : 'AND',
      entry.keyword_logic === 'AND' ? 'AND' : 'OR',
      normalizeActiveTurnsImport(entry.active_turns),
      entry.sort_order ?? 0,
      normalizeToken(entry.token, entry.trigger_type ?? 'always'),
      entry.enabled ?? 1,
      now, now,
    );
    ids.push(id);
  }
  return ids;
}

/**
 * 批量插入 state_values，跳过不在 validKeySet 中的 field_key。
 * stmt 由调用方 prepare（world/character/persona 表名不同，SQL 不同）。
 * @param {import('better-sqlite3').Statement} stmt
 * @param {string}     entityId    world_id 或 character_id
 * @param {object[]}   entries     含 field_key / value_json 的数组
 * @param {Set<string>} validKeySet 合法 field_key 集合
 * @param {number}     now
 */
function insertStateValues(stmt, entityId, entries, validKeySet, now) {
  for (const sv of (entries ?? [])) {
    if (!validKeySet.has(sv.field_key)) continue;
    stmt.run(crypto.randomUUID(), entityId, sv.field_key, sv.value_json, now);
  }
}

/**
 * 在事务内导入单个角色（头像 + 角色行 + prompt_entries + state_values）。
 */
function importSingleCharacter(characterId, worldId, charData, validCharFieldKeys, stmts, now) {
  const avatarPath = saveAvatarFile(characterId, charData.avatar_base64, charData.avatar_mime);
  stmts.insertChar.run(
    characterId, worldId,
    charData.name,
    charData.system_prompt ?? '',
    charData.first_message ?? '',
    avatarPath,
    charData.sort_order ?? 0,
    now, now,
  );
  insertStateValues(stmts.insertCharValue, characterId, charData.character_state_values, validCharFieldKeys, now);
}

// ─── 导出角色卡 ──────────────────────────────────────────────────────────────

export function exportCharacter(characterId) {
  const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
  if (!character) throw new Error('角色不存在');

  const stateValues = db.prepare(
    'SELECT field_key, default_value_json AS value_json FROM character_state_values WHERE character_id = ?',
  ).all(characterId);

  // 读取头像（如果有）
  let avatarBase64 = null;
  let avatarMime = null;
  if (character.avatar_path) {
    const avatarFile = path.join(DATA_ROOT, 'uploads', character.avatar_path);
    if (fs.existsSync(avatarFile)) {
      const ext = path.extname(avatarFile).toLowerCase().replace('.', '');
      avatarMime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      avatarBase64 = fs.readFileSync(avatarFile).toString('base64');
    }
  }

  return {
    format: 'worldengine-character-v1',
    character: {
      name: character.name,
      system_prompt: character.system_prompt,
      first_message: character.first_message,
      avatar_path: character.avatar_path ?? null,
      ...(avatarBase64 ? { avatar_base64: avatarBase64, avatar_mime: avatarMime } : {}),
    },
    prompt_entries: [],
    character_state_values: stateValues,
  };
}

// ─── 导出玩家为角色卡 ────────────────────────────────────────────────────────

export function exportPersona(worldId) {
  const persona = db.prepare('SELECT name, system_prompt, avatar_path FROM personas WHERE world_id = ?').get(worldId);
  if (!persona) throw new Error('玩家不存在');

  let avatarBase64 = null;
  let avatarMime = null;
  if (persona.avatar_path) {
    const avatarFile = path.join(DATA_ROOT, 'uploads', persona.avatar_path);
    if (fs.existsSync(avatarFile)) {
      const ext = path.extname(avatarFile).toLowerCase().replace('.', '');
      avatarMime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      avatarBase64 = fs.readFileSync(avatarFile).toString('base64');
    }
  }

  return {
    format: 'worldengine-character-v1',
    character: {
      name: persona.name,
      system_prompt: persona.system_prompt,
      first_message: '',
      post_prompt: '',
      ...(avatarBase64 ? { avatar_base64: avatarBase64, avatar_mime: avatarMime } : {}),
    },
    prompt_entries: [],
    character_state_values: [],
  };
}

// ─── 导入角色卡 ──────────────────────────────────────────────────────────────

export function importCharacter(worldId, data) {
  validateCharacterImportPayload(data);

  const world = db.prepare('SELECT id FROM worlds WHERE id = ?').get(worldId);
  if (!world) throw new Error('世界不存在');

  // 获取目标世界的角色状态字段模板（用于验证 field_key）
  const validFieldKeys = new Set(
    db.prepare('SELECT field_key FROM character_state_fields WHERE world_id = ?')
      .all(worldId)
      .map((r) => r.field_key),
  );

  const doImport = db.transaction(() => {
    const now = Date.now();
    const characterId = crypto.randomUUID();

    // 处理头像
    const avatarPath = saveAvatarFile(characterId, data.character.avatar_base64, data.character.avatar_mime);

    // 计算 sort_order
    const maxRow = db.prepare('SELECT MAX(sort_order) AS m FROM characters WHERE world_id = ?').get(worldId);
    const sortOrder = (maxRow?.m ?? -1) + 1;

    // 插入角色
    db.prepare(`
      INSERT INTO characters (id, world_id, name, system_prompt, first_message, avatar_path, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      characterId, worldId,
      data.character.name,
      data.character.system_prompt ?? '',
      data.character.first_message ?? '',
      avatarPath,
      sortOrder,
      now, now,
    );

    // 插入 state_values（只导入 field_key 在目标世界中存在的）
    const insertValue = db.prepare(`
      INSERT INTO character_state_values (id, character_id, field_key, default_value_json, runtime_value_json, updated_at)
      VALUES (?, ?, ?, ?, NULL, ?)
    `);
    insertStateValues(insertValue, characterId, data.character_state_values, validFieldKeys, now);

    return db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
  });

  const created = doImport();
  log.info(`character.import  ${formatMeta({ characterId: created?.id, worldId, name: created?.name })}`);
  return created;
}

// ─── 导出世界卡 ──────────────────────────────────────────────────────────────

export function exportWorld(worldId) {
  const world = db.prepare('SELECT * FROM worlds WHERE id = ?').get(worldId);
  if (!world) throw new Error('世界不存在');

  const worldPromptEntries = db.prepare(
    'SELECT id, title, description, content, keywords, keyword_scope, trigger_type, condition_logic, keyword_logic, active_turns, sort_order, token, enabled FROM world_prompt_entries WHERE world_id = ? ORDER BY sort_order ASC',
  ).all(worldId).map((e) => {
    const entry = {
      ...e,
      keywords: e.keywords ? JSON.parse(e.keywords) : null,
    };
    if (entry.trigger_type === 'state') {
      entry.conditions = listConditionsByEntry(entry.id);
      delete entry.id;
    } else {
      delete entry.id;
    }
    return entry;
  });

  const worldStateFields = db.prepare(
    'SELECT field_key, label, type, description, default_value, update_mode, enum_options, min_value, max_value, allow_empty, update_instruction, prefix, unit, table_columns, sort_order FROM world_state_fields WHERE world_id = ? ORDER BY sort_order ASC',
  ).all(worldId).map((f) => ({
    ...f,
    enum_options: f.enum_options ? JSON.parse(f.enum_options) : null,
    table_columns: f.table_columns ? JSON.parse(f.table_columns) : null,
  }));

  const characterStateFields = db.prepare(
    'SELECT field_key, label, type, description, default_value, update_mode, enum_options, min_value, max_value, allow_empty, update_instruction, prefix, unit, table_columns, sort_order FROM character_state_fields WHERE world_id = ? ORDER BY sort_order ASC',
  ).all(worldId).map((f) => ({
    ...f,
    enum_options: f.enum_options ? JSON.parse(f.enum_options) : null,
    table_columns: f.table_columns ? JSON.parse(f.table_columns) : null,
  }));

  const worldStateValues = db.prepare(
    'SELECT field_key, default_value_json AS value_json FROM world_state_values WHERE world_id = ?',
  ).all(worldId);

  // 读取封面图
  let coverBase64 = null;
  let coverMime = null;
  if (world.cover_path) {
    const coverFile = path.join(DATA_ROOT, 'uploads', world.cover_path);
    if (fs.existsSync(coverFile)) {
      const ext = path.extname(coverFile).toLowerCase().replace('.', '');
      coverMime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      coverBase64 = fs.readFileSync(coverFile).toString('base64');
    }
  }

  // 导出角色（含 state_values）
  const characters = db.prepare(
    'SELECT * FROM characters WHERE world_id = ? ORDER BY sort_order ASC, created_at ASC',
  ).all(worldId).map((character) => {
    const stateValues = db.prepare(
      'SELECT field_key, default_value_json AS value_json FROM character_state_values WHERE character_id = ?',
    ).all(character.id);

    // 读取头像
    let avatarBase64 = null;
    let avatarMime = null;
    if (character.avatar_path) {
      const avatarFile = path.join(DATA_ROOT, 'uploads', character.avatar_path);
      if (fs.existsSync(avatarFile)) {
        const ext = path.extname(avatarFile).toLowerCase().replace('.', '');
        avatarMime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
        avatarBase64 = fs.readFileSync(avatarFile).toString('base64');
      }
    }

    return {
      name: character.name,
      system_prompt: character.system_prompt,
      first_message: character.first_message,
      avatar_path: character.avatar_path ?? null,
      sort_order: character.sort_order,
      ...(avatarBase64 ? { avatar_base64: avatarBase64, avatar_mime: avatarMime } : {}),
      prompt_entries: [],
      character_state_values: stateValues,
    };
  });

  const personaStateFields = db.prepare(
    'SELECT field_key, label, type, description, default_value, update_mode, enum_options, min_value, max_value, allow_empty, update_instruction, prefix, unit, table_columns, sort_order FROM persona_state_fields WHERE world_id = ? ORDER BY sort_order ASC',
  ).all(worldId).map((f) => ({
    ...f,
    enum_options: f.enum_options ? JSON.parse(f.enum_options) : null,
    table_columns: f.table_columns ? JSON.parse(f.table_columns) : null,
  }));

  const allPersonaRows = db.prepare(
    'SELECT id, name, system_prompt FROM personas WHERE world_id = ? ORDER BY created_at ASC, id ASC',
  ).all(worldId);
  const worldActivePersonaId = db.prepare('SELECT active_persona_id FROM worlds WHERE id = ?').get(worldId)?.active_persona_id;
  const resolvedActivePersonaId = worldActivePersonaId ?? allPersonaRows[0]?.id ?? null;
  const getPersonaStateValuesStmt = db.prepare(
    'SELECT field_key, default_value_json AS value_json FROM persona_state_values WHERE persona_id = ?',
  );
  const personas = allPersonaRows.map((p) => ({
    name: p.name,
    system_prompt: p.system_prompt,
    is_active: p.id === resolvedActivePersonaId,
    persona_state_values: getPersonaStateValuesStmt.all(p.id),
  }));

  return {
    format: 'worldengine-world-v1',
    world: {
      name: world.name,
      description: world.description ?? '',
      cover_path: world.cover_path ?? null,
      temperature: world.temperature ?? null,
      max_tokens: world.max_tokens ?? null,
      ...(coverBase64 ? { cover_base64: coverBase64, cover_mime: coverMime } : {}),
    },
    personas,
    prompt_entries: worldPromptEntries,
    world_state_fields: worldStateFields,
    character_state_fields: characterStateFields,
    persona_state_fields: personaStateFields,
    world_state_values: worldStateValues,
    characters,
  };
}

// ─── 导入世界卡 ──────────────────────────────────────────────────────────────

export function importWorld(data) {
  validateWorldImportPayload(data);

  const doImport = db.transaction(() => {
    const now = Date.now();
    const worldId = crypto.randomUUID();

    // 处理封面图
    const coverPath = saveAvatarFile(worldId, data.world.cover_base64, data.world.cover_mime);

    // 插入世界
    db.prepare(`
      INSERT INTO worlds (id, name, description, temperature, max_tokens, cover_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      worldId,
      data.world.name,
      data.world.description ?? '',
      data.world.temperature ?? null,
      data.world.max_tokens ?? null,
      coverPath,
      now, now,
    );

    // 规范化 personas：新格式用 personas 数组，旧格式用 persona + persona_state_values
    const personaList = Array.isArray(data.personas)
      ? data.personas
      : [{
          name: data.persona?.name ?? '',
          system_prompt: data.persona?.system_prompt ?? '',
          is_active: true,
          persona_state_values: data.persona_state_values ?? [],
        }];

    const allPromptEntries = data.prompt_entries ?? [];

    // 插入世界 prompt_entries
    const insertWorldEntry = db.prepare(`
      INSERT INTO world_prompt_entries (id, world_id, title, description, content, keywords, keyword_scope, trigger_type, condition_logic, keyword_logic, active_turns, sort_order, token, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const entryIds = insertPromptEntries(insertWorldEntry, worldId, allPromptEntries, now);

    // 插入 state 条目的 conditions
    for (let i = 0; i < allPromptEntries.length; i++) {
      const entry = allPromptEntries[i];
      if (entry.trigger_type === 'state' && Array.isArray(entry.conditions) && entry.conditions.length > 0) {
        replaceEntryConditions(entryIds[i], entry.conditions);
      }
    }

    // 插入世界状态字段定义
    const insertWorldField = db.prepare(`
      INSERT INTO world_state_fields (
        id, world_id, field_key, label, type, description,
        default_value, update_mode,
        enum_options, min_value, max_value, allow_empty,
        update_instruction, prefix, unit, table_columns, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const field of (data.world_state_fields ?? [])) {
      insertWorldField.run(
        crypto.randomUUID(), worldId,
        field.field_key, field.label, field.type,
        field.description ?? '',
        field.default_value ?? null,
        field.update_mode ?? 'manual',
        field.enum_options != null ? JSON.stringify(field.enum_options) : null,
        field.min_value ?? null,
        field.max_value ?? null,
        field.allow_empty ?? 1,
        field.update_instruction ?? '',
        field.prefix ?? '',
        field.unit ?? '',
        field.table_columns != null ? JSON.stringify(field.table_columns) : null,
        field.sort_order ?? 0,
        now, now,
      );
    }

    // 插入角色状态字段定义
    const insertCharField = db.prepare(`
      INSERT INTO character_state_fields (
        id, world_id, field_key, label, type, description,
        default_value, update_mode,
        enum_options, min_value, max_value, allow_empty,
        update_instruction, prefix, unit, table_columns, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const field of (data.character_state_fields ?? [])) {
      insertCharField.run(
        crypto.randomUUID(), worldId,
        field.field_key, field.label, field.type,
        field.description ?? '',
        field.default_value ?? null,
        field.update_mode ?? 'manual',
        field.enum_options != null ? JSON.stringify(field.enum_options) : null,
        field.min_value ?? null,
        field.max_value ?? null,
        field.allow_empty ?? 1,
        field.update_instruction ?? '',
        field.prefix ?? '',
        field.unit ?? '',
        field.table_columns != null ? JSON.stringify(field.table_columns) : null,
        field.sort_order ?? 0,
        now, now,
      );
    }

    // 插入世界状态当前值
    const insertWorldValue = db.prepare(`
      INSERT INTO world_state_values (id, world_id, field_key, default_value_json, runtime_value_json, updated_at)
      VALUES (?, ?, ?, ?, NULL, ?)
    `);
    const validWorldFieldKeys = new Set((data.world_state_fields ?? []).map((f) => f.field_key));
    insertStateValues(insertWorldValue, worldId, data.world_state_values, validWorldFieldKeys, now);

    // 插入玩家状态字段定义
    const insertPersonaField = db.prepare(`
      INSERT INTO persona_state_fields (
        id, world_id, field_key, label, type, description,
        default_value, update_mode,
        enum_options, min_value, max_value, allow_empty,
        update_instruction, prefix, unit, table_columns, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const field of (data.persona_state_fields ?? [])) {
      insertPersonaField.run(
        crypto.randomUUID(), worldId,
        field.field_key, field.label, field.type,
        field.description ?? '',
        field.default_value ?? null,
        field.update_mode ?? 'manual',
        field.enum_options != null ? JSON.stringify(field.enum_options) : null,
        field.min_value ?? null,
        field.max_value ?? null,
        field.allow_empty ?? 1,
        field.update_instruction ?? '',
        field.prefix ?? '',
        field.unit ?? '',
        field.table_columns != null ? JSON.stringify(field.table_columns) : null,
        field.sort_order ?? 0,
        now, now,
      );
    }

    // 插入所有 personas 及其状态值，同时记录激活 persona id
    const insertPersonaStmt = db.prepare(`
      INSERT INTO personas (id, world_id, name, system_prompt, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertPersonaValue = db.prepare(`
      INSERT INTO persona_state_values (id, persona_id, world_id, field_key, default_value_json, runtime_value_json, updated_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?)
    `);
    const validPersonaFieldKeys = new Set((data.persona_state_fields ?? []).map((f) => f.field_key));
    let activePersonaId = null;
    let firstPersonaId = null;
    for (const pData of personaList) {
      const pId = crypto.randomUUID();
      if (firstPersonaId === null) firstPersonaId = pId;
      insertPersonaStmt.run(pId, worldId, pData.name ?? '', pData.system_prompt ?? '', now, now);
      for (const sv of (pData.persona_state_values ?? [])) {
        if (!validPersonaFieldKeys.has(sv.field_key)) continue;
        insertPersonaValue.run(crypto.randomUUID(), pId, worldId, sv.field_key, sv.value_json, now);
      }
      if (pData.is_active) activePersonaId = pId;
    }
    // 设置 active_persona_id（无 is_active 标记时用第一个）
    db.prepare('UPDATE worlds SET active_persona_id = ? WHERE id = ?').run(
      activePersonaId ?? firstPersonaId,
      worldId,
    );

    // 获取合法的 character field_key 集合
    const validCharFieldKeys = new Set((data.character_state_fields ?? []).map((f) => f.field_key));

    // 插入角色
    const insertCharacter = db.prepare(`
      INSERT INTO characters (id, world_id, name, system_prompt, first_message, avatar_path, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertCharValue = db.prepare(`
      INSERT INTO character_state_values (id, character_id, field_key, default_value_json, runtime_value_json, updated_at)
      VALUES (?, ?, ?, ?, NULL, ?)
    `);

    const charStmts = { insertChar: insertCharacter, insertCharValue };
    for (const charData of (data.characters ?? [])) {
      importSingleCharacter(crypto.randomUUID(), worldId, charData, validCharFieldKeys, charStmts, now);
    }

    return db.prepare('SELECT * FROM worlds WHERE id = ?').get(worldId);
  });

  const created = doImport();
  log.info(`world.import  ${formatMeta({
    worldId: created?.id,
    name: created?.name,
    characters: (data.characters ?? []).length,
    promptEntries: (data.prompt_entries ?? []).length,
    personas: Array.isArray(data.personas) ? data.personas.length : 1,
  })}`);
  return created;
}

// ─── 导出全局设置 ─────────────────────────────────────────────────────────────

export function exportGlobalSettings(mode = 'chat') {
  const config = getConfig();

  const cssSnippets = db.prepare(
    'SELECT name, content, enabled, mode, sort_order FROM custom_css_snippets WHERE mode = ? ORDER BY sort_order ASC, created_at ASC',
  ).all(mode);

  const regexRules = db.prepare(
    `SELECT name, pattern, replacement, scope, mode, enabled, sort_order
     FROM regex_rules WHERE world_id IS NULL AND mode = ? ORDER BY sort_order ASC`,
  ).all(mode);

  const base = {
    format: 'worldengine-global-settings-v1',
    mode,
    exported_at: new Date().toISOString(),
    custom_css_snippets: cssSnippets,
    regex_rules: regexRules,
  };

  if (mode === 'writing') {
    const writing = config.writing ?? {};
    const writingLlm = writing.llm ?? {};
    return {
      ...base,
      writing: {
        global_system_prompt: writing.global_system_prompt ?? '',
        global_post_prompt: writing.global_post_prompt ?? '',
        context_history_rounds: writing.context_history_rounds ?? null,
        llm: {
          provider: writingLlm.provider ?? null,
          provider_models: writingLlm.provider_models ?? {},
          base_url: writingLlm.base_url ?? null,
          model: writingLlm.model ?? '',
          temperature: writingLlm.temperature ?? null,
          max_tokens: writingLlm.max_tokens ?? null,
        },
      },
    };
  }

  return {
    ...base,
    config: {
      global_system_prompt: config.global_system_prompt ?? '',
      global_post_prompt: config.global_post_prompt ?? '',
      context_history_rounds: config.context_history_rounds ?? 20,
      memory_expansion_enabled: config.memory_expansion_enabled ?? true,
    },
  };
}

// ─── 导入全局设置 ─────────────────────────────────────────────────────────────

export function importGlobalSettings(data) {
  if (!data || data.format !== 'worldengine-global-settings-v1') {
    throw new Error('全局设置文件格式不正确');
  }

  // 兼容旧格式（无 mode 字段）：默认按 chat 处理
  const mode = data.mode === 'writing' ? 'writing' : 'chat';
  const validScopes = new Set(['user_input', 'ai_output', 'display_only', 'prompt_only']);
  const now = Date.now();

  const doImport = db.transaction(() => {
    db.prepare('DELETE FROM custom_css_snippets WHERE mode = ?').run(mode);
    db.prepare('DELETE FROM regex_rules WHERE world_id IS NULL AND mode = ?').run(mode);

    const insertCss = db.prepare(
      `INSERT INTO custom_css_snippets (id, name, content, enabled, mode, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const snippet of (data.custom_css_snippets ?? [])) {
      insertCss.run(
        crypto.randomUUID(),
        snippet.name ?? '',
        snippet.content ?? '',
        snippet.enabled ? 1 : 0,
        mode,
        snippet.sort_order ?? 0,
        now, now,
      );
    }

    const insertRule = db.prepare(
      `INSERT INTO regex_rules
       (id, world_id, name, pattern, replacement, scope, mode, enabled, sort_order, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const rule of (data.regex_rules ?? [])) {
      if (rule.scope && !validScopes.has(rule.scope)) continue;
      insertRule.run(
        crypto.randomUUID(),
        rule.name ?? '',
        rule.pattern ?? '',
        rule.replacement ?? '',
        rule.scope ?? 'display_only',
        mode,
        rule.enabled ? 1 : 0,
        rule.sort_order ?? 0,
        now, now,
      );
    }
  });

  doImport();

  if (mode === 'chat' && data.config && typeof data.config === 'object') {
    const patch = {};
    if (typeof data.config.global_system_prompt === 'string') patch.global_system_prompt = data.config.global_system_prompt;
    if (typeof data.config.global_post_prompt === 'string') patch.global_post_prompt = data.config.global_post_prompt;
    if (typeof data.config.context_history_rounds === 'number') patch.context_history_rounds = data.config.context_history_rounds;
    if (typeof data.config.memory_expansion_enabled === 'boolean') patch.memory_expansion_enabled = data.config.memory_expansion_enabled;
    if (Object.keys(patch).length > 0) updateConfig(patch);
  }

  if (mode === 'writing' && data.writing && typeof data.writing === 'object') {
    const writingPatch = {};
    if (typeof data.writing.global_system_prompt === 'string') writingPatch.global_system_prompt = data.writing.global_system_prompt;
    if (typeof data.writing.global_post_prompt === 'string') writingPatch.global_post_prompt = data.writing.global_post_prompt;
    if (data.writing.context_history_rounds === null || typeof data.writing.context_history_rounds === 'number') {
      writingPatch.context_history_rounds = data.writing.context_history_rounds;
    }
    if (data.writing.llm && typeof data.writing.llm === 'object') {
      writingPatch.llm = {};
      if (data.writing.llm.provider === null || typeof data.writing.llm.provider === 'string') writingPatch.llm.provider = data.writing.llm.provider;
      if (data.writing.llm.provider_models && typeof data.writing.llm.provider_models === 'object' && !Array.isArray(data.writing.llm.provider_models)) writingPatch.llm.provider_models = data.writing.llm.provider_models;
      if (data.writing.llm.base_url === null || typeof data.writing.llm.base_url === 'string') writingPatch.llm.base_url = data.writing.llm.base_url;
      if (typeof data.writing.llm.model === 'string') writingPatch.llm.model = data.writing.llm.model;
      if (data.writing.llm.temperature === null || typeof data.writing.llm.temperature === 'number') writingPatch.llm.temperature = data.writing.llm.temperature;
      if (data.writing.llm.max_tokens === null || typeof data.writing.llm.max_tokens === 'number') writingPatch.llm.max_tokens = data.writing.llm.max_tokens;
    }
    if (Object.keys(writingPatch).length > 0) updateConfig({ writing: writingPatch });
  }

  log.info(`global_settings.import  ${formatMeta({
    mode,
    cssSnippets: (data.custom_css_snippets ?? []).length,
    regexRules: (data.regex_rules ?? []).length,
  })}`);
  return { ok: true, mode };
}
