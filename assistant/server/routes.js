/**
 * 写卡助手后端路由
 *
 * POST /api/assistant/chat    — SSE 流式对话（主代理 + 执行子代理）
 * POST /api/assistant/execute — 应用提案（写入数据库）
 */

import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { runAgent } from './main-agent.js';
import { READ_FILE_TOOL } from './tools/project-reader.js';
import { createPreviewCardTool } from './tools/card-preview.js';
import { ALL_AGENTS } from './agents/index.js';
import { createAgentTool } from './agent-factory.js';
import { getWorldById, createWorld, updateWorld, deleteWorld } from '../../backend/services/worlds.js';
import { getCharacterById, createCharacter, updateCharacter, deleteCharacter } from '../../backend/services/characters.js';
import { getOrCreatePersona, updatePersona } from '../../backend/services/personas.js';
import { getConfig, updateConfig } from '../../backend/services/config.js';
import {
  createWorldPromptEntry,
  createCharacterPromptEntry,
  createGlobalPromptEntry,
  updateWorldPromptEntry,
  deleteWorldPromptEntry,
  updateCharacterPromptEntry,
  deleteCharacterPromptEntry,
  updateGlobalPromptEntry,
  deleteGlobalPromptEntry,
} from '../../backend/services/prompt-entries.js';
import {
  createWorldStateField,
  listWorldStateFields,
  deleteWorldStateField,
} from '../../backend/services/world-state-fields.js';
import {
  createCharacterStateField,
  listCharacterStateFields,
  deleteCharacterStateField,
} from '../../backend/services/character-state-fields.js';
import {
  createPersonaStateField,
  getPersonaStateFieldsByWorldId,
  deletePersonaStateField,
} from '../../backend/services/persona-state-fields.js';
import {
  createCustomCssSnippet,
} from '../../backend/db/queries/custom-css-snippets.js';
import {
  createRegexRule,
} from '../../backend/db/queries/regex-rules.js';
import { createLogger, formatMeta, previewJson, previewText, shouldLogRaw } from '../../backend/utils/logger.js';

const router = Router();
const log = createLogger('as-route', 'yellow');

// ─── 服务端提案存储（Token → Proposal，TTL 30 分钟） ──────────────
const proposalStore = new Map();
const PROPOSAL_TTL_MS = 30 * 60 * 1000;

// 每 10 分钟清理过期提案，防止内存泄漏
setInterval(() => {
  const now = Date.now();
  let removed = 0;
  for (const [token, entry] of proposalStore.entries()) {
    if (now > entry.expiresAt) { proposalStore.delete(token); removed++; }
  }
  if (removed > 0) log.info(`proposalStore GC  ${formatMeta({ removed })}`);
}, 10 * 60 * 1000).unref();
const VALID_REGEX_SCOPES = new Set(['user_input', 'ai_output', 'display_only', 'prompt_only']);
const VALID_MODES = new Set(['chat', 'writing']);
const VALID_STATE_TYPES = new Set(['number', 'text', 'enum', 'list', 'boolean']);
const VALID_UPDATE_MODES = new Set(['llm_auto', 'manual']);
const VALID_TRIGGER_MODES = new Set(['manual_only', 'every_turn', 'keyword_based']);
const PROPOSAL_ALLOWED_OPERATIONS = {
  'world-card': new Set(['create', 'update', 'delete']),
  'character-card': new Set(['create', 'update', 'delete']),
  'persona-card': new Set(['update']),
  'global-config': new Set(['update']),
  'css-snippet': new Set(['create']),
  'regex-rule': new Set(['create']),
};
const STATE_TARGETS_BY_PROPOSAL_TYPE = {
  'world-card': new Set(['world', 'persona', 'character']),
  'character-card': new Set(['persona', 'character']),
  'persona-card': new Set(['persona']),
};

// ─── SSE 工具 ─────────────────────────────────────────────────────

function sendSSE(res, data) {
  if (data?.type && data.type !== 'delta' && data.type !== 'thinking') {
    log.info(`sse  ${formatMeta({
      type: data.type,
      taskId: data.taskId,
      target: data.target,
      hasProposal: !!data.proposal,
      hasToken: !!data.token,
      error: data.error,
    })}`);
  }
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ─── POST /api/assistant/chat ─────────────────────────────────────

router.post('/chat', async (req, res) => {
  const { message, history = [], context = {} } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message 为必填项' });
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  log.info(`chat START  ${formatMeta({
    message: previewText(message, { limit: 160 }),
    history: Array.isArray(history) ? history.length : 0,
    worldId: context?.worldId ?? context?.world?.id ?? null,
    characterId: context?.characterId ?? context?.character?.id ?? null,
  })}`);

  // 构建按请求绑定的完整工具集
  const previewCardTool = createPreviewCardTool(context);
  const agentTools = ALL_AGENTS.map((def) =>
    createAgentTool(def, { res, proposalStore, normalizeProposal, previewCardTool }),
  );
  const allTools = [READ_FILE_TOOL, previewCardTool, ...agentTools];

  try {
    const gen = runAgent(message, history, context, allTools);
    for await (const chunk of gen) {
      sendSSE(res, { delta: chunk });
    }
    sendSSE(res, { done: true });
    log.info(`chat DONE`);
  } catch (err) {
    log.error(`chat FAIL  ${formatMeta({ error: err.message, message: previewText(message, { limit: 120 }) })}`);
    sendSSE(res, { type: 'error', error: err.message });
  } finally {
    res.end();
  }
});

// ─── POST /api/assistant/execute ─────────────────────────────────

router.post('/execute', async (req, res) => {
  const { token, worldRefId, editedProposal } = req.body;
  log.info(`execute START  ${formatMeta({ token: typeof token === 'string' ? token.slice(0, 8) : null, worldRefId: worldRefId ? String(worldRefId).slice(0, 8) : null, edited: !!editedProposal })}`);

  if (!token) return res.status(400).json({ error: 'token 为必填项' });

  const entry = proposalStore.get(token);
  if (!entry) return res.status(400).json({ error: '提案不存在或已过期，请重新生成' });
  if (Date.now() > entry.expiresAt) {
    proposalStore.delete(token);
    return res.status(400).json({ error: '提案已过期，请重新生成' });
  }
  proposalStore.delete(token); // 一次性消费

  // 用户编辑：以 token 锚定的 type/operation/entityId 为准，内容字段可被覆盖
  const base = entry.proposal;
  const effective = editedProposal
    ? normalizeProposal({
        ...base,
        changes: editedProposal.changes ?? base.changes,
        entryOps: Array.isArray(editedProposal.entryOps) ? editedProposal.entryOps : base.entryOps,
        stateFieldOps: Array.isArray(editedProposal.stateFieldOps) ? editedProposal.stateFieldOps : base.stateFieldOps,
      }, {
        type: base.type,
        operation: base.operation,
        entityId: base.entityId ?? null,
      })
    : base;

  try {
    log.info(`execute APPLY  ${formatMeta({
      token: token.slice(0, 8),
      type: effective.type,
      operation: effective.operation,
      entityId: effective.entityId ?? null,
      changeKeys: Object.keys(effective.changes || {}),
      entryOps: Array.isArray(effective.entryOps) ? effective.entryOps.length : undefined,
      stateFieldOps: Array.isArray(effective.stateFieldOps) ? effective.stateFieldOps.length : undefined,
      preview: shouldLogRaw('llm_raw') ? previewJson(effective) : undefined,
    })}`);
    const result = await applyProposal(effective, worldRefId);
    log.info(`execute DONE  ${formatMeta({ token: token.slice(0, 8), type: effective.type, operation: effective.operation, resultKeys: result && typeof result === 'object' ? Object.keys(result) : undefined })}`);
    res.json({ ok: true, result });
  } catch (err) {
    log.error(`execute FAIL  ${formatMeta({ token: token.slice(0, 8), error: err.message })}`);
    res.status(500).json({ error: err.message });
  }
});

// ─── 提案执行器 ───────────────────────────────────────────────────

async function applyProposal(proposal, worldRefId = null) {
  const { type, operation = 'update', entityId, changes = {}, newEntries = [] } = proposal;
  log.info(`apply START  ${formatMeta({ type, operation, entityId: entityId ?? null, worldRefId: worldRefId ?? null })}`);

  switch (type) {
    case 'world-card': {
      if (operation === 'create') {
        const safeChanges = pickAllowed(changes, ['name', 'system_prompt', 'post_prompt', 'temperature', 'max_tokens']);
        const newWorld = createWorld({
          name: safeChanges.name || '新世界',
          system_prompt: safeChanges.system_prompt || '',
          post_prompt: safeChanges.post_prompt || '',
          temperature: safeChanges.temperature ?? null,
          max_tokens: safeChanges.max_tokens ?? null,
        });
        for (const op of (Array.isArray(proposal.entryOps) ? proposal.entryOps : [])) {
          if (op.op === 'create') createWorldPromptEntry(newWorld.id, op);
        }
        for (const op of (Array.isArray(proposal.stateFieldOps) ? proposal.stateFieldOps : [])) {
          if (op.op === 'create') applyStateFieldCreate(op, newWorld.id);
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
      const safeChanges = pickAllowed(changes, ['name', 'system_prompt', 'post_prompt', 'temperature', 'max_tokens']);
      let updated = null;
      if (Object.keys(safeChanges).length > 0) updated = await updateWorld(entityId, safeChanges);
      const worldOps = proposal.entryOps?.length ? proposal.entryOps : newEntries.map((e) => ({ op: 'create', ...e }));
      for (const op of worldOps) {
        if (op.op === 'create') createWorldPromptEntry(entityId, op);
        else if (op.op === 'update' && op.id) updateWorldPromptEntry(op.id, pickAllowed(op, ['title', 'description', 'content', 'keywords', 'keyword_scope']));
        else if (op.op === 'delete' && op.id) deleteWorldPromptEntry(op.id);
      }
      for (const op of (Array.isArray(proposal.stateFieldOps) ? proposal.stateFieldOps : [])) {
        if (op.op === 'create') applyStateFieldCreate(op, entityId);
        else if (op.op === 'delete' && op.id) await applyStateFieldDelete(op);
      }
      return updated;
    }

    case 'character-card': {
      if (operation === 'create') {
        const worldId = worldRefId || entityId;
        if (!worldId) throw new Error('character-card create 需要 worldId（请先应用对应的世界卡提案）');
        const safeChanges = pickAllowed(changes, ['name', 'system_prompt', 'post_prompt', 'first_message']);
        const newChar = createCharacter({
          world_id: worldId,
          name: safeChanges.name || '新角色',
          system_prompt: safeChanges.system_prompt || '',
          post_prompt: safeChanges.post_prompt || '',
          first_message: safeChanges.first_message || '',
        });
        for (const op of (Array.isArray(proposal.entryOps) ? proposal.entryOps : [])) {
          if (op.op === 'create') createCharacterPromptEntry(newChar.id, op);
        }
        for (const op of (Array.isArray(proposal.stateFieldOps) ? proposal.stateFieldOps : [])) {
          if (op.op === 'create') applyStateFieldCreate(op, worldId);
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
      const safeChanges = pickAllowed(changes, ['name', 'system_prompt', 'post_prompt', 'first_message']);
      let updated = null;
      if (Object.keys(safeChanges).length > 0) updated = await updateCharacter(entityId, safeChanges);
      const charOps = proposal.entryOps?.length ? proposal.entryOps : newEntries.map((e) => ({ op: 'create', ...e }));
      for (const op of charOps) {
        if (op.op === 'create') createCharacterPromptEntry(entityId, op);
        else if (op.op === 'update' && op.id) updateCharacterPromptEntry(op.id, pickAllowed(op, ['title', 'description', 'content', 'keywords', 'keyword_scope']));
        else if (op.op === 'delete' && op.id) deleteCharacterPromptEntry(op.id);
      }
      const charSfOps = Array.isArray(proposal.stateFieldOps) ? proposal.stateFieldOps : [];
      if (charSfOps.length > 0) {
        const character = getCharacterById(entityId);
        if (character) {
          for (const op of charSfOps) {
            if (op.op === 'create') applyStateFieldCreate(op, character.world_id);
            else if (op.op === 'delete' && op.id) await applyStateFieldDelete(op);
          }
        }
      }
      return updated;
    }

    case 'persona-card': {
      const worldId = entityId;
      if (!worldId) throw new Error('persona-card 提案缺少 worldId（entityId）');
      const safeChanges = pickAllowed(changes, ['name', 'system_prompt']);
      const updated = await updatePersona(worldId, safeChanges);
      for (const op of (Array.isArray(proposal.stateFieldOps) ? proposal.stateFieldOps : [])) {
        if (op.op === 'create') applyStateFieldCreate({ ...op, target: 'persona' }, worldId);
        else if (op.op === 'delete' && op.id) await applyStateFieldDelete({ ...op, target: 'persona' });
      }
      return updated;
    }

    case 'global-config': {
      const safeChanges = deepOmit(changes, ['api_key', 'llm.api_key', 'embedding.api_key']);
      let updated = null;
      if (Object.keys(safeChanges).length > 0) updated = updateConfig(safeChanges);
      const globalOps = proposal.entryOps?.length ? proposal.entryOps : newEntries.map((e) => ({ op: 'create', ...e }));
      for (const op of globalOps) {
        if (op.op === 'create') createGlobalPromptEntry(op);
        else if (op.op === 'update' && op.id) updateGlobalPromptEntry(op.id, pickAllowed(op, ['title', 'description', 'content', 'keywords', 'keyword_scope']));
        else if (op.op === 'delete' && op.id) deleteGlobalPromptEntry(op.id);
      }
      return updated;
    }

    case 'css-snippet': {
      return createCustomCssSnippet({
        name: changes.name || '写卡助手生成',
        content: changes.content || '',
        mode: changes.mode || 'chat',
        enabled: changes.enabled ?? 1,
      });
    }

    case 'regex-rule': {
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
    if (!err.message?.includes('UNIQUE constraint failed')) throw err;
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
  'update_mode', 'trigger_mode', 'trigger_keywords', 'update_instruction',
  'enum_options', 'min_value', 'max_value', 'allow_empty',
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

  if (type === 'world-card' || type === 'character-card' || type === 'persona-card') {
    proposal.entityId = normalizeEntityId(locked.entityId ?? raw?.entityId);
  }

  const changes = raw?.changes && typeof raw.changes === 'object' && !Array.isArray(raw.changes) ? raw.changes : {};

  switch (type) {
    case 'world-card':
      proposal.changes = normalizeWorldChanges(changes);
      proposal.entryOps = normalizeEntryOps(raw?.entryOps, { includeMode: false });
      proposal.stateFieldOps = normalizeStateFieldOps(raw?.stateFieldOps, type);
      break;
    case 'character-card':
      proposal.changes = normalizeCharacterChanges(changes);
      proposal.entryOps = normalizeEntryOps(raw?.entryOps, { includeMode: false });
      proposal.stateFieldOps = normalizeStateFieldOps(raw?.stateFieldOps, type);
      break;
    case 'persona-card':
      proposal.changes = normalizePersonaChanges(changes);
      proposal.stateFieldOps = normalizeStateFieldOps(raw?.stateFieldOps, type);
      break;
    case 'global-config':
      proposal.changes = deepOmit(normalizeObject(changes), ['api_key', 'llm.api_key', 'embedding.api_key']);
      proposal.entryOps = normalizeEntryOps(raw?.entryOps, { includeMode: true });
      break;
    case 'css-snippet':
      proposal.changes = normalizeCssSnippetChanges(changes);
      break;
    case 'regex-rule':
      proposal.changes = normalizeRegexRuleChanges(changes);
      break;
    default: break;
  }

  if (typeof raw?.worldRef === 'string' && raw.worldRef.trim()) proposal.worldRef = raw.worldRef.trim();
  if (typeof raw?.taskId === 'string' && raw.taskId.trim()) proposal.taskId = raw.taskId.trim();
  return proposal;
}

function normalizeWorldChanges(changes) {
  const picked = pickAllowed(changes, ['name', 'system_prompt', 'post_prompt', 'temperature', 'max_tokens']);
  const normalized = {};
  if ('name' in picked) normalized.name = String(picked.name ?? '');
  if ('system_prompt' in picked) normalized.system_prompt = String(picked.system_prompt ?? '');
  if ('post_prompt' in picked) normalized.post_prompt = String(picked.post_prompt ?? '');
  if ('temperature' in picked) normalized.temperature = normalizeNumberOrNull(picked.temperature);
  if ('max_tokens' in picked) normalized.max_tokens = normalizeIntegerOrNull(picked.max_tokens);
  return normalized;
}

function normalizeCharacterChanges(changes) {
  const picked = pickAllowed(changes, ['name', 'system_prompt', 'post_prompt', 'first_message']);
  const normalized = {};
  for (const key of Object.keys(picked)) normalized[key] = String(picked[key] ?? '');
  return normalized;
}

function normalizePersonaChanges(changes) {
  const picked = pickAllowed(changes, ['name', 'system_prompt']);
  const normalized = {};
  for (const key of Object.keys(picked)) normalized[key] = String(picked[key] ?? '');
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

function normalizeEntryOps(rawOps, { includeMode }) {
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
    if ('keyword_scope' in raw) normalized.keyword_scope = raw.keyword_scope;
    if (includeMode && op === 'create') normalized.mode = normalizeMode(raw.mode);
    return normalized;
  });
}

function normalizeStateFieldOps(rawOps, type) {
  if (rawOps == null) return [];
  if (!Array.isArray(rawOps)) throw new Error('提案格式错误：stateFieldOps 必须是数组');
  const allowedTargets = STATE_TARGETS_BY_PROPOSAL_TYPE[type];
  return rawOps.map((raw, idx) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`提案格式错误：stateFieldOps[${idx}] 必须是对象`);
    const op = normalizeString(raw.op);
    if (!['create', 'delete'].includes(op)) throw new Error(`提案格式错误：stateFieldOps[${idx}].op 非法`);
    const target = normalizeString(raw.target);
    if (!target || !allowedTargets.has(target)) throw new Error(`提案格式错误：stateFieldOps[${idx}].target 非法`);
    if (op === 'delete') {
      const id = normalizeEntityId(raw.id);
      if (!id) throw new Error(`提案格式错误：stateFieldOps[${idx}].id 缺失`);
      return { op, target, id };
    }
    const fieldKey = normalizeString(raw.field_key);
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
      trigger_mode: VALID_TRIGGER_MODES.has(raw.trigger_mode) ? raw.trigger_mode : 'manual_only',
      update_instruction: String(raw.update_instruction ?? ''),
      allow_empty: normalizeEnabled(raw.allow_empty),
    };
    if ('trigger_keywords' in raw) normalized.trigger_keywords = normalizeStringArrayOrNull(raw.trigger_keywords);
    if ('enum_options' in raw) normalized.enum_options = normalizeStringArrayOrNull(raw.enum_options);
    if ('min_value' in raw) normalized.min_value = normalizeNumberOrNull(raw.min_value);
    if ('max_value' in raw) normalized.max_value = normalizeNumberOrNull(raw.max_value);
    return normalized;
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

export const __testables = {
  normalizeProposal,
  normalizeEntryOps,
  normalizeStateFieldOps,
  normalizeRegexRuleChanges,
  pickAllowed,
  deepOmit,
  proposalStore,
};

export default router;
