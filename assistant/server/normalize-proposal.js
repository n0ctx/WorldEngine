/**
 * 提案归一化与执行模块
 *
 * 提供两类核心函数：
 *   - normalizeProposal: 校验并归一化原始 LLM 提案
 *   - applyProposal: 把已归一化的提案落库（创建/更新/删除）
 *
 * 该模块从 routes.js 中抽出，行为与抽出前完全一致。
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
  listWorldStateFields,
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
import { applyAssistantThemeOp, assertThemeId } from '../../backend/services/themes.js';
import {
  replaceEntryConditions,
} from '../../backend/db/queries/entry-conditions.js';
import { createPersona as createPersonaDb, setActivePersona } from '../../backend/db/queries/personas.js';
import {
  updateCharacterDefaultStateValueValidated,
  updatePersonaDefaultStateValueValidated,
} from '../../backend/services/state-values.js';
import { createLogger, formatMeta } from '../../backend/utils/logger.js';

const log = createLogger('as-route', 'yellow');

const VALID_REGEX_SCOPES = new Set(['user_input', 'ai_output', 'display_only', 'prompt_only']);
const VALID_MODES = new Set(['chat', 'writing']);
const VALID_STATE_TYPES = new Set(['number', 'text', 'enum', 'list', 'boolean', 'datetime', 'table']);
const COLUMN_KEY_RE = /^[a-zA-Z0-9_]+$/;
const VALID_UPDATE_MODES = new Set(['llm_auto', 'manual']);
const ISO_LOCAL_DATETIME_RE = /^\d+-\d{2}-\d{2}T\d{2}:\d{2}$/;
const PROPOSAL_ALLOWED_OPERATIONS = {
  'world-card': new Set(['create', 'update', 'delete']),
  'character-card': new Set(['create', 'update', 'delete']),
  'persona-card': new Set(['create', 'update']),
  'global-config': new Set(['update']),
  'css-snippet': new Set(['create', 'update', 'delete']),
  'regex-rule': new Set(['create', 'update', 'delete']),
  'theme': new Set(['create', 'update', 'delete']),
};

const STATE_TARGETS_BY_PROPOSAL_TYPE = {
  'world-card': new Set(['world', 'persona', 'character']),
  'character-card': new Set(),
  'persona-card': new Set(),
};
const STATE_VALUE_TARGETS_BY_PROPOSAL_TYPE = {
  'world-card': new Set(),
  'character-card': new Set(['character']),
  'persona-card': new Set(['persona']),
};

// ─── 提案执行器 ───────────────────────────────────────────────────

async function applyProposal(proposal, worldRefId = null) {
  const { type, operation = 'update', entityId, changes = {}, newEntries = [] } = proposal;
  log.info(`apply START  ${formatMeta({ type, operation, entityId: entityId ?? null, worldRefId: worldRefId ?? null })}`);

  switch (type) {
    case 'world-card': {
      if (operation === 'create') {
        const safeChanges = pickAllowed(changes, ['name', 'description', 'temperature', 'max_tokens']);
        const newWorld = createWorld({
          name: safeChanges.name || '新世界',
          description: safeChanges.description ?? '',
          temperature: safeChanges.temperature ?? null,
          max_tokens: safeChanges.max_tokens ?? null,
        });
        for (const op of (Array.isArray(proposal.entryOps) ? proposal.entryOps : [])) {
          // create 世界时只能附带 create 条目；混入 update/delete 是对一张刚建出来、还没有旧条目的卡的无效操作。
          // 旧实现静默忽略（不报错不落库），属"静默丢字段"。这里显式报错让子代理改用 world-card update。
          if (op.op !== 'create') {
            throw new Error(`world-card create 的 entryOps 只支持 op:create（收到 "${op.op}"）；要改/删已有条目请改用 world-card update`);
          }
          const entry = createWorldPromptEntry(newWorld.id, op);
          if (op.trigger_type === 'state' && Array.isArray(op.conditions) && op.conditions.length > 0) {
            replaceEntryConditions(entry.id, op.conditions);
          }
        }
        for (const op of (Array.isArray(proposal.stateFieldOps) ? proposal.stateFieldOps : [])) {
          if (op.op !== 'create') {
            throw new Error(`world-card create 的 stateFieldOps 只支持 op:create（收到 "${op.op}"）；要改/删已有字段请改用 world-card update`);
          }
          applyStateFieldCreate(op, newWorld.id);
        }
        return newWorld;
      }
      if (operation === 'delete') {
        if (!entityId) throw new Error('world-card delete 需要 entityId');
        await deleteWorld(entityId);
        return { deleted: entityId };
      }
      // update
      if (!entityId) throw new Error('world-card 提案缺少 entityId');
      const safeChanges = pickAllowed(changes, ['name', 'description', 'temperature', 'max_tokens']);
      let updated = null;
      if (Object.keys(safeChanges).length > 0) updated = await updateWorld(entityId, safeChanges);
      const worldOps = proposal.entryOps?.length ? proposal.entryOps : newEntries.map((e) => ({ op: 'create', ...e }));
      for (const op of worldOps) {
        if (op.op === 'create') {
          const entry = createWorldPromptEntry(entityId, op);
          if (op.trigger_type === 'state' && Array.isArray(op.conditions) && op.conditions.length > 0) {
            replaceEntryConditions(entry.id, op.conditions);
          }
        } else if (op.op === 'update' && op.id) {
          updateWorldPromptEntry(op.id, pickAllowed(op, ['title', 'description', 'content', 'keywords', 'keyword_scope', 'keyword_logic', 'active_turns', 'condition_logic', 'trigger_type', 'token']));
          if (op.trigger_type === 'state' && Array.isArray(op.conditions)) {
            replaceEntryConditions(op.id, op.conditions);
          }
        } else if (op.op === 'delete' && op.id) deleteWorldPromptEntry(op.id);
      }
      for (const op of (Array.isArray(proposal.stateFieldOps) ? proposal.stateFieldOps : [])) {
        if (op.op === 'create') applyStateFieldCreate(op, entityId);
        else if (op.op === 'update' && op.id) await applyStateFieldUpdate(op);
        else if (op.op === 'delete' && op.id) await applyStateFieldDelete(op);
      }
      return updated;
    }

    case 'character-card': {
      if (operation === 'create') {
        const worldId = changes.world_id ?? worldRefId ?? entityId;
        if (!worldId) throw new Error('character-card create 需要 worldId（entityId、changes.world_id 或上下文 worldId）');
        const safeChanges = pickAllowed(changes, ['name', 'description', 'system_prompt', 'post_prompt', 'first_message']);
        const newChar = createCharacter({
          world_id: worldId,
          name: safeChanges.name || '新角色',
          description: safeChanges.description || '',
          system_prompt: safeChanges.system_prompt || '',
          post_prompt: safeChanges.post_prompt || '',
          first_message: safeChanges.first_message || '',
        });
        for (const op of (Array.isArray(proposal.stateValueOps) ? proposal.stateValueOps : [])) {
          applyStateValueOp(op, { characterId: newChar.id, worldId });
        }
        return newChar;
      }
      if (operation === 'delete') {
        if (!entityId) throw new Error('character-card delete 需要 entityId');
        await deleteCharacter(entityId);
        return { deleted: entityId };
      }
      // update
      if (!entityId) throw new Error('character-card 提案缺少 entityId');
      const safeChanges = pickAllowed(changes, ['name', 'description', 'system_prompt', 'post_prompt', 'first_message']);
      let updated = null;
      if (Object.keys(safeChanges).length > 0) updated = await updateCharacter(entityId, safeChanges);
      for (const op of (Array.isArray(proposal.stateValueOps) ? proposal.stateValueOps : [])) {
        applyStateValueOp(op, { characterId: entityId });
      }
      return updated;
    }

    case 'persona-card': {
      if (operation === 'create') {
        const worldId = changes.world_id ?? entityId;
        if (!worldId) throw new Error('persona-card create 需要 worldId（entityId 或 changes.world_id）');
        const safeChanges = pickAllowed(changes, ['name', 'description', 'system_prompt']);
        const newPersona = createPersonaDb(worldId, {
          name: safeChanges.name || '新玩家',
          description: safeChanges.description || '',
          system_prompt: safeChanges.system_prompt || '',
        });
        // 新建 persona 立即设为 active，后续 stateValueOps 写入其独立状态值行
        setActivePersona(worldId, newPersona.id);
        for (const op of (Array.isArray(proposal.stateValueOps) ? proposal.stateValueOps : [])) {
          applyStateValueOp(op, { worldId });
        }
        return newPersona;
      }
      // update
      const safeChanges = pickAllowed(changes, ['name', 'description', 'system_prompt']);
      let updated;
      if (proposal.personaId) {
        // 直接按 personaId 更新指定玩家卡
        updated = await updatePersonaByIdService(proposal.personaId, safeChanges);
      } else {
        // 兼容旧接口：按 worldId 更新激活玩家卡
        const worldId = entityId;
        if (!worldId) throw new Error('persona-card 提案缺少 worldId（entityId）或 personaId');
        updated = await updatePersona(worldId, safeChanges);
      }
      const resolvedWorldId = updated?.world_id ?? entityId;
      for (const op of (Array.isArray(proposal.stateValueOps) ? proposal.stateValueOps : [])) {
        applyStateValueOp(op, { worldId: resolvedWorldId });
      }
      return updated;
    }

    case 'global-config': {
      const safeChanges = deepOmit(changes, ['api_key', 'llm.api_key', 'embedding.api_key']);
      let updated = null;
      if (Object.keys(safeChanges).length > 0) updated = updateConfig(safeChanges);
      return updated;
    }

    case 'css-snippet': {
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

    case 'theme': {
      if (!entityId) throw new Error('theme 提案缺少 entityId');
      return applyAssistantThemeOp({ id: entityId, operation, changes });
    }

    case 'regex-rule': {
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

    default:
      throw new Error(`未知的提案类型：${type}`);
  }
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

function applyStateValueOp(op, refs = {}) {
  if (op.target === 'character') {
    const characterId = refs.characterId;
    if (!characterId) throw new Error('character 状态值写入缺少 characterId');
    updateCharacterDefaultStateValueValidated(characterId, op.field_key, op.value_json);
    return;
  }
  if (op.target === 'persona') {
    const worldId = refs.worldId;
    if (!worldId) throw new Error('persona 状态值写入缺少 worldId');
    updatePersonaDefaultStateValueValidated(worldId, op.field_key, op.value_json);
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

const STATE_FIELD_KEYS = [
  'field_key', 'label', 'type', 'description', 'default_value',
  'update_mode', 'update_instruction',
  'enum_options', 'min_value', 'max_value', 'allow_empty',
  'prefix', 'table_columns', 'nearby_enabled',
];

function normalizeProposal(raw, locked = {}) {
  const type = locked.type || normalizeString(raw?.type);
  if (!type || !PROPOSAL_ALLOWED_OPERATIONS[type]) {
    throw new Error(`提案格式错误：未知的 proposal type：${raw?.type || '(空)'}`);
  }

  const operationCandidate = locked.operation || normalizeString(raw?.operation) || 'update';
  const operation = PROPOSAL_ALLOWED_OPERATIONS[type].has(operationCandidate) ? operationCandidate : null;
  if (!operation) throw new Error(`提案格式错误：${type} 不支持 operation=${operationCandidate}`);

  const proposal = {
    type,
    operation,
    explanation: normalizeString(raw?.explanation) || getDefaultExplanation(type, operation),
  };

  if (type === 'world-card' || type === 'character-card' || type === 'persona-card' ||
      (type === 'css-snippet' && operation !== 'create') ||
      (type === 'regex-rule' && operation !== 'create') ||
      type === 'theme') {
    proposal.entityId = normalizeEntityId(locked.entityId ?? raw?.entityId);
  }
  if (type === 'theme') {
    if (!proposal.entityId) throw new Error('提案格式错误：theme 必须提供 entityId（主题 id）');
    try {
      assertThemeId(proposal.entityId);
    } catch (err) {
      throw new Error(`提案格式错误：${err.message}`);
    }
  }

  const changes = raw?.changes && typeof raw.changes === 'object' && !Array.isArray(raw.changes) ? raw.changes : {};

  switch (type) {
    case 'world-card': {
      proposal.changes = normalizeWorldChanges(changes);
      proposal.stateFieldOps = normalizeStateFieldOps(raw?.stateFieldOps, type);
      proposal.stateValueOps = normalizeStateValueOps(raw?.stateValueOps, type);
      const entryWarnings = [];
      proposal.entryOps = normalizeEntryOps(raw?.entryOps, {
        allowTriggerType: true,
        conditionContext: buildWorldConditionContext(proposal.entityId, proposal.stateFieldOps),
        warnings: entryWarnings,
      });
      const disallowedKeys = Object.keys(changes).filter(
        (k) => !['name', 'description', 'temperature', 'max_tokens'].includes(k),
      );
      if (disallowedKeys.length > 0) {
        proposal.explanation += `（注意：世界卡不支持 ${disallowedKeys.join(', ')} 字段，相关内容请通过条目管理）`;
      }
      if (entryWarnings.length > 0) {
        proposal.explanation += `\n⚠️ 条目警告：${entryWarnings.join('；')}`;
      }
      break;
    }
    case 'character-card':
      proposal.changes = normalizeCharacterChanges(changes);
      proposal.stateFieldOps = normalizeStateFieldOps(raw?.stateFieldOps, type);
      proposal.stateValueOps = normalizeStateValueOps(raw?.stateValueOps, type);
      break;
    case 'persona-card':
      proposal.changes = normalizePersonaChanges(changes);
      proposal.stateFieldOps = normalizeStateFieldOps(raw?.stateFieldOps, type);
      proposal.stateValueOps = normalizeStateValueOps(raw?.stateValueOps, type);
      break;
    case 'global-config':
      proposal.changes = deepOmit(normalizeObject(changes), ['api_key', 'llm.api_key', 'embedding.api_key']);
      break;
    case 'css-snippet':
      if (operation === 'delete') {
        proposal.changes = {};
      } else if (operation === 'update') {
        proposal.changes = pickAllowed(changes, ['name', 'content', 'mode', 'enabled']);
      } else {
        proposal.changes = normalizeCssSnippetChanges(changes);
      }
      break;
    case 'regex-rule':
      if (operation === 'delete') {
        proposal.changes = {};
      } else if (operation === 'update') {
        proposal.changes = pickAllowed(changes, ['name', 'pattern', 'replacement', 'flags', 'scope', 'world_id', 'mode', 'enabled']);
      } else {
        proposal.changes = normalizeRegexRuleChanges(changes);
      }
      break;
    case 'theme':
      if (operation === 'delete') {
        proposal.changes = {};
      } else {
        proposal.changes = normalizeThemeChanges(changes, operation);
      }
      break;
    default: break;
  }

  if (typeof raw?.worldRef === 'string' && raw.worldRef.trim()) proposal.worldRef = raw.worldRef.trim();
  if (typeof raw?.taskId === 'string' && raw.taskId.trim()) proposal.taskId = raw.taskId.trim();

  // 空内容检测：非 delete 操作必须至少有一项变更
  if (operation !== 'delete') {
    const hasChanges = Object.keys(proposal.changes || {}).length > 0;
    const hasEntryOps = Array.isArray(proposal.entryOps) && proposal.entryOps.length > 0;
    const hasStateFieldOps = Array.isArray(proposal.stateFieldOps) && proposal.stateFieldOps.length > 0;
    const hasStateValueOps = Array.isArray(proposal.stateValueOps) && proposal.stateValueOps.length > 0;
    if (!hasChanges && !hasEntryOps && !hasStateFieldOps && !hasStateValueOps) {
      throw new Error('提案格式错误：提案内容为空，未包含任何变更');
    }
  }

  return proposal;
}

function normalizeWorldChanges(changes) {
  const picked = pickAllowed(changes, ['name', 'description', 'temperature', 'max_tokens']);
  const normalized = {};
  if ('name' in picked) normalized.name = String(picked.name ?? '');
  if ('description' in picked) normalized.description = String(picked.description ?? '');
  if ('temperature' in picked) normalized.temperature = normalizeNumberOrNull(picked.temperature);
  if ('max_tokens' in picked) normalized.max_tokens = normalizeIntegerOrNull(picked.max_tokens);
  return normalized;
}

function normalizeCharacterChanges(changes) {
  const picked = pickAllowed(changes, ['name', 'description', 'system_prompt', 'post_prompt', 'first_message', 'world_id']);
  const normalized = {};
  for (const key of Object.keys(picked)) {
    if (key === 'world_id') {
      normalized[key] = normalizeEntityId(picked[key]);
    } else {
      normalized[key] = String(picked[key] ?? '');
    }
  }
  return normalized;
}

function normalizePersonaChanges(changes) {
  const picked = pickAllowed(changes, ['name', 'description', 'system_prompt', 'world_id']);
  const normalized = {};
  for (const key of Object.keys(picked)) {
    if (key === 'world_id') {
      normalized[key] = normalizeEntityId(picked[key]);
    } else {
      normalized[key] = String(picked[key] ?? '');
    }
  }
  return normalized;
}

function normalizeCssSnippetChanges(changes) {
  const picked = pickAllowed(changes, ['name', 'content', 'mode', 'enabled']);
  const content = String(picked.content ?? '').trim();
  if (!content) throw new Error('提案格式错误：css-snippet.changes.content 不能为空');
  return {
    name: normalizeString(picked.name) || '写卡助手生成',
    content: String(picked.content),
    mode: normalizeMode(picked.mode),
    enabled: normalizeEnabled(picked.enabled),
  };
}

function normalizeThemeChanges(changes, operation) {
  const picked = pickAllowed(changes, ['name', 'version', 'author', 'description', 'preview', 'css']);
  const normalized = {};
  if ('name' in picked) normalized.name = String(picked.name ?? '').trim();
  if ('version' in picked) normalized.version = String(picked.version ?? '').trim();
  if ('author' in picked) normalized.author = String(picked.author ?? '');
  if ('description' in picked) normalized.description = String(picked.description ?? '');
  if ('preview' in picked) {
    if (picked.preview && typeof picked.preview === 'object' && !Array.isArray(picked.preview)) {
      normalized.preview = picked.preview;
    } else {
      throw new Error('提案格式错误：theme.changes.preview 必须是对象');
    }
  }
  if ('css' in picked) {
    if (typeof picked.css !== 'string') throw new Error('提案格式错误：theme.changes.css 必须是字符串');
    const trimmed = picked.css.trim();
    if (!trimmed) throw new Error('提案格式错误：theme.changes.css 不能为空');
    normalized.css = picked.css;
  }
  if (operation === 'create') {
    if (!normalized.name) throw new Error('提案格式错误：theme create 必须提供 name');
    if (!normalized.version) throw new Error('提案格式错误：theme create 必须提供 version');
    if (typeof normalized.css !== 'string') throw new Error('提案格式错误：theme create 必须提供 css');
  }
  return normalized;
}

function normalizeRegexRuleChanges(changes) {
  const picked = pickAllowed(changes, ['name', 'pattern', 'replacement', 'flags', 'scope', 'world_id', 'mode', 'enabled']);
  const pattern = String(picked.pattern ?? '').trim();
  if (!pattern) throw new Error('提案格式错误：regex-rule.changes.pattern 不能为空');
  return {
    name: normalizeString(picked.name) || '写卡助手生成',
    pattern: String(picked.pattern),
    replacement: String(picked.replacement ?? ''),
    flags: normalizeString(picked.flags) || 'g',
    scope: VALID_REGEX_SCOPES.has(picked.scope) ? picked.scope : 'display_only',
    world_id: normalizeEntityId(picked.world_id),
    mode: normalizeMode(picked.mode),
    enabled: normalizeEnabled(picked.enabled),
  };
}

const VALID_ENTRY_CONDITION_OPERATORS = new Set(['eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'contains', 'not_contains']);
const VALID_TRIGGER_TYPES = new Set(['always', 'keyword', 'llm', 'state']);
const VALID_RUNTIME_ENTRY_CONDITION_OPERATORS = new Set(['>', '<', '=', '>=', '<=', '!=', '包含', '等于', '不包含']);
const CONDITION_OPERATOR_ALIASES = {
  eq: 'eq',
  ne: 'ne',
  gt: 'gt',
  lt: 'lt',
  gte: 'gte',
  lte: 'lte',
  contains: 'contains',
  not_contains: 'not_contains',
  '>': '>',
  '<': '<',
  '=': '=',
  '>=': '>=',
  '<=': '<=',
  '!=': '!=',
  '包含': '包含',
  '等于': '等于',
  '不包含': '不包含',
};

function buildWorldConditionContext(worldId, stateFieldOps = []) {
  const scopedFields = [];
  const pushScopedField = (scopeLabel, field) => {
    if (!field?.label) return;
    scopedFields.push({
      scopeLabel,
      label: String(field.label),
      field_key: typeof field.field_key === 'string' ? field.field_key : '',
      type: typeof field.type === 'string' ? field.type : 'text',
    });
  };

  if (worldId) {
    listWorldStateFields(worldId).forEach((field) => pushScopedField('世界', field));
    getPersonaStateFieldsByWorldId(worldId).forEach((field) => pushScopedField('玩家', field));
    listCharacterStateFields(worldId).forEach((field) => pushScopedField('角色', field));
  }

  for (const op of stateFieldOps) {
    if (op?.op !== 'create') continue;
    if (op.target === 'world') pushScopedField('世界', op);
    else if (op.target === 'persona') pushScopedField('玩家', op);
    else if (op.target === 'character') pushScopedField('角色', op);
  }

  const deduped = [];
  const seen = new Set();
  for (const field of scopedFields) {
    const key = `${field.scopeLabel}.${field.field_key}::${field.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(field);
  }

  const byScopedLabel = new Map();
  const byScopedFieldKey = new Map();
  const byFieldKey = new Map();
  const byLabel = new Map();

  for (const field of deduped) {
    const scopedLabel = `${field.scopeLabel}.${field.label}`;
    byScopedLabel.set(scopedLabel, field);
    if (field.field_key) byScopedFieldKey.set(`${field.scopeLabel}.${field.field_key}`, field);
    if (field.field_key) {
      if (!byFieldKey.has(field.field_key)) byFieldKey.set(field.field_key, []);
      byFieldKey.get(field.field_key).push(field);
    }
    if (!byLabel.has(field.label)) byLabel.set(field.label, []);
    byLabel.get(field.label).push(field);
  }

  return { byScopedLabel, byScopedFieldKey, byFieldKey, byLabel };
}

function resolveConditionField(rawTargetField, context) {
  const input = String(rawTargetField ?? '').trim();
  if (!input) return { targetField: null, field: null };
  if (!context) return { targetField: input, field: null };

  if (context.byScopedLabel.has(input)) {
    const field = context.byScopedLabel.get(input);
    return { targetField: `${field.scopeLabel}.${field.label}`, field };
  }
  if (context.byScopedFieldKey.has(input)) {
    const field = context.byScopedFieldKey.get(input);
    return { targetField: `${field.scopeLabel}.${field.label}`, field };
  }

  if (input.includes('.')) {
    return { targetField: input, field: null, unresolved: true };
  }

  const byKeyMatches = context.byFieldKey.get(input) || [];
  if (byKeyMatches.length === 1) {
    const field = byKeyMatches[0];
    return { targetField: `${field.scopeLabel}.${field.label}`, field };
  }
  if (byKeyMatches.length > 1) {
    throw new Error(`提案格式错误：state 条件 target_field "${input}" 存在多个同名 field_key，请改为 世界.xxx / 玩家.xxx / 角色.xxx`);
  }

  const byLabelMatches = context.byLabel.get(input) || [];
  if (byLabelMatches.length === 1) {
    const field = byLabelMatches[0];
    return { targetField: `${field.scopeLabel}.${field.label}`, field };
  }
  if (byLabelMatches.length > 1) {
    throw new Error(`提案格式错误：state 条件 target_field "${input}" 存在多个同名标签，请改为 世界.xxx / 玩家.xxx / 角色.xxx`);
  }

  return { targetField: input, field: null };
}

function normalizeConditionOperator(rawOperator, field, idx, condIdx) {
  const operator = CONDITION_OPERATOR_ALIASES[String(rawOperator ?? '').trim()];
  if (!operator) {
    throw new Error(`提案格式错误：entryOps[${idx}].conditions[${condIdx}].operator 非法`);
  }
  if (VALID_RUNTIME_ENTRY_CONDITION_OPERATORS.has(operator)) return operator;

  const fieldType = field?.type || null;
  const isNumeric = fieldType === 'number';
  switch (operator) {
    case 'gt':
      if (!isNumeric) throw new Error(`提案格式错误：entryOps[${idx}].conditions[${condIdx}] 非数值字段不能使用 gt`);
      return '>';
    case 'lt':
      if (!isNumeric) throw new Error(`提案格式错误：entryOps[${idx}].conditions[${condIdx}] 非数值字段不能使用 lt`);
      return '<';
    case 'gte':
      if (!isNumeric) throw new Error(`提案格式错误：entryOps[${idx}].conditions[${condIdx}] 非数值字段不能使用 gte`);
      return '>=';
    case 'lte':
      if (!isNumeric) throw new Error(`提案格式错误：entryOps[${idx}].conditions[${condIdx}] 非数值字段不能使用 lte`);
      return '<=';
    case 'eq':
      return isNumeric ? '=' : '等于';
    case 'ne':
      if (!isNumeric) throw new Error(`提案格式错误：entryOps[${idx}].conditions[${condIdx}] 文本字段不支持 ne，请改用 等于/包含/不包含`);
      return '!=';
    case 'contains':
      return '包含';
    case 'not_contains':
      return '不包含';
    default:
      throw new Error(`提案格式错误：entryOps[${idx}].conditions[${condIdx}].operator 非法`);
  }
}

function normalizeEntryOps(rawOps, { includeMode = false, allowTriggerType = false, conditionContext = null, warnings = null } = {}) {
  if (rawOps == null) return [];
  if (!Array.isArray(rawOps)) throw new Error('提案格式错误：entryOps 必须是数组');
  return rawOps.map((raw, idx) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`提案格式错误：entryOps[${idx}] 必须是对象`);
    const op = normalizeString(raw.op);
    if (!['create', 'update', 'delete'].includes(op)) throw new Error(`提案格式错误：entryOps[${idx}].op 非法`);
    if (op === 'delete') {
      const id = normalizeEntityId(raw.id);
      if (!id) throw new Error(`提案格式错误：entryOps[${idx}].id 缺失`);
      return { op, id };
    }
    const normalized = { op };
    const id = normalizeEntityId(raw.id);
    if (op === 'update') {
      if (!id) throw new Error(`提案格式错误：entryOps[${idx}].id 缺失`);
      normalized.id = id;
    }
    if ('title' in raw) normalized.title = String(raw.title ?? '');
    if ('description' in raw) normalized.description = String(raw.description ?? '');
    if ('content' in raw) normalized.content = String(raw.content ?? '');
    if ('keywords' in raw) normalized.keywords = normalizeStringArrayOrNull(raw.keywords);
    if ('keyword_scope' in raw) {
      // 助手侧宽容回退：归一化为 'user' / 'assistant' / 'user,assistant'，空值回退默认
      const items = Array.isArray(raw.keyword_scope)
        ? raw.keyword_scope
        : typeof raw.keyword_scope === 'string'
          ? raw.keyword_scope.split(',')
          : [];
      const filtered = items
        .map((s) => String(s).trim().toLowerCase())
        .filter((v) => v === 'user' || v === 'assistant');
      const unique = [...new Set(filtered)];
      normalized.keyword_scope = unique.length > 0 ? unique.join(',') : 'user,assistant';
    }
    if ('keyword_logic' in raw) {
      normalized.keyword_logic = raw.keyword_logic === 'AND' ? 'AND' : 'OR';
    }
    if ('active_turns' in raw) {
      const t = parseInt(raw.active_turns, 10);
      normalized.active_turns = Number.isFinite(t) && t >= 0 ? t : 1;
    }
    if ('token' in raw) {
      const t = parseInt(raw.token, 10);
      normalized.token = Number.isFinite(t) && t >= 1 ? t : 1;
    }
    if (includeMode) normalized.mode = normalizeMode(raw.mode);
    if (allowTriggerType && 'trigger_type' in raw) {
      const tt = normalizeString(raw.trigger_type);
      if (tt && VALID_TRIGGER_TYPES.has(tt)) normalized.trigger_type = tt;
    }
    if (allowTriggerType && normalized.trigger_type === 'keyword') {
      const kws = normalized.keywords;
      if (!kws || kws.length === 0) {
        warnings?.push(`条目「${normalized.title || idx}」类型为 keyword 但 keywords 为空，该条目永远不会触发；请添加关键词或改为 llm/always 类型`);
      }
    }
    if (allowTriggerType && normalized.trigger_type === 'state' && Array.isArray(raw.conditions)) {
      normalized.conditions = raw.conditions
        .filter((c) => c && typeof c === 'object' && c.target_field && c.operator && 'value' in c)
        .map((c, condIdx) => {
          const { targetField, field, unresolved } = resolveConditionField(c.target_field, conditionContext);
          if (unresolved) {
            warnings?.push(`条目「${normalized.title || idx}」的条件引用了未知字段「${c.target_field}」，请确认字段标签正确（格式：世界/玩家/角色.字段标签）`);
          }
          return {
            target_field: targetField,
            operator: normalizeConditionOperator(c.operator, field, idx, condIdx),
            value: String(c.value ?? ''),
          };
        });
    }
    if (allowTriggerType && normalized.trigger_type === 'state' && (!normalized.conditions || normalized.conditions.length === 0)) {
      warnings?.push(`条目「${normalized.title || idx}」类型为 state 但 conditions 为空，该条目永远不会触发；请添加至少一个条件`);
    }
    return normalized;
  });
}

function normalizeStateFieldOps(rawOps, type) {
  if (rawOps == null) return [];
  if (!Array.isArray(rawOps)) throw new Error('提案格式错误：stateFieldOps 必须是数组');
  const allowedTargets = STATE_TARGETS_BY_PROPOSAL_TYPE[type];
  if (allowedTargets && allowedTargets.size === 0 && rawOps.length > 0) {
    throw new Error(`提案格式错误：${type} 不支持 stateFieldOps；状态字段的创建、修改、删除只能在 world-card 中进行`);
  }
  return rawOps.map((raw, idx) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`提案格式错误：stateFieldOps[${idx}] 必须是对象`);
    const op = normalizeString(raw.op);
    if (!['create', 'update', 'delete'].includes(op)) throw new Error(`提案格式错误：stateFieldOps[${idx}].op 非法`);
    const target = normalizeString(raw.target);
    if (!target || !allowedTargets.has(target)) throw new Error(`提案格式错误：stateFieldOps[${idx}].target 非法`);
    if (op === 'delete') {
      const id = normalizeEntityId(raw.id);
      if (!id) throw new Error(`提案格式错误：stateFieldOps[${idx}].id 缺失`);
      return { op, target, id };
    }
    if (op === 'update') {
      const id = normalizeEntityId(raw.id);
      if (!id) throw new Error(`提案格式错误：stateFieldOps[${idx}].id 缺失`);
      const normalized = { op, target, id };
      const data = pickAllowed(raw, STATE_FIELD_KEYS);
      if ('type' in data && VALID_STATE_TYPES.has(data.type)) normalized.type = data.type;
      if ('label' in data) normalized.label = String(data.label ?? '');
      if ('description' in data) normalized.description = String(data.description ?? '');
      if ('default_value' in data) normalized.default_value = data.default_value == null ? null : String(data.default_value);
      // 非法 update_mode 不要落成 undefined（key 已固化会把列写脏/清空）；只在合法时赋值，否则不带这个 key。
      if ('update_mode' in data && VALID_UPDATE_MODES.has(data.update_mode)) normalized.update_mode = data.update_mode;
      if ('update_instruction' in data) normalized.update_instruction = String(data.update_instruction ?? '');
      if ('enum_options' in data) normalized.enum_options = normalizeStringArrayOrNull(data.enum_options);
      if ('min_value' in data) normalized.min_value = normalizeNumberOrNull(data.min_value);
      if ('max_value' in data) normalized.max_value = normalizeNumberOrNull(data.max_value);
      if ('allow_empty' in data) normalized.allow_empty = normalizeEnabled(data.allow_empty);
      if ('prefix' in data) normalized.prefix = String(data.prefix ?? '');
      if ('table_columns' in data) normalized.table_columns = normalizeTableColumns(data.table_columns, idx);
      if ('nearby_enabled' in data) {
        if (target !== 'character') {
          throw new Error(`提案格式错误：stateFieldOps[${idx}].nearby_enabled 仅 target='character' 时允许使用`);
        }
        normalized.nearby_enabled = data.nearby_enabled ? 1 : 0;
      }
      // 仅在本次 update 显式带上 type 时校验类型相关约束；type 缺省时无法判定原字段类型，留给后续业务层
      if ('type' in data) {
        const isDatetime = data.type === 'datetime';
        const isTable = data.type === 'table';
        if (!isDatetime && normalized.prefix && normalized.prefix.trim()) {
          throw new Error(`提案格式错误：stateFieldOps[${idx}].prefix 仅 datetime 类型字段允许使用`);
        }
        if (isDatetime && 'default_value' in data) {
          assertDatetimeDefaultValue(normalized.default_value, idx);
        }
        if (isTable) {
          if (!Array.isArray(normalized.table_columns) || normalized.table_columns.length === 0) {
            throw new Error(`提案格式错误：stateFieldOps[${idx}].table_columns 必须是非空数组（type='table' 时）`);
          }
          if (normalized.enum_options || normalized.min_value != null || normalized.max_value != null || (normalized.prefix && normalized.prefix.trim())) {
            throw new Error(`提案格式错误：stateFieldOps[${idx}] type='table' 时禁止填写 enum_options / min_value / max_value / prefix`);
          }
          if ('default_value' in data) assertTableDefaultValue(normalized.default_value, normalized.table_columns, idx);
        } else if (normalized.table_columns) {
          throw new Error(`提案格式错误：stateFieldOps[${idx}].table_columns 仅 type='table' 时允许使用`);
        }
      }
      return normalized;
    }
    let fieldKey = normalizeString(raw.field_key);
    if (fieldKey) {
      if (target === 'persona' && !fieldKey.endsWith('_user')) fieldKey += '_user';
      else if (target === 'character' && !fieldKey.endsWith('_char')) fieldKey += '_char';
    }
    const label = normalizeString(raw.label);
    const fieldType = normalizeString(raw.type);
    if (!fieldKey) throw new Error(`提案格式错误：stateFieldOps[${idx}].field_key 缺失`);
    if (!label) throw new Error(`提案格式错误：stateFieldOps[${idx}].label 缺失`);
    if (!VALID_STATE_TYPES.has(fieldType)) throw new Error(`提案格式错误：stateFieldOps[${idx}].type 非法`);
    const normalized = {
      op, target,
      field_key: fieldKey, label, type: fieldType,
      description: String(raw.description ?? ''),
      default_value: raw.default_value == null ? null : String(raw.default_value),
      update_mode: VALID_UPDATE_MODES.has(raw.update_mode) ? raw.update_mode : 'manual',
      update_instruction: String(raw.update_instruction ?? ''),
      allow_empty: normalizeEnabled(raw.allow_empty),
    };
    if ('enum_options' in raw) normalized.enum_options = normalizeStringArrayOrNull(raw.enum_options);
    if ('min_value' in raw) normalized.min_value = normalizeNumberOrNull(raw.min_value);
    if ('max_value' in raw) normalized.max_value = normalizeNumberOrNull(raw.max_value);
    if ('prefix' in raw) normalized.prefix = String(raw.prefix ?? '');
    if ('table_columns' in raw) normalized.table_columns = normalizeTableColumns(raw.table_columns, idx);
    if ('nearby_enabled' in raw) {
      if (target !== 'character') {
        throw new Error(`提案格式错误：stateFieldOps[${idx}].nearby_enabled 仅 target='character' 时允许使用`);
      }
      normalized.nearby_enabled = raw.nearby_enabled ? 1 : 0;
    }
    if (fieldType === 'datetime') {
      assertDatetimeDefaultValue(normalized.default_value, idx);
    } else if (fieldType === 'table') {
      if (!Array.isArray(normalized.table_columns) || normalized.table_columns.length === 0) {
        throw new Error(`提案格式错误：stateFieldOps[${idx}].table_columns 必须是非空数组（type='table' 时）`);
      }
      if (normalized.enum_options || normalized.min_value != null || normalized.max_value != null || (normalized.prefix && normalized.prefix.trim())) {
        throw new Error(`提案格式错误：stateFieldOps[${idx}] type='table' 时禁止填写 enum_options / min_value / max_value / prefix`);
      }
      assertTableDefaultValue(normalized.default_value, normalized.table_columns, idx);
    } else {
      if (normalized.prefix && normalized.prefix.trim()) {
        throw new Error(`提案格式错误：stateFieldOps[${idx}].prefix 仅 datetime 类型字段允许使用`);
      }
      if (normalized.table_columns) {
        throw new Error(`提案格式错误：stateFieldOps[${idx}].table_columns 仅 type='table' 时允许使用`);
      }
    }
    return normalized;
  });
}

function normalizeTableColumns(value, idx) {
  if (value == null) return null;
  let arr = value;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr); } catch {
      throw new Error(`提案格式错误：stateFieldOps[${idx}].table_columns 必须是数组或合法 JSON 字符串`);
    }
  }
  if (!Array.isArray(arr)) {
    throw new Error(`提案格式错误：stateFieldOps[${idx}].table_columns 必须是数组`);
  }
  const seen = new Set();
  return arr.map((col, ci) => {
    if (!col || typeof col !== 'object' || Array.isArray(col)) {
      throw new Error(`提案格式错误：stateFieldOps[${idx}].table_columns[${ci}] 必须是对象`);
    }
    const key = typeof col.key === 'string' ? col.key.trim() : '';
    if (!COLUMN_KEY_RE.test(key)) {
      throw new Error(`提案格式错误：stateFieldOps[${idx}].table_columns[${ci}].key 不合法（仅允许字母数字下划线）`);
    }
    if (seen.has(key)) {
      throw new Error(`提案格式错误：stateFieldOps[${idx}].table_columns[${ci}].key "${key}" 重复`);
    }
    seen.add(key);
    const label = typeof col.label === 'string' && col.label.trim() ? col.label.trim() : key;
    const out = { key, label };
    if (col.min != null && col.min !== '') {
      const n = Number(col.min);
      if (!Number.isFinite(n)) throw new Error(`提案格式错误：stateFieldOps[${idx}].table_columns[${ci}].min 必须是数值`);
      out.min = n;
    }
    if (col.max != null && col.max !== '') {
      const n = Number(col.max);
      if (!Number.isFinite(n)) throw new Error(`提案格式错误：stateFieldOps[${idx}].table_columns[${ci}].max 必须是数值`);
      out.max = n;
    }
    return out;
  });
}

function assertTableDefaultValue(defaultValue, columns, idx) {
  if (defaultValue == null || defaultValue === '') return;
  let parsed;
  try { parsed = JSON.parse(defaultValue); } catch {
    throw new Error(`提案格式错误：stateFieldOps[${idx}].default_value 必须是 JSON 字符串（type='table' 字段写成对象 JSON，例 "{\\"atk\\":10}"）`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`提案格式错误：stateFieldOps[${idx}].default_value 必须解析为对象（type='table'）`);
  }
  const colKeys = new Set(columns.map((c) => c.key));
  for (const [k, v] of Object.entries(parsed)) {
    if (!colKeys.has(k)) {
      throw new Error(`提案格式错误：stateFieldOps[${idx}].default_value 包含未声明列 "${k}"`);
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`提案格式错误：stateFieldOps[${idx}].default_value["${k}"] 必须是数值`);
    }
  }
}

function normalizeStateValueOps(rawOps, type) {
  if (rawOps == null) return [];
  if (!Array.isArray(rawOps)) throw new Error('提案格式错误：stateValueOps 必须是数组');
  const allowedTargets = STATE_VALUE_TARGETS_BY_PROPOSAL_TYPE[type];
  if (allowedTargets && allowedTargets.size === 0 && rawOps.length > 0) {
    throw new Error(`提案格式错误：${type} 不支持 stateValueOps`);
  }
  return rawOps.map((raw, idx) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`提案格式错误：stateValueOps[${idx}] 必须是对象`);
    const target = normalizeString(raw.target);
    if (!target || !allowedTargets.has(target)) throw new Error(`提案格式错误：stateValueOps[${idx}].target 非法`);
    const fieldKey = normalizeString(raw.field_key);
    if (!fieldKey) throw new Error(`提案格式错误：stateValueOps[${idx}].field_key 缺失`);
    if (!Object.hasOwn(raw, 'value_json')) throw new Error(`提案格式错误：stateValueOps[${idx}].value_json 缺失`);
    if (raw.value_json !== null && typeof raw.value_json !== 'string') {
      throw new Error(`提案格式错误：stateValueOps[${idx}].value_json 必须是 JSON 字符串或 null`);
    }
    return {
      target,
      field_key: fieldKey,
      value_json: raw.value_json,
    };
  });
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function normalizeString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function normalizeEntityId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function normalizeMode(value) {
  return VALID_MODES.has(value) ? value : 'chat';
}
function normalizeEnabled(value) {
  return Number(value) === 0 ? 0 : 1;
}
function normalizeNumberOrNull(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}
function normalizeIntegerOrNull(value) {
  if (value == null || value === '') return null;
  const num = Number(value);
  return Number.isInteger(num) ? num : null;
}
function assertDatetimeDefaultValue(defaultValue, idx) {
  if (defaultValue == null || defaultValue === '') return;
  let parsed;
  try { parsed = JSON.parse(defaultValue); } catch {
    throw new Error(`提案格式错误：stateFieldOps[${idx}].default_value 必须是 JSON 字符串（datetime 字段写成 "\\"YYYY-MM-DDTHH:mm\\"" 形式）`);
  }
  if (typeof parsed !== 'string' || !ISO_LOCAL_DATETIME_RE.test(parsed)) {
    throw new Error(`提案格式错误：stateFieldOps[${idx}].default_value 不符合 datetime 格式 "YYYY-MM-DDTHH:mm"（年份为正整数、可任意位数；月/日/时/分各 2 位）`);
  }
}
function normalizeStringArrayOrNull(value) {
  if (value == null || !Array.isArray(value)) return null;
  const arr = value.map((item) => String(item ?? '').trim()).filter(Boolean);
  return arr.length ? arr : null;
}
function getDefaultExplanation(type, operation) {
  return `已生成 ${type} ${operation} 提案`;
}
function pickAllowed(obj, allowed) {
  const result = {};
  for (const key of allowed) { if (key in obj) result[key] = obj[key]; }
  return result;
}
function deepOmit(obj, keys) {
  const result = { ...obj };
  for (const key of keys) {
    if (key.includes('.')) {
      const [top, ...rest] = key.split('.');
      if (result[top] && typeof result[top] === 'object') result[top] = deepOmit(result[top], [rest.join('.')]);
    } else {
      delete result[key];
    }
  }
  return result;
}

export {
  normalizeProposal,
  applyProposal,
  normalizeEntryOps,
  normalizeStateFieldOps,
  normalizeStateValueOps,
  normalizeRegexRuleChanges,
  pickAllowed,
  deepOmit,
};
