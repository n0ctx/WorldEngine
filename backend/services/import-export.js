import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getConfig, updateConfig } from './config.js';
import {
  validateCharacterImportPayload,
  validatePersonaImportPayload,
  validateWorldImportPayload,
} from './import-export-validation.js';
import { listConditionsByEntry, replaceEntryConditions } from '../db/queries/entry-conditions.js';
import { normalizeToken } from '../db/queries/prompt-entries.js';
import { parseRow as parseStateFieldRow } from '../db/queries/_state-fields-base.js';
import { getCharacterById } from '../db/queries/characters.js';
import { getPersonaById, setActivePersona } from '../db/queries/personas.js';
import { getWorldById } from '../db/queries/worlds.js';
import {
  getNextCharacterSortOrder,
  getNextPersonaSortOrder,
  getPersonaForExport,
  getStateFieldKeySet,
  insertCharacterRows,
  insertPersonaRows,
  insertPromptEntryRows,
  insertStateFieldRows,
  insertStateValueRows,
  insertWorldRow,
  listCharactersForExport,
  listGlobalCssSnippetsForExport,
  listGlobalRegexRulesForExport,
  listPersonasForExport,
  listPromptEntriesForExport,
  listStateFieldsForExport,
  listStateValuesForExport,
  listWorldIdsForExport,
  replaceGlobalSettingsRows,
  runImportTransaction,
} from '../db/queries/import-export.js';
import { createLogger, formatMeta } from '../utils/logger.js';
import {
  EXPORT_FORMAT_CHARACTER,
  EXPORT_FORMAT_PERSONA,
  EXPORT_FORMAT_WORLD,
  EXPORT_FORMAT_GLOBAL_SETTINGS,
  EXPORT_FORMAT_MIGRATION,
} from './import-export-constants.js';
import { UPLOADS_DIR } from '../utils/data-dir.js';

const log = createLogger('svc', 'green');

const AVATARS_DIR = path.join(UPLOADS_DIR, 'avatars');

// ─── 内部导入辅助函数 ─────────────────────────────────────────────────────────

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

/** 导入的 prompt 条目转成 world_prompt_entries 行（与 entries 一一对应） */
function promptEntryRows(worldId, entries, now) {
  return entries.map((entry) => ({
    id: crypto.randomUUID(),
    world_id: worldId,
    title: entry.title,
    description: entry.description ?? entry.summary ?? '',
    content: entry.content ?? '',
    keywords: entry.keywords != null ? JSON.stringify(entry.keywords) : null,
    keyword_scope: entry.keyword_scope ?? 'user,assistant',
    trigger_type: entry.trigger_type ?? 'always',
    condition_logic: entry.condition_logic === 'OR' ? 'OR' : 'AND',
    keyword_logic: entry.keyword_logic === 'AND' ? 'AND' : 'OR',
    active_turns: normalizeActiveTurnsImport(entry.active_turns),
    group_name: entry.group_name != null && String(entry.group_name).trim() ? String(entry.group_name).trim() : null,
    sort_order: entry.sort_order ?? 0,
    token: normalizeToken(entry.token, entry.trigger_type ?? 'always'),
    enabled: entry.enabled ?? 1,
    created_at: now,
    updated_at: now,
  }));
}

/**
 * 导入的状态值转成状态值行，跳过不在 validKeySet 中的 field_key。
 * @param {object}      owner       归属列，如 { character_id } 或 { persona_id, world_id }
 * @param {object[]}    entries     含 field_key / value_json 的数组
 * @param {Set<string>} validKeySet 合法 field_key 集合
 * @param {number}      now
 */
function stateValueRows(owner, entries, validKeySet, now) {
  return (entries ?? [])
    .filter((sv) => validKeySet.has(sv.field_key))
    .map((sv) => ({
      id: crypto.randomUUID(), ...owner, field_key: sv.field_key, default_value_json: sv.value_json, updated_at: now,
    }));
}

function readExportImage(relativePath) {
  if (!relativePath) return {};
  const imageFile = path.join(UPLOADS_DIR, relativePath);
  if (!fs.existsSync(imageFile)) return {};

  const ext = path.extname(imageFile).toLowerCase().replace('.', '');
  return {
    avatarBase64: fs.readFileSync(imageFile).toString('base64'),
    avatarMime: ext === 'jpg' ? 'image/jpeg' : `image/${ext}`,
  };
}

function serializeWorldPromptEntry(entry) {
  const { id, keywords, ...payload } = entry;
  return {
    ...payload,
    keywords: keywords ? JSON.parse(keywords) : null,
    ...(entry.trigger_type === 'state' ? { conditions: listConditionsByEntry(id) } : {}),
  };
}

function exportWorldCharacter(character) {
  const stateValues = listStateValuesForExport('character', character.id);
  const { avatarBase64, avatarMime } = readExportImage(character.avatar_path);

  return {
    name: character.name,
    description: character.description ?? '',
    system_prompt: character.system_prompt,
    post_prompt: character.post_prompt ?? '',
    first_message: character.first_message,
    avatar_path: character.avatar_path ?? null,
    sort_order: character.sort_order,
    ...(avatarBase64 ? { avatar_base64: avatarBase64, avatar_mime: avatarMime } : {}),
    prompt_entries: [],
    character_state_values: stateValues,
  };
}

function exportWorldPersona(persona, activePersonaId) {
  const { avatarBase64, avatarMime } = readExportImage(persona.avatar_path);
  return {
    name: persona.name,
    description: persona.description ?? '',
    system_prompt: persona.system_prompt,
    avatar_path: persona.avatar_path ?? null,
    ...(avatarBase64 ? { avatar_base64: avatarBase64, avatar_mime: avatarMime } : {}),
    is_active: persona.id === activePersonaId,
    sort_order: persona.sort_order ?? 0,
    persona_state_values: listStateValuesForExport('persona', persona.id),
  };
}

function normalizeImportedPersonas(data) {
  if (Array.isArray(data.personas)) return data.personas;
  return [{
    name: data.persona?.name ?? '',
    description: data.persona?.description ?? '',
    system_prompt: data.persona?.system_prompt ?? '',
    avatar_path: data.persona?.avatar_path ?? null,
    avatar_base64: data.persona?.avatar_base64,
    avatar_mime: data.persona?.avatar_mime,
    is_active: true,
    persona_state_values: data.persona_state_values ?? [],
  }];
}

/** 角色卡 / 世界卡里的角色转成 characters 行；头像先写盘（在导入事务内调用） */
function characterRow(characterId, worldId, charData, sortOrder, now) {
  return {
    id: characterId,
    world_id: worldId,
    name: charData.name,
    description: charData.description ?? '',
    system_prompt: charData.system_prompt ?? '',
    post_prompt: charData.post_prompt ?? '',
    first_message: charData.first_message ?? '',
    avatar_path: saveAvatarFile(characterId, charData.avatar_base64, charData.avatar_mime),
    sort_order: sortOrder,
    created_at: now,
    updated_at: now,
  };
}

/** 玩家卡 / 世界卡里的玩家转成 personas 行；头像先写盘（在导入事务内调用） */
function personaRow(personaId, worldId, persona, sortOrder, now) {
  return {
    id: personaId,
    world_id: worldId,
    name: persona.name ?? '',
    description: persona.description ?? '',
    system_prompt: persona.system_prompt ?? '',
    avatar_path: saveAvatarFile(personaId, persona.avatar_base64, persona.avatar_mime),
    sort_order: sortOrder,
    created_at: now,
    updated_at: now,
  };
}

function stateFieldKeySet(fields) {
  const keys = new Set();
  for (const field of fields) keys.add(field.field_key);
  return keys;
}

function insertImportedWorldBase(data, worldId, now) {
  const coverPath = saveAvatarFile(worldId, data.world.cover_base64, data.world.cover_mime);
  // 新版卡携带 accent_color/accent_source；旧卡缺省落 NULL，前端导入时可能用 canvas 补算，这里按卡片值落库。
  insertWorldRow({
    id: worldId,
    name: data.world.name,
    description: data.world.description ?? '',
    temperature: data.world.temperature ?? null,
    max_tokens: data.world.max_tokens ?? null,
    cover_path: coverPath,
    accent_color: data.world.accent_color ?? null,
    accent_source: data.world.accent_source ?? null,
    created_at: now,
    updated_at: now,
  });
}

function insertImportedPromptEntries(worldId, entries, now) {
  const rows = promptEntryRows(worldId, entries, now);
  insertPromptEntryRows(rows);

  // guard-allow(perf-shape): 导入时逐条目替换条件，只在导入世界卡时执行
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.trigger_type !== 'state' || !Array.isArray(entry.conditions) || entry.conditions.length === 0) continue;
    replaceEntryConditions(rows[i].id, entry.conditions);
  }
}

function insertImportedStateFields(kind, worldId, fields, now) {
  insertStateFieldRows(kind, fields.map((field) => ({
    id: crypto.randomUUID(),
    world_id: worldId,
    field_key: field.field_key,
    label: field.label,
    type: field.type,
    description: field.description ?? '',
    default_value: field.default_value ?? null,
    update_mode: field.update_mode ?? 'manual',
    enum_options: field.enum_options != null ? JSON.stringify(field.enum_options) : null,
    min_value: field.min_value ?? null,
    max_value: field.max_value ?? null,
    allow_empty: field.allow_empty ?? 1,
    update_instruction: field.update_instruction ?? '',
    prefix: field.prefix ?? '',
    unit: field.unit ?? '',
    table_columns: field.table_columns != null ? JSON.stringify(field.table_columns) : null,
    sort_order: field.sort_order ?? 0,
    created_at: now,
    updated_at: now,
  })));
}

function insertImportedPersonas(worldId, personas, personaFields, now) {
  const validFieldKeys = stateFieldKeySet(personaFields);
  const rows = personas.map((persona, index) => personaRow(crypto.randomUUID(), worldId, persona, persona.sort_order ?? index, now));
  insertPersonaRows(rows);
  insertStateValueRows('persona', personas.flatMap((persona, index) => stateValueRows(
    { persona_id: rows[index].id, world_id: worldId }, persona.persona_state_values, validFieldKeys, now,
  )));

  const activeIndex = personas.findLastIndex((persona) => persona.is_active);
  return rows[activeIndex >= 0 ? activeIndex : 0]?.id ?? null;
}

function insertImportedCharacters(worldId, characters, characterFields, now) {
  const validFieldKeys = stateFieldKeySet(characterFields);
  const rows = characters.map((character) => characterRow(crypto.randomUUID(), worldId, character, character.sort_order ?? 0, now));
  insertCharacterRows(rows);
  insertStateValueRows('character', characters.flatMap((character, index) => stateValueRows(
    { character_id: rows[index].id }, character.character_state_values, validFieldKeys, now,
  )));
}

function createImportedWorld(data) {
  const now = Date.now();
  const worldId = crypto.randomUUID();
  insertImportedWorldBase(data, worldId, now);

  const personas = normalizeImportedPersonas(data);
  const promptEntries = data.prompt_entries ?? [];
  insertImportedPromptEntries(worldId, promptEntries, now);

  const worldFields = data.world_state_fields ?? [];
  insertImportedStateFields('world', worldId, worldFields, now);

  const characterFields = data.character_state_fields ?? [];
  insertImportedStateFields('character', worldId, characterFields, now);

  insertStateValueRows('world', stateValueRows(
    { world_id: worldId }, data.world_state_values, stateFieldKeySet(worldFields), now,
  ));

  const personaFields = data.persona_state_fields ?? [];
  insertImportedStateFields('persona', worldId, personaFields, now);

  const activePersonaId = insertImportedPersonas(worldId, personas, personaFields, now);
  setActivePersona(worldId, activePersonaId);
  insertImportedCharacters(worldId, data.characters ?? [], characterFields, now);

  return getWorldById(worldId);
}

// ─── 导出角色卡 ──────────────────────────────────────────────────────────────

export function exportCharacter(characterId) {
  const character = getCharacterById(characterId);
  if (!character) throw new Error('角色不存在');

  const stateValues = listStateValuesForExport('character', characterId);

  const { avatarBase64, avatarMime } = readExportImage(character.avatar_path);

  return {
    format: EXPORT_FORMAT_CHARACTER,
    character: {
      name: character.name,
      description: character.description ?? '',
      system_prompt: character.system_prompt,
      post_prompt: character.post_prompt ?? '',
      first_message: character.first_message,
      avatar_path: character.avatar_path ?? null,
      ...(avatarBase64 ? { avatar_base64: avatarBase64, avatar_mime: avatarMime } : {}),
    },
    prompt_entries: [],
    character_state_values: stateValues,
  };
}

// ─── 导出玩家卡 ──────────────────────────────────────────────────────────────

function buildPersonaExportPayload(persona) {
  if (!persona) throw new Error('玩家不存在');

  const { avatarBase64, avatarMime } = readExportImage(persona.avatar_path);

  return {
    format: EXPORT_FORMAT_PERSONA,
    persona: {
      name: persona.name,
      description: persona.description ?? '',
      system_prompt: persona.system_prompt,
      avatar_path: persona.avatar_path ?? null,
      ...(avatarBase64 ? { avatar_base64: avatarBase64, avatar_mime: avatarMime } : {}),
    },
    persona_state_values: listStateValuesForExport('persona', persona.id),
  };
}

export function exportPersona(worldId) {
  const world = getWorldById(worldId);
  if (!world) throw new Error('世界不存在');
  return buildPersonaExportPayload(getPersonaForExport(world.active_persona_id, worldId));
}

export function exportPersonaById(personaId) {
  return buildPersonaExportPayload(getPersonaForExport(personaId));
}

// ─── 导入角色卡 ──────────────────────────────────────────────────────────────

export function importCharacter(worldId, data) {
  validateCharacterImportPayload(data);

  const world = getWorldById(worldId);
  if (!world) throw new Error('世界不存在');

  // 获取目标世界的角色状态字段模板（用于验证 field_key）
  const validFieldKeys = getStateFieldKeySet('character', worldId);

  const created = runImportTransaction(() => {
    const now = Date.now();
    const characterId = crypto.randomUUID();
    insertCharacterRows([characterRow(characterId, worldId, data.character, getNextCharacterSortOrder(worldId), now)]);
    // 只导入 field_key 在目标世界中存在的 state_values
    insertStateValueRows('character', stateValueRows(
      { character_id: characterId }, data.character_state_values, validFieldKeys, now,
    ));
    return getCharacterById(characterId);
  });
  log.info(`character.import  ${formatMeta({ characterId: created?.id, worldId, name: created?.name })}`);
  return created;
}

function normalizePersonaImportData(data) {
  if (data?.format === EXPORT_FORMAT_PERSONA) {
    validatePersonaImportPayload(data);
    return {
      persona: data.persona,
      personaStateValues: data.persona_state_values ?? [],
    };
  }

  if (data?.format !== EXPORT_FORMAT_CHARACTER) {
    throw new Error('不支持的玩家卡格式');
  }

  validateCharacterImportPayload(data);
  return {
    persona: {
      name: data.character?.name ?? '',
      description: data.character?.description ?? '',
      system_prompt: data.character?.system_prompt ?? '',
      avatar_path: data.character?.avatar_path ?? null,
      avatar_base64: data.character?.avatar_base64,
      avatar_mime: data.character?.avatar_mime,
    },
    personaStateValues: data.character_state_values ?? [],
  };
}

export function importPersona(worldId, data) {
  const world = getWorldById(worldId);
  if (!world) throw new Error('世界不存在');

  const { persona, personaStateValues } = normalizePersonaImportData(data);
  const validFieldKeys = getStateFieldKeySet('persona', worldId);

  const created = runImportTransaction(() => {
    const now = Date.now();
    const personaId = crypto.randomUUID();
    insertPersonaRows([personaRow(personaId, worldId, persona, getNextPersonaSortOrder(worldId), now)]);
    insertStateValueRows('persona', stateValueRows(
      { persona_id: personaId, world_id: worldId }, personaStateValues, validFieldKeys, now,
    ));
    return getPersonaById(personaId);
  });
  log.info(`persona.import  ${formatMeta({ personaId: created?.id, worldId, name: created?.name })}`);
  return created;
}

// ─── 导出世界卡 ──────────────────────────────────────────────────────────────

export function exportWorld(worldId) {
  const world = getWorldById(worldId);
  if (!world) throw new Error('世界不存在');

  const worldPromptEntries = listPromptEntriesForExport(worldId).map(serializeWorldPromptEntry);
  const worldStateFields = listStateFieldsForExport('world', worldId).map(parseStateFieldRow);
  const characterStateFields = listStateFieldsForExport('character', worldId).map(parseStateFieldRow);
  const worldStateValues = listStateValuesForExport('world', worldId);

  const { avatarBase64: coverBase64, avatarMime: coverMime } = readExportImage(world.cover_path);

  // 导出角色（含 state_values）
  const characters = listCharactersForExport(worldId).map(exportWorldCharacter);

  const personaStateFields = listStateFieldsForExport('persona', worldId).map(parseStateFieldRow);

  const allPersonaRows = listPersonasForExport(worldId);
  const resolvedActivePersonaId = world.active_persona_id ?? allPersonaRows[0]?.id ?? null;
  const personas = allPersonaRows.map((p) => exportWorldPersona(p, resolvedActivePersonaId));

  return {
    format: EXPORT_FORMAT_WORLD,
    world: {
      name: world.name,
      description: world.description ?? '',
      cover_path: world.cover_path ?? null,
      temperature: world.temperature ?? null,
      max_tokens: world.max_tokens ?? null,
      accent_color: world.accent_color ?? null,
      accent_source: world.accent_source ?? null,
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

  const created = runImportTransaction(() => createImportedWorld(data));
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

  const cssSnippets = listGlobalCssSnippetsForExport(mode);
  const regexRules = listGlobalRegexRulesForExport(mode);

  const base = {
    format: EXPORT_FORMAT_GLOBAL_SETTINGS,
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
          thinking_level: writingLlm.thinking_level ?? null,
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

function globalCssSnippetRows(data, mode, now) {
  return (data.custom_css_snippets ?? []).map((snippet) => ({
    id: crypto.randomUUID(),
    name: snippet.name ?? '',
    content: snippet.content ?? '',
    enabled: snippet.enabled ? 1 : 0,
    mode,
    sort_order: snippet.sort_order ?? 0,
    created_at: now,
    updated_at: now,
  }));
}

function globalRegexRuleRows(data, mode, now) {
  const validScopes = new Set(['user_input', 'ai_output', 'display_only', 'prompt_only']);
  return (data.regex_rules ?? [])
    .filter((rule) => !rule.scope || validScopes.has(rule.scope))
    .map((rule) => ({
      id: crypto.randomUUID(),
      name: rule.name ?? '',
      pattern: rule.pattern ?? '',
      replacement: rule.replacement ?? '',
      scope: rule.scope ?? 'display_only',
      mode,
      enabled: rule.enabled ? 1 : 0,
      sort_order: rule.sort_order ?? 0,
      created_at: now,
      updated_at: now,
    }));
}

function buildPromptConfigPatch(config) {
  const patch = {};
  if (typeof config.global_system_prompt === 'string') patch.global_system_prompt = config.global_system_prompt;
  if (typeof config.global_post_prompt === 'string') patch.global_post_prompt = config.global_post_prompt;
  return patch;
}

function buildChatConfigPatch(config) {
  const patch = buildPromptConfigPatch(config);
  if (typeof config.context_history_rounds === 'number') patch.context_history_rounds = config.context_history_rounds;
  if (typeof config.memory_expansion_enabled === 'boolean') patch.memory_expansion_enabled = config.memory_expansion_enabled;
  return patch;
}

function buildWritingConfigPatch(writing) {
  const patch = buildPromptConfigPatch(writing);
  if (writing.context_history_rounds === null || typeof writing.context_history_rounds === 'number') {
    patch.context_history_rounds = writing.context_history_rounds;
  }
  if (writing.llm && typeof writing.llm === 'object') {
    const llmPatch = {};
    if (writing.llm.provider === null || typeof writing.llm.provider === 'string') llmPatch.provider = writing.llm.provider;
    if (writing.llm.provider_models && typeof writing.llm.provider_models === 'object' && !Array.isArray(writing.llm.provider_models)) {
      llmPatch.provider_models = writing.llm.provider_models;
    }
    if (writing.llm.base_url === null || typeof writing.llm.base_url === 'string') llmPatch.base_url = writing.llm.base_url;
    if (typeof writing.llm.model === 'string') llmPatch.model = writing.llm.model;
    if (writing.llm.temperature === null || typeof writing.llm.temperature === 'number') llmPatch.temperature = writing.llm.temperature;
    if (writing.llm.max_tokens === null || typeof writing.llm.max_tokens === 'number') llmPatch.max_tokens = writing.llm.max_tokens;
    if (writing.llm.thinking_level === null || typeof writing.llm.thinking_level === 'string') llmPatch.thinking_level = writing.llm.thinking_level;
    patch.llm = llmPatch;
  }
  return patch;
}

function applyGlobalSettingsConfig(data, mode) {
  if (mode === 'chat' && data.config && typeof data.config === 'object') {
    const patch = buildChatConfigPatch(data.config);
    if (Object.keys(patch).length > 0) updateConfig(patch);
  }

  if (mode === 'writing' && data.writing && typeof data.writing === 'object') {
    const writingPatch = buildWritingConfigPatch(data.writing);
    if (Object.keys(writingPatch).length > 0) updateConfig({ writing: writingPatch });
  }
}

// ─── 导入全局设置 ─────────────────────────────────────────────────────────────

export function importGlobalSettings(data) {
  if (!data || data.format !== EXPORT_FORMAT_GLOBAL_SETTINGS) {
    throw new Error('全局设置文件格式不正确');
  }

  // 兼容旧格式（无 mode 字段）：默认按 chat 处理
  const mode = data.mode === 'writing' ? 'writing' : 'chat';
  const now = Date.now();
  runImportTransaction(() => replaceGlobalSettingsRows(
    mode, globalCssSnippetRows(data, mode, now), globalRegexRuleRows(data, mode, now),
  ));
  applyGlobalSettingsConfig(data, mode);

  log.info(`global_settings.import  ${formatMeta({
    mode,
    cssSnippets: (data.custom_css_snippets ?? []).length,
    regexRules: (data.regex_rules ?? []).length,
  })}`);
  return { ok: true, mode };
}

// ─── 全量迁移导出 ──────────────────────────────────────────────────────────────

export function exportMigration() {
  const worldIds = listWorldIdsForExport();
  return {
    format: EXPORT_FORMAT_MIGRATION,
    exported_at: new Date().toISOString(),
    global_settings: {
      chat: exportGlobalSettings('chat'),
      writing: exportGlobalSettings('writing'),
    },
    worlds: worldIds.map((id) => exportWorld(id)),
  };
}

// ─── 全量迁移导入 ──────────────────────────────────────────────────────────────

export function importMigration(data) {
  if (!data || data.format !== EXPORT_FORMAT_MIGRATION) {
    throw new Error('全量迁移文件格式不正确');
  }

  const results = { global_settings: {}, worlds: [] };

  if (data.global_settings?.chat) {
    results.global_settings.chat = importGlobalSettings(data.global_settings.chat);
  }
  if (data.global_settings?.writing) {
    results.global_settings.writing = importGlobalSettings(data.global_settings.writing);
  }
  for (const worldData of (data.worlds ?? [])) {
    const world = importWorld(worldData);
    results.worlds.push({ id: world.id, name: world.name });
  }

  log.info(`migration.import  ${formatMeta({ worlds: results.worlds.length })}`);
  return results;
}
