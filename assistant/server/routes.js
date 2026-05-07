/**
 * 写卡助手后端路由
 *
 * POST /api/assistant/extract-characters    — 从写作轮次提取角色（SSE）
 * POST /api/assistant/confirm-characters    — 确认提取结果并创建角色卡（SSE）
 * POST /api/assistant/agent                 — 单代理入口（SSE）
 * POST /api/assistant/agent/:taskId/approve — 批准计划
 * POST /api/assistant/agent/:taskId/cancel  — 取消任务
 * GET  /api/assistant/agent/:taskId/plan-doc — 读取临时计划文档
 * GET  /api/assistant/agent/:taskId         — 任务快照
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { getCharactersByWorldId, createCharacter } from '../../backend/services/characters.js';
import { getConfig } from '../../backend/services/config.js';
import {
  getWorldPromptEntryById,
  listWorldPromptEntries,
} from '../../backend/services/prompt-entries.js';
import { listCharacterStateFields } from '../../backend/services/character-state-fields.js';
import { getMessagesBySessionId, getMessageById } from '../../backend/db/queries/messages.js';
import { addWritingSessionCharacter, getWritingSessionById } from '../../backend/db/queries/writing-sessions.js';
import { deleteCharacter as dbDeleteCharacter } from '../../backend/db/queries/characters.js';
import { upsertCharacterStateValue } from '../../backend/db/queries/character-state-values.js';
import * as llm from '../../backend/llm/index.js';
import { createLogger, formatMeta } from '../../backend/utils/logger.js';
import {
  normalizeProposal,
  normalizeEntryOps,
  normalizeStateFieldOps,
  normalizeStateValueOps,
  normalizeRegexRuleChanges,
  pickAllowed,
  deepOmit,
} from './normalize-proposal.js';
import * as taskStore from './task-store.js';
import * as planDoc from './plan-doc.js';
import { runParentAgent } from './parent-agent.js';

const router = Router();
const log = createLogger('as-route', 'yellow');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── 服务端提案存储（保留，供 normalize-proposal 测试用） ──────────
const proposalStore = new Map();
const PROPOSAL_TTL_MS = 30 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  let removed = 0;
  for (const [token, entry] of proposalStore.entries()) {
    if (now > entry.expiresAt) { proposalStore.delete(token); removed++; }
  }
  if (removed > 0) log.info(`proposalStore GC  ${formatMeta({ removed })}`);
}, 10 * 60 * 1000).unref();

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

function openSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

function endSSE(res) {
  sendSSE(res, { done: true });
  res.end();
}

// 极简 prompt 加载器（仅供 /extract-characters 使用）
// 旧版 buildAgentMessages 的简化版：按 "## 本次任务" 分割 system / user
function buildPromptMessages(promptFileBaseName, taskContent) {
  const filePath = path.resolve(__dirname, '../prompts', `${promptFileBaseName}.md`);
  const raw = readFileSync(filePath, 'utf-8');
  const TASK_SECTION = '\n## 本次任务\n';
  const idx = raw.indexOf(TASK_SECTION);
  if (idx !== -1) {
    const systemPart = raw.slice(0, idx).trim();
    const userPart = raw.slice(idx + TASK_SECTION.length).replace('{{TASK}}', taskContent).trim();
    return [
      { role: 'system', content: systemPart },
      { role: 'user', content: userPart },
    ];
  }
  return [{ role: 'user', content: raw.replace('{{TASK}}', taskContent) }];
}

// ─── POST /api/assistant/extract-characters ──────────────────────────
// 从写作轮次（user + assistant 消息对）中提取非玩家角色
// dryRun=true：只提取，发送 characters_extracted 事件，不创建卡
// dryRun=false（默认）：提取 + 创建 + 激活，发送 card_activated 事件
// SSE 事件：characters_extracted / character_found / card_activated / error / done

router.post('/extract-characters', async (req, res) => {
  const { worldId, sessionId, assistantMessageId, dryRun = false } = req.body ?? {};
  if (!worldId || !sessionId || !assistantMessageId) {
    return res.status(400).json({ error: 'worldId、sessionId、assistantMessageId 均为必填项' });
  }

  // 校验 sessionId 归属于 worldId
  const session = getWritingSessionById(sessionId);
  if (!session || session.world_id !== worldId) {
    return res.status(400).json({ error: '会话不存在或不属于指定世界' });
  }

  // 校验消息归属于该会话且为 assistant 消息
  const assistantMsg = getMessageById(assistantMessageId);
  if (!assistantMsg || assistantMsg.session_id !== sessionId || assistantMsg.role !== 'assistant') {
    return res.status(400).json({ error: '消息不存在、不属于指定会话或不是助手消息' });
  }

  openSSE(res);

  try {
    // 找到此 assistant 消息前最近的 user 消息
    const allMsgs = getMessagesBySessionId(sessionId, 500);
    const aIdx = allMsgs.findIndex((m) => m.id === assistantMessageId);
    const userMsg = aIdx > 0
      ? [...allMsgs].slice(0, aIdx).reverse().find((m) => m.role === 'user')
      : null;

    const existingChars = getCharactersByWorldId(worldId);
    const stateFields = listCharacterStateFields(worldId);

    // 构建 LLM 任务描述
    const existingNames = existingChars.map((c) => c.name).join('、') || '（无）';
    const sfDesc = stateFields.length > 0
      ? stateFields.map((f) => {
          let extra = '';
          if (f.type === 'enum' && Array.isArray(f.enum_options) && f.enum_options.length > 0) {
            extra = `，可选值：[${f.enum_options.map((o) => `"${o}"`).join(', ')}]`;
          } else if (f.type === 'datetime') {
            extra = '，格式：ISO 局部时间 "YYYY-MM-DDTHH:mm"（如 "1000-03-15T14:30"）';
          }
          return `- ${f.field_key}（${f.label}，类型：${f.type}${extra}${f.description ? '，说明：' + f.description : ''}）`;
        }).join('\n')
      : '（无状态字段定义）';

    // 收集本轮 LLM 实际看到的世界书条目：always 常驻条目 + 该 assistant message 保存的命中条目
    const allWorldEntries = listWorldPromptEntries(worldId);
    const alwaysEntries = allWorldEntries.filter((e) => e.trigger_type === 'always');
    const savedActivated = Array.isArray(assistantMsg.activated_entries) ? assistantMsg.activated_entries : [];
    const seenIds = new Set(alwaysEntries.map((e) => e.id));
    const triggeredEntries = [];
    for (const item of savedActivated) {
      if (!item?.id || seenIds.has(item.id)) continue;
      const full = getWorldPromptEntryById(item.id);
      if (!full) continue;
      triggeredEntries.push(full);
      seenIds.add(item.id);
    }
    const contextEntries = [...alwaysEntries, ...triggeredEntries];
    const entriesDesc = contextEntries.length > 0
      ? contextEntries.map((e) => `### ${e.title || '（无标题）'}\n${e.content || ''}`.trim()).join('\n\n')
      : '（无世界书条目）';

    const task = [
      '## 用户输入',
      userMsg?.content ? userMsg.content : '（无用户输入）',
      '',
      '## AI 回复',
      assistantMsg.content || '（内容为空）',
      '',
      `## 世界书条目（仅供参考世界设定，不要直接照抄）\n${entriesDesc}`,
      '',
      `## 世界中已有角色（请排除）\n${existingNames}`,
      '',
      `## 角色状态字段定义\n${sfDesc}`,
    ].join('\n');

    log.info(`extract-chars START  ${formatMeta({ worldId, sessionId, existingCount: existingChars.length, sfCount: stateFields.length, entryCount: contextEntries.length })}`);

    const messages = buildPromptMessages('extract-characters', task);
    const config = getConfig();
    const configScope = config.assistant?.model_source === 'aux' ? 'aux' : 'main';
    let raw = await llm.complete(messages, { temperature: 0.3, thinking_level: null, configScope });

    function parseCharacterArray(text) {
      const s = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      const codeMatch = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const src = codeMatch ? codeMatch[1].trim() : s;
      const parsed = JSON.parse(src);
      return Array.isArray(parsed) ? parsed : [];
    }

    let characters;
    try {
      characters = parseCharacterArray(raw);
    } catch {
      messages.push({ role: 'assistant', content: raw });
      messages.push({ role: 'user', content: '你的输出无法解析为合法 JSON 数组。请只输出一个 JSON 数组，不要代码块或解释。' });
      raw = await llm.complete(messages, { temperature: 0.3, thinking_level: null, configScope });
      try { characters = parseCharacterArray(raw); }
      catch { characters = []; }
    }

    // 已有角色名集合，用于去重
    const existingNameSet = new Set(existingChars.map((c) => c.name.trim().toLowerCase()));

    // 过滤掉已存在的角色
    const newCharacters = characters.filter((charData) => {
      const name = (charData.name || '').trim();
      if (!name) return false;
      if (existingNameSet.has(name.toLowerCase())) {
        log.info(`extract-chars SKIP_DUP  ${formatMeta({ name })}`);
        return false;
      }
      return true;
    });

    log.info(`extract-chars FOUND  ${formatMeta({ count: newCharacters.length })}`);

    if (dryRun) {
      // 只返回提取结果，不创建
      sendSSE(res, { type: 'characters_extracted', characters: newCharacters, count: newCharacters.length });
    } else {
      sendSSE(res, { type: 'extract_done', count: newCharacters.length });
      for (const charData of newCharacters) {
        const name = charData.name.trim();
        sendSSE(res, { type: 'character_found', name });
        let char;
        try {
          char = createCharacter({
            world_id: worldId,
            name,
            description: charData.description || '',
            system_prompt: charData.system_prompt || '',
            post_prompt: charData.post_prompt || '',
            first_message: charData.first_message || '',
          });
          if (stateFields.length > 0 && charData.state_values && typeof charData.state_values === 'object') {
            for (const [key, val] of Object.entries(charData.state_values)) {
              if (stateFields.some((f) => f.field_key === key)) {
                upsertCharacterStateValue(char.id, key, { defaultValueJson: JSON.stringify(val) });
              }
            }
          }
          addWritingSessionCharacter(sessionId, char.id);
          existingNameSet.add(name.toLowerCase());
          log.info(`extract-chars CREATED  ${formatMeta({ characterId: char.id, name: char.name })}`);
          sendSSE(res, { type: 'card_activated', characterId: char.id, character: char });
        } catch (charErr) {
          if (char?.id) { try { dbDeleteCharacter(char.id); } catch { /* ignore */ } }
          log.error(`extract-chars CHAR_FAIL  ${formatMeta({ name, error: charErr.message })}`);
          sendSSE(res, { type: 'error', error: `角色「${name}」创建失败：${charErr.message}` });
        }
      }
    }
  } catch (err) {
    log.error(`extract-chars FAIL  ${formatMeta({ error: err.message })}`);
    sendSSE(res, { type: 'error', error: err.message });
  }

  endSSE(res);
});

// ─── POST /api/assistant/confirm-characters ──────────────────────────
// 接收前端预览确认后的角色数组，创建角色卡并激活到会话
// SSE 事件：card_activated / error / done

router.post('/confirm-characters', async (req, res) => {
  const { worldId, sessionId, characters } = req.body ?? {};
  if (!worldId || !sessionId || !Array.isArray(characters) || characters.length === 0) {
    return res.status(400).json({ error: 'worldId、sessionId、characters（非空数组）均为必填项' });
  }

  const session = getWritingSessionById(sessionId);
  if (!session || session.world_id !== worldId) {
    return res.status(400).json({ error: '会话不存在或不属于指定世界' });
  }

  openSSE(res);

  try {
    const existingChars = getCharactersByWorldId(worldId);
    const stateFields = listCharacterStateFields(worldId);
    const existingNameSet = new Set(existingChars.map((c) => c.name.trim().toLowerCase()));

    for (const charData of characters) {
      const name = (charData.name || '').trim();
      if (!name) continue;

      if (existingNameSet.has(name.toLowerCase())) {
        log.info(`confirm-chars SKIP_DUP  ${formatMeta({ name })}`);
        continue;
      }

      let char;
      try {
        char = createCharacter({
          world_id: worldId,
          name,
          description: charData.description || '',
          system_prompt: charData.system_prompt || '',
          post_prompt: charData.post_prompt || '',
          first_message: charData.first_message || '',
        });

        if (stateFields.length > 0 && charData.state_values && typeof charData.state_values === 'object') {
          for (const [key, val] of Object.entries(charData.state_values)) {
            if (stateFields.some((f) => f.field_key === key)) {
              upsertCharacterStateValue(char.id, key, { defaultValueJson: JSON.stringify(val) });
            }
          }
        }

        addWritingSessionCharacter(sessionId, char.id);
        existingNameSet.add(name.toLowerCase());
        log.info(`confirm-chars CREATED  ${formatMeta({ characterId: char.id, name: char.name })}`);
        sendSSE(res, { type: 'card_activated', characterId: char.id, character: char });
      } catch (charErr) {
        if (char?.id) { try { dbDeleteCharacter(char.id); } catch { /* ignore */ } }
        log.error(`confirm-chars CHAR_FAIL  ${formatMeta({ name, error: charErr.message })}`);
        sendSSE(res, { type: 'error', error: `角色「${name}」创建失败：${charErr.message}` });
      }
    }
  } catch (err) {
    log.error(`confirm-chars FAIL  ${formatMeta({ error: err.message })}`);
    sendSSE(res, { type: 'error', error: err.message });
  }

  endSSE(res);
});

// ─── 提案归一化已移至 ./normalize-proposal.js ─────────────────────

export const __testables = {
  normalizeProposal,
  normalizeEntryOps,
  normalizeStateFieldOps,
  normalizeStateValueOps,
  normalizeRegexRuleChanges,
  pickAllowed,
  deepOmit,
  proposalStore,
};

// === 单代理端点 ===

router.post('/agent', async (req, res) => {
  const { taskId, message, messageId, context } = req.body ?? {};
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders?.();

  let task = taskId ? taskStore.getTask(taskId) : null;
  const isNew = !task;
  if (!task) {
    task = taskStore.createTask({ context });
    res.write(`data: ${JSON.stringify({ type: 'task_created', taskId: task.id, task })}\n\n`);
  }
  taskStore.attachSse(task.id, res);
  // 注意：必须用 res.on('close')，不能用 req.on('close')。
  // express.json() 消费完请求体后 IncomingMessage 立即 emit 'close'，
  // 导致 SSE 客户端在 LLM 还在跑时就被提前 detach（事件全丢）。
  res.on('close', () => taskStore.detachSse(task.id, res));

  log.info(`/agent  ${formatMeta({ taskId: task.id, status: task.status, isNew, msgChars: (message ?? '').length })}`);

  try {
    if (task.status === 'executing') {
      // executing 时仅入队；当前 step 跑完后 dispatch_subagent 钩子会消费 pendingMessages
      // 并把任务切到 paused（spec §6.4）。下一轮用户消息进入 paused 分支才触发 LLM。
      taskStore.queueUserMessage(task.id, message);
      log.info(`/agent QUEUE  ${formatMeta({ taskId: task.id, queueSize: task.pendingUserMessages.length })}`);
      return; // 保持 SSE 连接
    }
    // planning / awaiting_approval / clarifying / paused 都直接走父代理
    await runParentAgent(task, message, { userMessageId: messageId });
  } catch (err) {
    log.error(`/agent FAIL  ${formatMeta({ taskId: task.id, error: err.message })}`);
    res.write(`data: ${JSON.stringify({ type: 'task_failed', taskId: task.id, error: err.message })}\n\n`);
  }
});

router.post('/agent/:taskId/approve', async (req, res) => {
  const task = taskStore.getTask(req.params.taskId);
  if (!task || task.status !== 'awaiting_approval') {
    log.warn(`/agent/approve REJECT  ${formatMeta({ taskId: req.params.taskId, status: task?.status ?? 'missing' })}`);
    return res.status(400).json({ error: 'not awaiting approval' });
  }
  log.info(`/agent/approve  ${formatMeta({ taskId: task.id })}`);
  taskStore.setStatus(task.id, 'executing');
  taskStore.emit(task.id, { type: 'plan_approved', taskId: task.id });
  // 触发 parent-agent 继续派发；用一个空消息触发执行循环
  runParentAgent(task, '<<approved>>').catch((err) => {
    log.error(`/agent/approve RESUME_FAIL  ${formatMeta({ taskId: task.id, error: err.message })}`);
    taskStore.emit(task.id, { type: 'task_failed', taskId: task.id, error: err.message });
  });
  res.json({ ok: true });
});

router.post('/agent/:taskId/cancel', async (req, res) => {
  const task = taskStore.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'not found' });
  log.info(`/agent/cancel  ${formatMeta({ taskId: task.id, fromStatus: task.status })}`);
  await planDoc.deletePlanDoc(task.id);
  taskStore.setStatus(task.id, 'cancelled');
  taskStore.emit(task.id, { type: 'task_cancelled', taskId: task.id });
  res.json({ ok: true });
});

router.post('/agent/:taskId/truncate', (req, res) => {
  const task = taskStore.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'not found' });
  if (task.status === 'executing') {
    log.warn(`/agent/truncate REJECT  ${formatMeta({ taskId: task.id, status: task.status })}`);
    return res.status(400).json({ error: 'cannot truncate while executing' });
  }
  const messageId = req.body?.messageId;
  const dropped = taskStore.truncateFrom(task.id, messageId);
  if (dropped < 0) return res.status(404).json({ error: 'message not found' });
  log.info(`/agent/truncate  ${formatMeta({ taskId: task.id, messageId, dropped })}`);
  taskStore.emit(task.id, { type: 'messages_changed', taskId: task.id, messages: task.messages });
  res.json({ ok: true, messages: task.messages });
});

router.post('/agent/:taskId/delete', (req, res) => {
  const task = taskStore.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'not found' });
  if (task.status === 'executing') {
    log.warn(`/agent/delete REJECT  ${formatMeta({ taskId: task.id, status: task.status })}`);
    return res.status(400).json({ error: 'cannot delete while executing' });
  }
  const messageId = req.body?.messageId;
  const ok = taskStore.deleteMessage(task.id, messageId);
  if (!ok) return res.status(404).json({ error: 'message not found' });
  log.info(`/agent/delete  ${formatMeta({ taskId: task.id, messageId })}`);
  taskStore.emit(task.id, { type: 'messages_changed', taskId: task.id, messages: task.messages });
  res.json({ ok: true, messages: task.messages });
});

router.get('/agent/:taskId/plan-doc', async (req, res) => {
  const content = await planDoc.readPlanDoc(req.params.taskId).catch(() => '');
  res.json({ content });
});

router.get('/agent/:taskId', (req, res) => {
  const task = taskStore.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: 'not found' });
  res.json({ task });
});

export default router;
