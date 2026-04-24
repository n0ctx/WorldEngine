import { MAX_ATTACHMENT_SIZE_MB } from '../utils/constants.js';

const MAX_CARD_PAYLOAD_BYTES = 8 * 1024 * 1024;
const MAX_CARD_ARRAY_ITEMS = 500;
const MAX_TEXT_FIELD_LENGTH = 100000;
const MAX_NAME_LENGTH = 200;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertPlainObject(value, label) {
  assert(isPlainObject(value), `${label} 必须是对象`);
}

function assertOptionalString(value, label, maxLength = MAX_TEXT_FIELD_LENGTH) {
  if (value === undefined || value === null) {
    return;
  }

  assert(typeof value === 'string', `${label} 必须为字符串`);
  assert(value.length <= maxLength, `${label} 过长`);
}

function assertRequiredString(value, label, maxLength = MAX_TEXT_FIELD_LENGTH) {
  assert(typeof value === 'string' && value.length > 0, `${label} 为必填字符串`);
  assert(value.length <= maxLength, `${label} 过长`);
}

function assertOptionalNumber(value, label) {
  if (value === undefined || value === null) {
    return;
  }

  assert(typeof value === 'number' && Number.isFinite(value), `${label} 必须为数字`);
}

function assertArray(value, label) {
  assert(Array.isArray(value), `${label} 必须为数组`);
  assert(value.length <= MAX_CARD_ARRAY_ITEMS, `${label} 数量过多`);
}

function assertJsonStringOrNull(value, label) {
  if (value === null) {
    return;
  }

  assert(typeof value === 'string', `${label} 必须为 JSON 字符串或 null`);
}

function decodeBase64Size(base64) {
  return Buffer.from(base64, 'base64').length;
}

function assertAvatarPayload(base64, mime, label) {
  if (base64 === undefined && mime === undefined) {
    return;
  }

  assert(typeof base64 === 'string' && base64.length > 0, `${label} 缺少 avatar_base64`);
  assert(typeof mime === 'string' && mime.startsWith('image/'), `${label} 的 avatar_mime 不合法`);
  assert(decodeBase64Size(base64) <= MAX_ATTACHMENT_SIZE_MB * 1024 * 1024, `${label} 头像过大`);
}

function assertPromptEntries(entries, label) {
  assertArray(entries, label);
  for (const [index, entry] of entries.entries()) {
    assertPlainObject(entry, `${label}[${index}]`);
    assertRequiredString(entry.title, `${label}[${index}].title`, MAX_NAME_LENGTH);
    assertOptionalString(entry.summary, `${label}[${index}].summary`);
    assertOptionalString(entry.content, `${label}[${index}].content`);
    if (entry.keywords !== undefined && entry.keywords !== null) {
      assertArray(entry.keywords, `${label}[${index}].keywords`);
      for (const [keywordIndex, keyword] of entry.keywords.entries()) {
        assertRequiredString(keyword, `${label}[${index}].keywords[${keywordIndex}]`, MAX_NAME_LENGTH);
      }
    }
    assertOptionalString(entry.trigger_type, `${label}[${index}].trigger_type`, 20);
    if (entry.conditions !== undefined && entry.conditions !== null) {
      assertArray(entry.conditions, `${label}[${index}].conditions`);
      for (const [cIndex, cond] of entry.conditions.entries()) {
        assertPlainObject(cond, `${label}[${index}].conditions[${cIndex}]`);
        assertRequiredString(cond.target_field, `${label}[${index}].conditions[${cIndex}].target_field`, MAX_NAME_LENGTH);
        assertRequiredString(cond.operator, `${label}[${index}].conditions[${cIndex}].operator`, 20);
        assertRequiredString(cond.value, `${label}[${index}].conditions[${cIndex}].value`, MAX_NAME_LENGTH);
      }
    }
    assertOptionalNumber(entry.sort_order, `${label}[${index}].sort_order`);
  }
}

function assertStateValues(values, label) {
  assertArray(values, label);
  for (const [index, value] of values.entries()) {
    assertPlainObject(value, `${label}[${index}]`);
    assertRequiredString(value.field_key, `${label}[${index}].field_key`, MAX_NAME_LENGTH);
    assertJsonStringOrNull(value.value_json, `${label}[${index}].value_json`);
  }
}

function assertStateFields(fields, label) {
  assertArray(fields, label);
  for (const [index, field] of fields.entries()) {
    assertPlainObject(field, `${label}[${index}]`);
    assertRequiredString(field.field_key, `${label}[${index}].field_key`, MAX_NAME_LENGTH);
    assertRequiredString(field.label, `${label}[${index}].label`, MAX_NAME_LENGTH);
    assertRequiredString(field.type, `${label}[${index}].type`, 20);
    assertOptionalString(field.description, `${label}[${index}].description`);
    assertJsonStringOrNull(field.default_value ?? null, `${label}[${index}].default_value`);
    assertOptionalString(field.update_mode, `${label}[${index}].update_mode`, 30);
    assertOptionalString(field.trigger_mode, `${label}[${index}].trigger_mode`, 30);
    if (field.trigger_keywords !== undefined && field.trigger_keywords !== null) {
      assertArray(field.trigger_keywords, `${label}[${index}].trigger_keywords`);
    }
    if (field.enum_options !== undefined && field.enum_options !== null) {
      assertArray(field.enum_options, `${label}[${index}].enum_options`);
    }
    assertOptionalNumber(field.min_value, `${label}[${index}].min_value`);
    assertOptionalNumber(field.max_value, `${label}[${index}].max_value`);
    if (field.allow_empty !== undefined && field.allow_empty !== null) {
      assert(field.allow_empty === 0 || field.allow_empty === 1, `${label}[${index}].allow_empty 必须为 0 或 1`);
    }
    assertOptionalString(field.update_instruction, `${label}[${index}].update_instruction`);
    assertOptionalNumber(field.sort_order, `${label}[${index}].sort_order`);
  }
}

function assertCharacterCore(character, label) {
  assertPlainObject(character, label);
  assertRequiredString(character.name, `${label}.name`, MAX_NAME_LENGTH);
  assertOptionalString(character.system_prompt, `${label}.system_prompt`);
  assertOptionalString(character.first_message, `${label}.first_message`);
  assertOptionalString(character.post_prompt, `${label}.post_prompt`);
  assertOptionalString(character.avatar_path, `${label}.avatar_path`, MAX_TEXT_FIELD_LENGTH);
  assertAvatarPayload(character.avatar_base64, character.avatar_mime, label);
}

function assertPayloadSize(data) {
  const bytes = Buffer.byteLength(JSON.stringify(data), 'utf-8');
  assert(bytes <= MAX_CARD_PAYLOAD_BYTES, '导入卡过大');
}

export function validateCharacterImportPayload(data) {
  assertPayloadSize(data);
  assertPlainObject(data, '角色卡');
  assert(data.format === 'worldengine-character-v1', '不支持的角色卡格式');
  assertCharacterCore(data.character, 'character');
  assertPromptEntries(data.prompt_entries ?? [], 'prompt_entries');
  assertStateValues(data.character_state_values ?? [], 'character_state_values');
}

export function validateWorldImportPayload(data) {
  assertPayloadSize(data);
  assertPlainObject(data, '世界卡');
  assert(data.format === 'worldengine-world-v1', '不支持的世界卡格式');
  assertPlainObject(data.world, 'world');
  assertRequiredString(data.world.name, 'world.name', MAX_NAME_LENGTH);
  // world.system_prompt / post_prompt 已废弃，由 prompt_entries 接管；保留读取兼容，无需验证
  assertOptionalNumber(data.world.temperature, 'world.temperature');
  assertOptionalNumber(data.world.max_tokens, 'world.max_tokens');

  if (data.persona !== undefined && data.persona !== null) {
    assertPlainObject(data.persona, 'persona');
    assertOptionalString(data.persona.name, 'persona.name', MAX_NAME_LENGTH);
    assertOptionalString(data.persona.system_prompt, 'persona.system_prompt');
  }

  assertPromptEntries(data.prompt_entries ?? [], 'prompt_entries');
  assertStateFields(data.world_state_fields ?? [], 'world_state_fields');
  assertStateFields(data.character_state_fields ?? [], 'character_state_fields');
  assertStateFields(data.persona_state_fields ?? [], 'persona_state_fields');
  assertStateValues(data.world_state_values ?? [], 'world_state_values');
  assertStateValues(data.persona_state_values ?? [], 'persona_state_values');

  assertArray(data.characters ?? [], 'characters');
  for (const [index, character] of (data.characters ?? []).entries()) {
    assertCharacterCore(character, `characters[${index}]`);
    assertOptionalNumber(character.sort_order, `characters[${index}].sort_order`);
    assertPromptEntries(character.prompt_entries ?? [], `characters[${index}].prompt_entries`);
    assertStateValues(character.character_state_values ?? [], `characters[${index}].character_state_values`);
  }
}
