import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.resolve(__dirname, '..', '..', 'data');
const AVATARS_DIR = path.join(DATA_ROOT, 'uploads', 'avatars');

// ─── 导出角色卡 ──────────────────────────────────────────────────────────────

export function exportCharacter(characterId) {
  const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
  if (!character) throw new Error('角色不存在');

  const promptEntries = db.prepare(
    'SELECT title, summary, content, keywords, sort_order FROM character_prompt_entries WHERE character_id = ? ORDER BY sort_order ASC',
  ).all(characterId).map((e) => ({
    ...e,
    keywords: e.keywords ? JSON.parse(e.keywords) : null,
  }));

  const stateValues = db.prepare(
    'SELECT field_key, value_json FROM character_state_values WHERE character_id = ?',
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
    prompt_entries: promptEntries,
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
  if (data.format !== 'worldengine-character-v1') {
    throw new Error('不支持的角色卡格式');
  }

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
    let avatarPath = null;
    if (data.character.avatar_base64 && data.character.avatar_mime) {
      const ext = data.character.avatar_mime.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
      const filename = `${characterId}.${ext}`;
      fs.writeFileSync(
        path.join(AVATARS_DIR, filename),
        Buffer.from(data.character.avatar_base64, 'base64'),
      );
      avatarPath = `avatars/${filename}`;
    }

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

    // 插入 prompt_entries
    const insertEntry = db.prepare(`
      INSERT INTO character_prompt_entries (id, character_id, title, summary, content, keywords, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const entry of (data.prompt_entries ?? [])) {
      insertEntry.run(
        crypto.randomUUID(), characterId,
        entry.title, entry.summary ?? '', entry.content ?? '',
        entry.keywords != null ? JSON.stringify(entry.keywords) : null,
        entry.sort_order ?? 0,
        now, now,
      );
    }

    // 插入 state_values（只导入 field_key 在目标世界中存在的）
    const insertValue = db.prepare(`
      INSERT INTO character_state_values (id, character_id, field_key, value_json, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const sv of (data.character_state_values ?? [])) {
      if (validFieldKeys.has(sv.field_key)) {
        insertValue.run(
          crypto.randomUUID(), characterId,
          sv.field_key, sv.value_json,
          now,
        );
      }
    }

    return db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId);
  });

  return doImport();
}

// ─── 导出世界卡 ──────────────────────────────────────────────────────────────

export function exportWorld(worldId) {
  const world = db.prepare('SELECT * FROM worlds WHERE id = ?').get(worldId);
  if (!world) throw new Error('世界不存在');

  const worldPromptEntries = db.prepare(
    'SELECT title, summary, content, keywords, sort_order FROM world_prompt_entries WHERE world_id = ? ORDER BY sort_order ASC',
  ).all(worldId).map((e) => ({
    ...e,
    keywords: e.keywords ? JSON.parse(e.keywords) : null,
  }));

  const worldStateFields = db.prepare(
    'SELECT field_key, label, type, description, default_value, update_mode, trigger_mode, trigger_keywords, enum_options, min_value, max_value, allow_empty, update_instruction, sort_order FROM world_state_fields WHERE world_id = ? ORDER BY sort_order ASC',
  ).all(worldId).map((f) => ({
    ...f,
    trigger_keywords: f.trigger_keywords ? JSON.parse(f.trigger_keywords) : null,
    enum_options: f.enum_options ? JSON.parse(f.enum_options) : null,
  }));

  const characterStateFields = db.prepare(
    'SELECT field_key, label, type, description, default_value, update_mode, trigger_mode, trigger_keywords, enum_options, min_value, max_value, allow_empty, update_instruction, sort_order FROM character_state_fields WHERE world_id = ? ORDER BY sort_order ASC',
  ).all(worldId).map((f) => ({
    ...f,
    trigger_keywords: f.trigger_keywords ? JSON.parse(f.trigger_keywords) : null,
    enum_options: f.enum_options ? JSON.parse(f.enum_options) : null,
  }));

  const worldStateValues = db.prepare(
    'SELECT field_key, value_json FROM world_state_values WHERE world_id = ?',
  ).all(worldId);

  // 导出角色（含 prompt_entries 和 state_values）
  const characters = db.prepare(
    'SELECT * FROM characters WHERE world_id = ? ORDER BY sort_order ASC, created_at ASC',
  ).all(worldId).map((character) => {
    const entries = db.prepare(
      'SELECT title, summary, content, keywords, sort_order FROM character_prompt_entries WHERE character_id = ? ORDER BY sort_order ASC',
    ).all(character.id).map((e) => ({
      ...e,
      keywords: e.keywords ? JSON.parse(e.keywords) : null,
    }));

    const stateValues = db.prepare(
      'SELECT field_key, value_json FROM character_state_values WHERE character_id = ?',
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
      prompt_entries: entries,
      character_state_values: stateValues,
    };
  });

  const persona = db.prepare('SELECT name, system_prompt FROM personas WHERE world_id = ?').get(worldId);

  const personaStateFields = db.prepare(
    'SELECT field_key, label, type, description, default_value, update_mode, trigger_mode, trigger_keywords, enum_options, min_value, max_value, allow_empty, update_instruction, sort_order FROM persona_state_fields WHERE world_id = ? ORDER BY sort_order ASC',
  ).all(worldId).map((f) => ({
    ...f,
    trigger_keywords: f.trigger_keywords ? JSON.parse(f.trigger_keywords) : null,
    enum_options: f.enum_options ? JSON.parse(f.enum_options) : null,
  }));

  const personaStateValues = db.prepare(
    'SELECT field_key, value_json FROM persona_state_values WHERE world_id = ?',
  ).all(worldId);

  return {
    format: 'worldengine-world-v1',
    world: {
      name: world.name,
      system_prompt: world.system_prompt,
      temperature: world.temperature ?? null,
      max_tokens: world.max_tokens ?? null,
    },
    persona: persona ? { name: persona.name, system_prompt: persona.system_prompt } : null,
    prompt_entries: worldPromptEntries,
    world_state_fields: worldStateFields,
    character_state_fields: characterStateFields,
    persona_state_fields: personaStateFields,
    world_state_values: worldStateValues,
    persona_state_values: personaStateValues,
    characters,
  };
}

// ─── 导入世界卡 ──────────────────────────────────────────────────────────────

export function importWorld(data) {
  if (data.format !== 'worldengine-world-v1') {
    throw new Error('不支持的世界卡格式');
  }

  const doImport = db.transaction(() => {
    const now = Date.now();
    const worldId = crypto.randomUUID();

    // 插入世界
    db.prepare(`
      INSERT INTO worlds (id, name, system_prompt, temperature, max_tokens, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      worldId,
      data.world.name,
      data.world.system_prompt ?? '',
      data.world.temperature ?? null,
      data.world.max_tokens ?? null,
      now, now,
    );

    // 插入 persona（兼容旧格式：world.persona_name / persona_prompt 字段）
    const personaName = data.persona?.name ?? data.world?.persona_name ?? '';
    const personaSystemPrompt = data.persona?.system_prompt ?? data.world?.persona_prompt ?? '';
    db.prepare(`
      INSERT INTO personas (id, world_id, name, system_prompt, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), worldId, personaName, personaSystemPrompt, now, now);

    // 插入世界 prompt_entries
    const insertWorldEntry = db.prepare(`
      INSERT INTO world_prompt_entries (id, world_id, title, summary, content, keywords, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const entry of (data.prompt_entries ?? [])) {
      insertWorldEntry.run(
        crypto.randomUUID(), worldId,
        entry.title, entry.summary ?? '', entry.content ?? '',
        entry.keywords != null ? JSON.stringify(entry.keywords) : null,
        entry.sort_order ?? 0,
        now, now,
      );
    }

    // 插入世界状态字段定义
    const insertWorldField = db.prepare(`
      INSERT INTO world_state_fields (
        id, world_id, field_key, label, type, description,
        default_value, update_mode, trigger_mode, trigger_keywords,
        enum_options, min_value, max_value, allow_empty,
        update_instruction, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const field of (data.world_state_fields ?? [])) {
      insertWorldField.run(
        crypto.randomUUID(), worldId,
        field.field_key, field.label, field.type,
        field.description ?? '',
        field.default_value ?? null,
        field.update_mode ?? 'manual',
        field.trigger_mode ?? 'manual_only',
        field.trigger_keywords != null ? JSON.stringify(field.trigger_keywords) : null,
        field.enum_options != null ? JSON.stringify(field.enum_options) : null,
        field.min_value ?? null,
        field.max_value ?? null,
        field.allow_empty ?? 1,
        field.update_instruction ?? '',
        field.sort_order ?? 0,
        now, now,
      );
    }

    // 插入角色状态字段定义
    const insertCharField = db.prepare(`
      INSERT INTO character_state_fields (
        id, world_id, field_key, label, type, description,
        default_value, update_mode, trigger_mode, trigger_keywords,
        enum_options, min_value, max_value, allow_empty,
        update_instruction, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const field of (data.character_state_fields ?? [])) {
      insertCharField.run(
        crypto.randomUUID(), worldId,
        field.field_key, field.label, field.type,
        field.description ?? '',
        field.default_value ?? null,
        field.update_mode ?? 'manual',
        field.trigger_mode ?? 'manual_only',
        field.trigger_keywords != null ? JSON.stringify(field.trigger_keywords) : null,
        field.enum_options != null ? JSON.stringify(field.enum_options) : null,
        field.min_value ?? null,
        field.max_value ?? null,
        field.allow_empty ?? 1,
        field.update_instruction ?? '',
        field.sort_order ?? 0,
        now, now,
      );
    }

    // 插入世界状态当前值
    const insertWorldValue = db.prepare(`
      INSERT INTO world_state_values (id, world_id, field_key, value_json, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    // 获取合法的 world field_key 集合（刚刚插入的）
    const validWorldFieldKeys = new Set((data.world_state_fields ?? []).map((f) => f.field_key));
    for (const sv of (data.world_state_values ?? [])) {
      if (validWorldFieldKeys.has(sv.field_key)) {
        insertWorldValue.run(crypto.randomUUID(), worldId, sv.field_key, sv.value_json, now);
      }
    }

    // 插入玩家状态字段定义
    const insertPersonaField = db.prepare(`
      INSERT INTO persona_state_fields (
        id, world_id, field_key, label, type, description,
        default_value, update_mode, trigger_mode, trigger_keywords,
        enum_options, min_value, max_value, allow_empty,
        update_instruction, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const field of (data.persona_state_fields ?? [])) {
      insertPersonaField.run(
        crypto.randomUUID(), worldId,
        field.field_key, field.label, field.type,
        field.description ?? '',
        field.default_value ?? null,
        field.update_mode ?? 'manual',
        field.trigger_mode ?? 'manual_only',
        field.trigger_keywords != null ? JSON.stringify(field.trigger_keywords) : null,
        field.enum_options != null ? JSON.stringify(field.enum_options) : null,
        field.min_value ?? null,
        field.max_value ?? null,
        field.allow_empty ?? 1,
        field.update_instruction ?? '',
        field.sort_order ?? 0,
        now, now,
      );
    }

    // 插入玩家状态当前值
    const insertPersonaValue = db.prepare(`
      INSERT INTO persona_state_values (id, world_id, field_key, value_json, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const validPersonaFieldKeys = new Set((data.persona_state_fields ?? []).map((f) => f.field_key));
    for (const sv of (data.persona_state_values ?? [])) {
      if (validPersonaFieldKeys.has(sv.field_key)) {
        insertPersonaValue.run(crypto.randomUUID(), worldId, sv.field_key, sv.value_json, now);
      }
    }

    // 获取合法的 character field_key 集合
    const validCharFieldKeys = new Set((data.character_state_fields ?? []).map((f) => f.field_key));

    // 插入角色
    const insertCharacter = db.prepare(`
      INSERT INTO characters (id, world_id, name, system_prompt, first_message, avatar_path, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertCharEntry = db.prepare(`
      INSERT INTO character_prompt_entries (id, character_id, title, summary, content, keywords, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertCharValue = db.prepare(`
      INSERT INTO character_state_values (id, character_id, field_key, value_json, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const charData of (data.characters ?? [])) {
      const characterId = crypto.randomUUID();

      // 处理头像
      let avatarPath = null;
      if (charData.avatar_base64 && charData.avatar_mime) {
        const ext = charData.avatar_mime.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
        const filename = `${characterId}.${ext}`;
        fs.writeFileSync(
          path.join(AVATARS_DIR, filename),
          Buffer.from(charData.avatar_base64, 'base64'),
        );
        avatarPath = `avatars/${filename}`;
      }

      insertCharacter.run(
        characterId, worldId,
        charData.name,
        charData.system_prompt ?? '',
        charData.first_message ?? '',
        avatarPath,
        charData.sort_order ?? 0,
        now, now,
      );

      for (const entry of (charData.prompt_entries ?? [])) {
        insertCharEntry.run(
          crypto.randomUUID(), characterId,
          entry.title, entry.summary ?? '', entry.content ?? '',
          entry.keywords != null ? JSON.stringify(entry.keywords) : null,
          entry.sort_order ?? 0,
          now, now,
        );
      }

      for (const sv of (charData.character_state_values ?? [])) {
        if (validCharFieldKeys.has(sv.field_key)) {
          insertCharValue.run(
            crypto.randomUUID(), characterId,
            sv.field_key, sv.value_json,
            now,
          );
        }
      }
    }

    return db.prepare('SELECT * FROM worlds WHERE id = ?').get(worldId);
  });

  return doImport();
}
