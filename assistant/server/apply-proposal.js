/**
 * 提案执行：把 normalizeProposal 归一化后的提案按资源类型落库（创建/更新/删除）。
 */

import { createWorld, updateWorld, deleteWorld } from '../../backend/services/worlds.js';
import { createCharacter, updateCharacter, deleteCharacter } from '../../backend/services/characters.js';
import { updatePersona, updatePersonaByIdService } from '../../backend/services/personas.js';
import { updateConfig } from '../../backend/services/config.js';
import {
  createWorldPromptEntry,
  updateWorldPromptEntry,
  deleteWorldPromptEntry,
} from '../../backend/services/prompt-entries.js';
import {
  createWorldStateField,
  updateWorldStateField,
  deleteWorldStateField,
} from '../../backend/services/world-state-fields.js';
import {
  createCharacterStateField,
  listCharacterStateFields,
  updateCharacterStateField,
  deleteCharacterStateField,
} from '../../backend/services/character-state-fields.js';
import {
  createPersonaStateField,
  getPersonaStateFieldsByWorldId,
  updatePersonaStateField,
  deletePersonaStateField,
} from '../../backend/services/persona-state-fields.js';
import {
  createCustomCssSnippet,
  updateCustomCssSnippet,
  deleteCustomCssSnippet,
} from '../../backend/db/queries/custom-css-snippets.js';
import {
  createRegexRule,
  updateRegexRule,
  deleteRegexRule,
} from '../../backend/db/queries/regex-rules.js';
import { applyAssistantThemeOp } from '../../backend/services/themes.js';
import {
  replaceEntryConditions,
} from '../../backend/db/queries/entry-conditions.js';
import { createPersona as createPersonaDb, setActivePersona, getPersonaById } from '../../backend/db/queries/personas.js';
import {
  updateCharacterDefaultStateValueValidated,
  updatePersonaDefaultStateValueByPersonaIdValidated,
  updatePersonaDefaultStateValueValidated,
  validateStateValue,
} from '../../backend/services/state-values.js';
import { getCharacterById } from '../../backend/db/queries/characters.js';
import { createLogger, formatMeta } from '../../backend/utils/logger.js';
import { STATE_FIELD_KEYS } from './proposal-state-ops.js';
import { VALID_REGEX_SCOPES, pickAllowed, deepOmit } from './proposal-values.js';

const log = createLogger('as-route', 'yellow');

// ─── 提案执行器 ───────────────────────────────────────────────────

async function applyProposal(proposal, worldRefId = null) {
  const { type, operation = 'update', entityId, changes = {}, newEntries = [] } = proposal;
  log.info(`apply START  ${formatMeta({ type, operation, entityId: entityId ?? null, worldRefId: worldRefId ?? null })}`);

  switch (type) {
    case 'world-card':
      if (operation === 'create') return createWorldProposal(proposal, changes);
      if (operation === 'delete') return deleteWorldProposal(entityId);
      return updateWorldProposal(proposal, { entityId, changes, newEntries });
    case 'character-card':
      if (operation === 'create') return createCharacterProposal(proposal, { entityId, changes, worldRefId });
      if (operation === 'delete') return deleteCharacterProposal(entityId);
      return updateCharacterProposal(proposal, { entityId, changes });
    case 'persona-card':
      if (operation === 'create') return createPersonaProposal(proposal, { entityId, changes });
      return updatePersonaProposal(proposal, { entityId, changes });
    case 'global-config': return applyGlobalConfigProposal(changes);
    case 'css-snippet': return applyCssSnippetProposal({ operation, entityId, changes });
    case 'theme': return applyThemeProposal({ operation, entityId, changes });
    case 'regex-rule': return applyRegexRuleProposal({ operation, entityId, changes });

    default:
      throw new Error(`未知的提案类型：${type}`);
  }
}

function createWorldProposal(proposal, changes) {
  const entryOps = Array.isArray(proposal.entryOps) ? proposal.entryOps : [];
  const stateFieldOps = Array.isArray(proposal.stateFieldOps) ? proposal.stateFieldOps : [];
  assertWorldCreateOps(entryOps, stateFieldOps);

  const safeChanges = pickAllowed(changes, ['name', 'description', 'temperature', 'max_tokens']);
  const newWorld = createWorld({
    name: safeChanges.name || '新世界',
    description: safeChanges.description ?? '',
    temperature: safeChanges.temperature ?? null,
    max_tokens: safeChanges.max_tokens ?? null,
  });
  applyWorldEntryOps(entryOps, newWorld.id);
  for (const op of stateFieldOps) applyStateFieldCreate(op, newWorld.id);
  return newWorld;
}

function assertWorldCreateOps(entryOps, stateFieldOps) {
  for (const op of entryOps) {
    if (op.op !== 'create') {
      throw new Error(`world-card create 的 entryOps 只支持 op:create（收到 "${op.op}"）；要改/删已有条目请改用 world-card update`);
    }
  }
  for (const op of stateFieldOps) {
    if (op.op !== 'create') {
      throw new Error(`world-card create 的 stateFieldOps 只支持 op:create（收到 "${op.op}"）；要改/删已有字段请改用 world-card update`);
    }
  }
}

async function deleteWorldProposal(entityId) {
  if (!entityId) throw new Error('world-card delete 需要 entityId');
  await deleteWorld(entityId);
  return { deleted: entityId };
}

async function updateWorldProposal(proposal, { entityId, changes, newEntries }) {
  if (!entityId) throw new Error('world-card 提案缺少 entityId');
  const safeChanges = pickAllowed(changes, ['name', 'description', 'temperature', 'max_tokens']);
  const updated = Object.keys(safeChanges).length > 0 ? await updateWorld(entityId, safeChanges) : null;
  const worldOps = proposal.entryOps?.length ? proposal.entryOps : newEntries.map((entry) => ({ op: 'create', ...entry }));
  const createdEntryIds = applyWorldEntryOps(worldOps, entityId);
  await applyWorldStateFieldOps(proposal.stateFieldOps, entityId);
  return { world: updated, createdEntryIds };
}

function applyWorldEntryOps(ops, worldId) {
  const createdEntryIds = [];
  for (const op of ops) {
    const createdEntryId = applyWorldEntryOp(op, worldId);
    if (createdEntryId) createdEntryIds.push(createdEntryId);
  }
  return createdEntryIds;
}

function applyWorldEntryOp(op, worldId) {
  if (op.op === 'create') {
    const entry = createWorldPromptEntry(worldId, op);
    if (Array.isArray(op.conditions) && op.conditions.length > 0 && entry?.trigger_type === 'state') {
      replaceEntryConditions(entry.id, op.conditions);
    }
    return entry.id;
  }
  if (op.op === 'update' && op.id) {
    const updatedEntry = updateWorldPromptEntry(op.id, pickAllowed(op, ['title', 'description', 'content', 'keywords', 'keyword_scope', 'keyword_logic', 'active_turns', 'condition_logic', 'trigger_type', 'token']));
    if (Array.isArray(op.conditions) && updatedEntry?.trigger_type === 'state') {
      replaceEntryConditions(op.id, op.conditions);
    }
  } else if (op.op === 'delete' && op.id) {
    deleteWorldPromptEntry(op.id);
  }
  return null;
}

async function applyWorldStateFieldOps(rawOps, worldId) {
  for (const op of (Array.isArray(rawOps) ? rawOps : [])) {
    if (op.op === 'create') applyStateFieldCreate(op, worldId);
    else if (op.op === 'update' && op.id) await applyStateFieldUpdate(op);
    else if (op.op === 'delete' && op.id) await applyStateFieldDelete(op);
  }
}

function createCharacterProposal(proposal, { entityId, changes, worldRefId }) {
  const worldId = changes.world_id ?? worldRefId ?? entityId;
  if (!worldId) throw new Error('character-card create 需要 worldId（entityId、changes.world_id 或上下文 worldId）');
  preValidateStateValueOps(proposal.stateValueOps, { worldId });
  const safeChanges = pickAllowed(changes, ['name', 'description', 'system_prompt', 'post_prompt', 'first_message']);
  const character = createCharacter({
    world_id: worldId,
    name: safeChanges.name || '新角色',
    description: safeChanges.description || '',
    system_prompt: safeChanges.system_prompt || '',
    post_prompt: safeChanges.post_prompt || '',
    first_message: safeChanges.first_message || '',
  });
  applyStateValueOps(proposal.stateValueOps, { characterId: character.id, worldId });
  return character;
}

async function deleteCharacterProposal(entityId) {
  if (!entityId) throw new Error('character-card delete 需要 entityId');
  await deleteCharacter(entityId);
  return { deleted: entityId };
}

async function updateCharacterProposal(proposal, { entityId, changes }) {
  if (!entityId) throw new Error('character-card 提案缺少 entityId');
  preValidateStateValueOps(proposal.stateValueOps, { characterId: entityId });
  const safeChanges = pickAllowed(changes, ['name', 'description', 'system_prompt', 'post_prompt', 'first_message']);
  const updated = Object.keys(safeChanges).length > 0 ? await updateCharacter(entityId, safeChanges) : null;
  applyStateValueOps(proposal.stateValueOps, { characterId: entityId });
  return updated;
}

function createPersonaProposal(proposal, { entityId, changes }) {
  const worldId = changes.world_id ?? entityId;
  if (!worldId) throw new Error('persona-card create 需要 worldId（entityId 或 changes.world_id）');
  preValidateStateValueOps(proposal.stateValueOps, { worldId });
  const safeChanges = pickAllowed(changes, ['name', 'description', 'system_prompt']);
  const persona = createPersonaDb(worldId, {
    name: safeChanges.name || '新玩家',
    description: safeChanges.description || '',
    system_prompt: safeChanges.system_prompt || '',
  });
  setActivePersona(worldId, persona.id);
  applyStateValueOps(proposal.stateValueOps, { personaId: persona.id, worldId });
  return persona;
}

async function updatePersonaProposal(proposal, { entityId, changes }) {
  const stateValueOps = proposal.stateValueOps;
  if (Array.isArray(stateValueOps) && stateValueOps.length > 0) {
    const worldId = proposal.personaId ? (getPersonaById(proposal.personaId)?.world_id ?? null) : entityId;
    if (!worldId) throw new Error('persona-card 提案缺少 worldId（entityId）或 personaId');
    preValidateStateValueOps(stateValueOps, { worldId });
  }
  const safeChanges = pickAllowed(changes, ['name', 'description', 'system_prompt']);
  let updated;
  if (proposal.personaId) {
    updated = await updatePersonaByIdService(proposal.personaId, safeChanges);
  } else {
    if (!entityId) throw new Error('persona-card 提案缺少 worldId（entityId）或 personaId');
    updated = await updatePersona(entityId, safeChanges);
  }
  const worldId = updated?.world_id ?? entityId;
  applyStateValueOps(stateValueOps, { personaId: updated?.id ?? proposal.personaId ?? null, worldId });
  return updated;
}

function applyGlobalConfigProposal(changes) {
  const safeChanges = deepOmit(changes, ['api_key', 'llm.api_key', 'embedding.api_key']);
  return Object.keys(safeChanges).length > 0 ? updateConfig(safeChanges) : null;
}

function applyCssSnippetProposal({ operation, entityId, changes }) {
  if (operation === 'delete') {
    if (!entityId) throw new Error('css-snippet delete 需要 entityId');
    deleteCustomCssSnippet(entityId);
    return { deleted: entityId };
  }
  if (operation === 'update') {
    if (!entityId) throw new Error('css-snippet update 需要 entityId');
    return updateCustomCssSnippet(entityId, pickAllowed(changes, ['name', 'content', 'mode', 'enabled']));
  }
  return createCustomCssSnippet({
    name: changes.name || '写卡助手生成',
    content: changes.content || '',
    mode: changes.mode || 'chat',
    enabled: changes.enabled ?? 1,
  });
}

function applyThemeProposal({ operation, entityId, changes }) {
  if (!entityId) throw new Error('theme 提案缺少 entityId');
  return applyAssistantThemeOp({ id: entityId, operation, changes });
}

function applyRegexRuleProposal({ operation, entityId, changes }) {
  if (operation === 'delete') {
    if (!entityId) throw new Error('regex-rule delete 需要 entityId');
    deleteRegexRule(entityId);
    return { deleted: entityId };
  }
  if (operation === 'update') {
    if (!entityId) throw new Error('regex-rule update 需要 entityId');
    return updateRegexRule(entityId, pickAllowed(changes, ['name', 'pattern', 'replacement', 'flags', 'scope', 'world_id', 'mode', 'enabled']));
  }
  const scope = VALID_REGEX_SCOPES.has(changes.scope) ? changes.scope : 'display_only';
  return createRegexRule({
    name: changes.name || '写卡助手生成',
    enabled: changes.enabled ?? 1,
    pattern: changes.pattern || '',
    replacement: changes.replacement ?? '',
    flags: changes.flags || 'g',
    scope,
    world_id: changes.world_id ?? null,
    mode: changes.mode || 'chat',
  });
}

// ─── 工具函数 ─────────────────────────────────────────────────────

function applyStateFieldCreate(op, worldId) {
  const data = pickAllowed(op, STATE_FIELD_KEYS);
  try {
    switch (op.target) {
      case 'persona': createPersonaStateField(worldId, data); break;
      case 'character': createCharacterStateField(worldId, data); break;
      case 'world':
      default: createWorldStateField(worldId, data); break;
    }
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      log.warn(`applyStateFieldCreate skip duplicate: target=${op.target}, field_key=${data.field_key}, worldId=${worldId}`);
      return; // 字段已存在视为幂等成功，多步骤创建场景下不阻断后续执行
    }
    throw err;
  }
}

// ── item 3：validate-all-then-apply ──────────────────────────────
// better-sqlite3 事务不能跨 await，而 applyProposal 全程 await services，无法包真事务。
// 改为两遍：先把本提案所有 stateValueOps 逐一离线校验（字段存在性 + 值类型约束），
// 任一不过就整体拒绝、不写任何库；全过才进入真正落库。
// 避免"改名成功但填值失败"留下半完成中间态。
function buildStateFieldMap(target, refs) {
  if (target === 'character') {
    // character 字段定义挂在 world 上：优先用 refs.worldId（create 时角色还没建出来），
    // 否则从 characterId 反查 world_id（update）。
    let worldId = refs.worldId ?? null;
    if (!worldId) {
      const characterId = refs.characterId;
      if (!characterId) throw new Error('character 状态值写入缺少 characterId / worldId');
      const character = getCharacterById(characterId);
      if (!character) throw new Error('角色不存在');
      worldId = character.world_id;
    }
    const fields = listCharacterStateFields(worldId);
    return new Map(fields.map((f) => [f.field_key, f]));
  }
  if (target === 'persona') {
    const worldId = refs.worldId;
    if (!worldId) throw new Error('persona 状态值写入缺少 worldId');
    const fields = getPersonaStateFieldsByWorldId(worldId);
    return new Map(fields.map((f) => [f.field_key, f]));
  }
  throw new Error(`不支持的状态值 target：${target}`);
}

function preValidateStateValueOps(ops, refs) {
  if (!Array.isArray(ops) || ops.length === 0) return;
  const fieldMapByTarget = new Map();
  const failures = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    let fieldMap = fieldMapByTarget.get(op.target);
    if (!fieldMap) {
      fieldMap = buildStateFieldMap(op.target, refs);
      fieldMapByTarget.set(op.target, fieldMap);
    }
    const field = fieldMap.get(op.field_key);
    if (!field) {
      failures.push(`stateValueOps[${i}]: 字段 "${op.field_key}" 不存在（${op.target} 字段会自动追加 ${op.target === 'character' ? '_char' : '_user'} 后缀；若尚未创建，请先用 world-card 的 stateFieldOps 创建它）`);
      continue;
    }
    // 值校验：复刻 normalizeStateValueJson 的 parse + validate，但不写库。
    let parsed;
    if (op.value_json === null) {
      parsed = null;
    } else {
      try { parsed = JSON.parse(op.value_json); } catch {
        failures.push(`stateValueOps[${i}]: 字段 "${op.field_key}" 的 value_json 不是合法 JSON`);
        continue;
      }
    }
    const validated = validateStateValue(parsed, field);
    if (validated === undefined) {
      failures.push(`stateValueOps[${i}]: 字段 "${op.field_key}" 的值不符合类型约束（type=${field.type}）`);
    }
  }
  if (failures.length > 0) {
    // 整体拒绝：抛错前不会有任何 changes / 值被写入（调用方在写 changes 之前先调本函数）。
    throw new Error(`提案校验失败，未做任何改动（validate-all-then-apply）：\n- ${failures.join('\n- ')}`);
  }
}

function applyStateValueOps(ops, refs) {
  for (const op of (Array.isArray(ops) ? ops : [])) applyStateValueOp(op, refs);
}

function applyStateValueOp(op, refs = {}) {
  // field_key 在 normalizeStateValueOps 里已被自动追加 _char/_user 后缀；
  // 若底层报"字段不存在"，多半是该字段尚未由 world-card 创建，或裸键/后缀不一致。
  // 包一层把后缀规则写进错误，便于父代理判断"应先用 world-card 创建该字段"。
  const withFieldHint = (fn) => {
    try {
      fn();
    } catch (err) {
      const msg = String(err?.message ?? err);
      if (/不存在|not found|未找到|无效字段|invalid field/i.test(msg)) {
        throw new Error(
          `${msg}（注意：${op.target} 字段会自动追加 ${op.target === 'character' ? '_char' : '_user'} 后缀，`
          + `实际字段名为 "${op.field_key}"；若该字段尚未创建，请先用 world-card 的 stateFieldOps 创建它）`,
        );
      }
      throw err;
    }
  };
  if (op.target === 'character') {
    const characterId = refs.characterId;
    if (!characterId) throw new Error('character 状态值写入缺少 characterId');
    withFieldHint(() => updateCharacterDefaultStateValueValidated(characterId, op.field_key, op.value_json));
    return;
  }
  if (op.target === 'persona') {
    if (refs.personaId) {
      withFieldHint(() => updatePersonaDefaultStateValueByPersonaIdValidated(refs.personaId, refs.worldId, op.field_key, op.value_json));
      return;
    }
    const worldId = refs.worldId;
    if (!worldId) throw new Error('persona 状态值写入缺少 worldId');
    withFieldHint(() => updatePersonaDefaultStateValueValidated(worldId, op.field_key, op.value_json));
    return;
  }
  throw new Error(`不支持的状态值 target：${op.target}`);
}

async function applyStateFieldUpdate(op) {
  const data = pickAllowed(op, STATE_FIELD_KEYS);
  switch (op.target) {
    case 'persona': updatePersonaStateField(op.id, data); break;
    case 'character': updateCharacterStateField(op.id, data); break;
    case 'world':
    default: updateWorldStateField(op.id, data); break;
  }
}

async function applyStateFieldDelete(op) {
  switch (op.target) {
    case 'persona': await deletePersonaStateField(op.id); break;
    case 'character': await deleteCharacterStateField(op.id); break;
    case 'world':
    default: await deleteWorldStateField(op.id); break;
  }
}

export { applyProposal };
