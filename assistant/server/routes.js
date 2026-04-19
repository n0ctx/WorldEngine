/**
 * 写卡助手后端路由
 *
 * POST /api/assistant/chat    — SSE 流式对话（主代理 + 子代理路由）
 * POST /api/assistant/execute — 应用子代理提案（写入数据库）
 */

import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { routeMessage, streamResponse } from './main-agent.js';
import { processWorldCard } from './sub-agents/world-card.js';
import { processCharacterCard } from './sub-agents/character-card.js';
import { processPersonaCard } from './sub-agents/persona-card.js';
import { processGlobalPrompt } from './sub-agents/global-prompt.js';
import { processCssRegex } from './sub-agents/css-regex.js';
import { getWorldById, createWorld, updateWorld, deleteWorld } from '../../backend/services/worlds.js';
import { getCharacterById, createCharacter, updateCharacter, deleteCharacter } from '../../backend/services/characters.js';
import { getOrCreatePersona, updatePersona } from '../../backend/services/personas.js';
import { getPersonaByWorldId } from '../../backend/db/queries/personas.js';
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
  getAllWorldEntries,
  getAllCharacterEntries,
  getAllGlobalEntries,
} from '../../backend/db/queries/prompt-entries.js';
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

const router = Router();

// ─── 服务端提案存储（Token → Proposal，TTL 30 分钟） ──────────────
const proposalStore = new Map();
const PROPOSAL_TTL_MS = 30 * 60 * 1000;

// ─── SSE 工具 ─────────────────────────────────────────────────────

function sendSSE(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ─── 子代理分发表 ─────────────────────────────────────────────────

const SUB_AGENTS = {
  'world-card': processWorldCard,
  'character-card': processCharacterCard,
  'persona-card': processPersonaCard,
  'global-prompt': processGlobalPrompt,
  'css-regex': processCssRegex,
};

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

  // ── 加载实体数据（create 时返回 {}，update/delete 时加载现有实体）──
  function loadEntityData(target, operation, entityId) {
    if (operation === 'create') return {};
    if (target === 'world-card') {
      const worldId = entityId || context.worldId;
      if (!worldId) throw Object.assign(new Error('请先选择一个世界，再让助手修改世界卡'), { userFacing: true });
      const world = getWorldById(worldId);
      if (!world) throw Object.assign(new Error('找不到指定的世界，可能已被删除'), { userFacing: true });
      return {
        ...world,
        existingEntries: getAllWorldEntries(worldId),
        existingWorldStateFields: listWorldStateFields(worldId),
        existingPersonaStateFields: getPersonaStateFieldsByWorldId(worldId),
        existingCharacterStateFields: listCharacterStateFields(worldId),
      };
    }
    if (target === 'character-card') {
      const charId = entityId || context.characterId;
      if (!charId) throw Object.assign(new Error('请先选择一个角色，再让助手修改角色卡'), { userFacing: true });
      const character = getCharacterById(charId);
      if (!character) throw Object.assign(new Error('找不到指定的角色，可能已被删除'), { userFacing: true });
      return {
        ...character,
        existingEntries: getAllCharacterEntries(charId),
        existingCharacterStateFields: listCharacterStateFields(character.world_id),
        existingPersonaStateFields: getPersonaStateFieldsByWorldId(character.world_id),
      };
    }
    if (target === 'persona-card') {
      const worldId = entityId || context.worldId;
      if (!worldId) throw Object.assign(new Error('请先选择一个世界，再让助手修改玩家卡'), { userFacing: true });
      const persona = getOrCreatePersona(worldId);
      return {
        ...persona,
        existingPersonaStateFields: getPersonaStateFieldsByWorldId(worldId),
      };
    }
    if (target === 'global-prompt') {
      const config = getConfig();
      return { ...config, existingEntries: getAllGlobalEntries() };
    }
    return {}; // css-regex 不需要实体数据
  }

  // ── 执行单个子代理任务 ─────────────────────────────────────────────
  async function executeOneTask(taskSpec) {
    const { target, operation = 'update', task: taskDesc, taskId, worldRef } = taskSpec;
    // character/persona-card 操作时：entityId 应为世界 ID；若路由 LLM 未填，回退到 context.worldId
    let entityId = taskSpec.entityId ?? null;
    if ((target === 'character-card' && operation === 'create' && !entityId) ||
        (target === 'persona-card' && !entityId)) {
      entityId = context.worldId ?? null;
    }
    if (!SUB_AGENTS[target]) {
      sendSSE(res, { type: 'error', error: `未知子代理类型: ${target}`, taskId });
      return null;
    }
    sendSSE(res, { type: 'routing', taskId, target, task: taskDesc });
    let entityData;
    try {
      entityData = loadEntityData(target, operation, entityId);
    } catch (err) {
      sendSSE(res, { type: 'error', error: err.message, taskId });
      return null;
    }
    const proposalRaw = await SUB_AGENTS[target](
      { task: taskDesc, operation, entityId: entityId ?? null },
      entityData,
      context,
    );
    // 透传 worldRef / taskId 供前端依赖解析
    if (worldRef) proposalRaw.worldRef = worldRef;
    if (taskId) proposalRaw.taskId = taskId;
    const token = randomUUID();
    proposalStore.set(token, { proposal: proposalRaw, expiresAt: Date.now() + PROPOSAL_TTL_MS });
    sendSSE(res, { type: 'proposal', taskId, token, proposal: proposalRaw });
    return { taskId, token, proposal: proposalRaw };
  }

  try {
    // Phase 1：路由决策
    const decision = await routeMessage(message, history, context);

    let proposals = [];

    if (decision.action === 'delegate' && decision.target && SUB_AGENTS[decision.target]) {
      // 单任务委托（兼容旧格式）
      const result = await executeOneTask({
        target: decision.target,
        operation: decision.operation || 'update',
        task: decision.task,
        entityId: decision.entityId ?? null,
        taskId: 't0',
      });
      if (result) proposals = [result.proposal];

    } else if (decision.action === 'multi-delegate' && Array.isArray(decision.tasks)) {
      // 多任务并行委托
      const results = await Promise.all(decision.tasks.map((t) => executeOneTask(t)));
      proposals = results.filter(Boolean).map((r) => r.proposal);
    }

    // Phase 2：主代理流式回复
    const summaryProposal =
      proposals.length === 1
        ? proposals[0]
        : proposals.length > 1
          ? { explanation: proposals.map((p) => p.explanation).join('；') }
          : null;
    const gen = streamResponse(message, history, context, summaryProposal);
    for await (const chunk of gen) {
      sendSSE(res, { delta: chunk });
    }

    sendSSE(res, { done: true });
  } catch (err) {
    sendSSE(res, { type: 'error', error: err.message });
  } finally {
    res.end();
  }
});

// ─── POST /api/assistant/execute ─────────────────────────────────

router.post('/execute', async (req, res) => {
  const { token, worldRefId, editedProposal } = req.body;

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
    ? {
        ...base,
        changes: editedProposal.changes ?? base.changes,
        entryOps: Array.isArray(editedProposal.entryOps) ? editedProposal.entryOps : base.entryOps,
        stateFieldOps: Array.isArray(editedProposal.stateFieldOps) ? editedProposal.stateFieldOps : base.stateFieldOps,
      }
    : base;

  try {
    const result = await applyProposal(effective, worldRefId);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 提案执行器 ───────────────────────────────────────────────────

async function applyProposal(proposal, worldRefId = null) {
  const { type, operation = 'update', entityId, changes = {}, newEntries = [] } = proposal;

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
        const worldOps = Array.isArray(proposal.entryOps) ? proposal.entryOps : [];
        for (const op of worldOps) {
          if (op.op === 'create') createWorldPromptEntry(newWorld.id, op);
        }
        const sfOps = Array.isArray(proposal.stateFieldOps) ? proposal.stateFieldOps : [];
        for (const op of sfOps) {
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
      if (Object.keys(safeChanges).length > 0) {
        updated = await updateWorld(entityId, safeChanges);
      }
      const worldOps = proposal.entryOps?.length
        ? proposal.entryOps
        : newEntries.map((e) => ({ op: 'create', ...e }));
      for (const op of worldOps) {
        if (op.op === 'create') {
          createWorldPromptEntry(entityId, op);
        } else if (op.op === 'update' && op.id) {
          updateWorldPromptEntry(op.id, pickAllowed(op, ['title', 'summary', 'content', 'keywords']));
        } else if (op.op === 'delete' && op.id) {
          deleteWorldPromptEntry(op.id);
        }
      }
      const worldSfOps = Array.isArray(proposal.stateFieldOps) ? proposal.stateFieldOps : [];
      for (const op of worldSfOps) {
        if (op.op === 'create') {
          applyStateFieldCreate(op, entityId);
        } else if (op.op === 'delete' && op.id) {
          await applyStateFieldDelete(op);
        }
      }
      return updated;
    }

    case 'character-card': {
      if (operation === 'create') {
        // worldRefId 由前端在应用依赖世界后传入
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
        const charOps = Array.isArray(proposal.entryOps) ? proposal.entryOps : [];
        for (const op of charOps) {
          if (op.op === 'create') createCharacterPromptEntry(newChar.id, op);
        }
        const sfOps = Array.isArray(proposal.stateFieldOps) ? proposal.stateFieldOps : [];
        for (const op of sfOps) {
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
      if (Object.keys(safeChanges).length > 0) {
        updated = await updateCharacter(entityId, safeChanges);
      }
      const charOps = proposal.entryOps?.length
        ? proposal.entryOps
        : newEntries.map((e) => ({ op: 'create', ...e }));
      for (const op of charOps) {
        if (op.op === 'create') {
          createCharacterPromptEntry(entityId, op);
        } else if (op.op === 'update' && op.id) {
          updateCharacterPromptEntry(op.id, pickAllowed(op, ['title', 'summary', 'content', 'keywords']));
        } else if (op.op === 'delete' && op.id) {
          deleteCharacterPromptEntry(op.id);
        }
      }
      // 角色/玩家状态字段属于 world — 需要查 character 的 world_id
      const charSfOps = Array.isArray(proposal.stateFieldOps) ? proposal.stateFieldOps : [];
      if (charSfOps.length > 0) {
        const character = getCharacterById(entityId);
        if (character) {
          for (const op of charSfOps) {
            if (op.op === 'create') {
              applyStateFieldCreate(op, character.world_id);
            } else if (op.op === 'delete' && op.id) {
              await applyStateFieldDelete(op);
            }
          }
        }
      }
      return updated;
    }

    case 'persona-card': {
      // persona 是 upsert，entityId 为 worldId
      const worldId = entityId;
      if (!worldId) throw new Error('persona-card 提案缺少 worldId（entityId）');
      const safeChanges = pickAllowed(changes, ['name', 'system_prompt']);
      const updated = await updatePersona(worldId, safeChanges);
      const sfOps = Array.isArray(proposal.stateFieldOps) ? proposal.stateFieldOps : [];
      for (const op of sfOps) {
        if (op.op === 'create') applyStateFieldCreate({ ...op, target: 'persona' }, worldId);
        else if (op.op === 'delete' && op.id) await applyStateFieldDelete({ ...op, target: 'persona' });
      }
      return updated;
    }

    case 'global-config': {
      // 安全白名单：禁止修改 api_key
      const safeChanges = deepOmit(changes, ['api_key', 'llm.api_key', 'embedding.api_key']);
      let updated = null;
      if (Object.keys(safeChanges).length > 0) {
        updated = updateConfig(safeChanges);
      }
      const globalOps = proposal.entryOps?.length
        ? proposal.entryOps
        : newEntries.map((e) => ({ op: 'create', ...e }));
      for (const op of globalOps) {
        if (op.op === 'create') {
          createGlobalPromptEntry(op);
        } else if (op.op === 'update' && op.id) {
          updateGlobalPromptEntry(op.id, pickAllowed(op, ['title', 'summary', 'content', 'keywords']));
        } else if (op.op === 'delete' && op.id) {
          deleteGlobalPromptEntry(op.id);
        }
      }
      return updated;
    }

    case 'css-snippet': {
      const snippet = createCustomCssSnippet({
        name: changes.name || '写卡助手生成',
        content: changes.content || '',
        mode: changes.mode || 'chat',
        enabled: changes.enabled ?? 1,
      });
      return snippet;
    }

    case 'regex-rule': {
      const VALID_SCOPES = new Set(['user_input', 'ai_output', 'display_only', 'prompt_only']);
      const scope = VALID_SCOPES.has(changes.scope) ? changes.scope : 'display_only';
      const rule = createRegexRule({
        name: changes.name || '写卡助手生成',
        pattern: changes.pattern || '',
        replacement: changes.replacement ?? '',
        flags: changes.flags || 'g',
        scope,
        world_id: changes.world_id ?? null,
        mode: changes.mode || 'chat',
      });
      return rule;
    }

    default:
      throw new Error(`未知的提案类型：${type}`);
  }
}

// ─── 工具函数 ─────────────────────────────────────────────────────

/**
 * 根据 op.target 分发状态字段创建到正确的服务
 * @param {object} op  stateFieldOp（含 target: 'world'|'persona'|'character'）
 * @param {string} worldId  世界 ID（所有 target 均需要）
 */
function applyStateFieldCreate(op, worldId) {
  const data = pickAllowed(op, STATE_FIELD_KEYS);
  try {
    switch (op.target) {
      case 'persona':
        createPersonaStateField(worldId, data);
        break;
      case 'character':
        createCharacterStateField(worldId, data);
        break;
      case 'world':
      default:
        createWorldStateField(worldId, data);
        break;
    }
  } catch (err) {
    // 多角色同时创建时，相同 field_key 可能已由前一个提案创建，UNIQUE 冲突可安全忽略
    if (!err.message?.includes('UNIQUE constraint failed')) throw err;
  }
}

/**
 * 根据 op.target 分发状态字段删除到正确的服务
 */
async function applyStateFieldDelete(op) {
  switch (op.target) {
    case 'persona':
      await deletePersonaStateField(op.id);
      break;
    case 'character':
      await deleteCharacterStateField(op.id);
      break;
    case 'world':
    default:
      await deleteWorldStateField(op.id);
      break;
  }
}

const STATE_FIELD_KEYS = [
  'field_key', 'label', 'type', 'description', 'default_value',
  'update_mode', 'trigger_mode', 'trigger_keywords', 'update_instruction',
  'enum_options', 'min_value', 'max_value', 'allow_empty',
];

function pickAllowed(obj, allowed) {
  const result = {};
  for (const key of allowed) {
    if (key in obj) result[key] = obj[key];
  }
  return result;
}

function deepOmit(obj, keys) {
  const result = { ...obj };
  for (const key of keys) {
    if (key.includes('.')) {
      const [top, ...rest] = key.split('.');
      if (result[top] && typeof result[top] === 'object') {
        result[top] = deepOmit(result[top], [rest.join('.')]);
      }
    } else {
      delete result[key];
    }
  }
  return result;
}

export default router;
