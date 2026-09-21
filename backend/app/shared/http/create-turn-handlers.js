import * as llm from '../../../llm/index.js';
import { activeStreams, saveAttachments } from '../../../services/chat.js';
import { getOrCreatePersona } from '../../../services/personas.js';
import { updateMessageContent } from '../../../db/queries/messages.js';
import { getMessageById } from '../../../services/sessions.js';
import { createTurnRecord } from '../../../memory/turn-summarizer.js';
import { updateAllStates } from '../../../memory/combined-state-updater.js';
import { generateTitle } from '../../../memory/summarizer.js';
import { enqueue, waitForQueueIdle } from '../../../utils/async-queue.js';
import { ALL_MESSAGES_LIMIT } from '../../../utils/constants.js';
import { formatMeta } from '../../../utils/logger.js';
import { stripThinkBlocksFromText } from '../../../utils/turn-dialogue.js';
import { renderBackendPrompt } from '../../../prompts/prompt-loader.js';
import { runHook } from '../../../hooks/hook-registry.js';
import { buildTurnContext } from '../../turn/build-turn-context.js';
import { runTurnContinue } from '../../turn/run-turn-continue.js';
import { runTurnRegenerate } from '../../turn/run-turn-regenerate.js';
import { runTurnStream } from '../../turn/run-turn-stream.js';
import {
  attachSessionStreamSse,
  buildSessionStreamSnapshot,
  getRecoverableSessionStreamTask,
  writeSessionStreamSse,
} from '../../../services/session-stream-task-store.js';

/**
 * 回合端点的 handler 工厂：对话与写作共用同一批实现。
 *
 * URL 不进这里 —— 两套前缀（/api/sessions/:sessionId/* 与
 * /api/worlds/:worldId/writing-sessions/:sessionId/*）是前端硬契约，各自在路由文件里挂载。
 * 真正的差异只有两处：会话归属校验（resolveSession）和日志前缀（logNs）。
 *
 * @param {object}   opts
 * @param {object}   opts.mode                  模式描述符
 * @param {Function} opts.resolveSession        (req, res) => session | null；返回 null 表示已写过响应
 * @param {Function} opts.emitSse               createSseEmitter(log) 的产物
 * @param {string}   opts.logNs                 日志前缀命名空间
 * @param {boolean}  [opts.guardStreamEndpoints] 断线恢复端点是否校验会话归属
 */
export function createTurnHandlers({ mode, resolveSession, emitSse, logNs, guardStreamEndpoints = true }) {
  const log = mode.log;

  const badRequest = (req, res, reason) => {
    log.warn(`${logNs}.bad_request ${formatMeta({ method: req.method, path: req.path, reason })}`);
    return res.status(400).json({ error: reason });
  };

  const unhandled = (req, res, err) => {
    log.error(`${logNs}.unhandled ${formatMeta({ method: req.method, path: req.path, msg: err?.message })}`);
    return res.status(500).json({ error: err.message });
  };

  /** 流式端点共用的 SSE 出入口 */
  const streamIo = (sessionId, res) => ({
    emitSse: (payload, options) => emitSse(sessionId, payload, options),
    attachSse: (task) => attachSessionStreamSse(sessionId, task.id, res),
  });

  return {
    /**
     * 新一轮生成。对话侧 content 必填并支持附件；写作侧 content 可选（空输入即纯续写）。
     */
    generate: ({ requireContent, allowAttachments, logLabel }) => async (req, res) => {
      const { sessionId } = req.params;
      const { content, attachments, diaryInjection } = req.body;

      if (requireContent && (!content || typeof content !== 'string')) {
        return badRequest(req, res, 'content is required');
      }
      if (!resolveSession(req, res)) return;

      let userMsgId = null;
      const trimmed = typeof content === 'string' ? content.trim() : '';
      if (requireContent || trimmed) {
        const messageContent = requireContent ? content : trimmed;
        const acceptedAttachments = allowAttachments ? (attachments ?? []) : [];

        await runHook('message:user:before', { sessionId, content: messageContent, attachments: acceptedAttachments });
        const userMsg = mode.session.createMessage({ session_id: sessionId, role: 'user', content: messageContent });
        userMsgId = userMsg.id;
        mode.session.touch(sessionId);

        if (acceptedAttachments.length > 0) {
          userMsg.attachments = saveAttachments(userMsg.id, acceptedAttachments);
          log.info(
            `ATTACHMENTS SAVED  ${formatMeta({
              session: sessionId.slice(0, 8),
              userMsgId: userMsg.id.slice(0, 8),
              count: acceptedAttachments.length,
            })}`
          );
        }

        await runHook('message:user:saved', { message: userMsg, sessionId });
        log.info(
          `${logLabel}  ${formatMeta({
            session: sessionId.slice(0, 8),
            len: messageContent.length,
            attachments: acceptedAttachments.length,
            hasDiaryInject: !!diaryInjection,
          })}`
        );
      }

      await runTurnStream({
        mode,
        sessionId,
        ...streamIo(sessionId, res),
        activeStreams,
        userMsgId,
        userContent: requireContent ? content : trimmed,
        diaryInjection: typeof diaryInjection === 'string' ? diaryInjection : undefined,
      });
    },

    stop: (req, res) => {
      const { sessionId } = req.params;
      if (!resolveSession(req, res)) return;
      const controller = activeStreams.get(sessionId);
      if (controller) controller.abort();
      res.json({ success: true });
    },

    regenerate: async (req, res) => {
      const { sessionId } = req.params;
      const { afterMessageId } = req.body;

      if (!afterMessageId) return badRequest(req, res, 'afterMessageId is required');
      if (!resolveSession(req, res)) return;

      const afterMessage = getMessageById(afterMessageId);
      if (!afterMessage) {
        log.warn(`${logNs}.not_found ${formatMeta({ method: req.method, path: req.path, id: afterMessageId })}`);
        return res.status(404).json({ error: 'afterMessageId not found' });
      }
      if (afterMessage.session_id !== sessionId) {
        return badRequest(req, res, 'afterMessageId does not belong to this session');
      }
      if (afterMessage.role !== 'user') {
        return badRequest(req, res, 'afterMessageId must be a user message');
      }

      log.info(
        `POST /regenerate  ${formatMeta({
          session: sessionId.slice(0, 8),
          after: afterMessageId.slice(0, 8),
        })}`
      );

      await runTurnRegenerate({
        mode,
        sessionId,
        afterMessageId,
        ...streamIo(sessionId, res),
        activeStreams,
      });
    },

    continueTurn: async (req, res) => {
      const { sessionId } = req.params;
      if (!resolveSession(req, res)) return;

      const messages = mode.session.getMessages(sessionId, ALL_MESSAGES_LIMIT, 0);
      const lastAssistantIndex = messages.map((message) => message.role).lastIndexOf('assistant');
      if (lastAssistantIndex < 0) {
        return res.status(400).json({ error: '当前会话没有 AI 回复可续写' });
      }
      const hasUserBeforeAssistant = messages
        .slice(0, lastAssistantIndex)
        .some((message) => message.role === 'user');
      if (!hasUserBeforeAssistant) {
        return res.status(400).json({ error: '当前会话没有可续写的用户-助手轮次' });
      }

      try {
        await runTurnContinue({
          mode,
          sessionId,
          ...streamIo(sessionId, res),
          activeStreams,
        });
      } catch (err) {
        if (err?.status) {
          log.warn(`${logNs}.bad_request ${formatMeta({ method: req.method, path: req.path, reason: err.message })}`);
          return res.status(err.status).json({ error: err.message });
        }
        throw err;
      }
    },

    recoverStream: (req, res) => {
      if (guardStreamEndpoints && !resolveSession(req, res)) return;
      const task = getRecoverableSessionStreamTask(req.params.sessionId);
      res.json({ task: task ? buildSessionStreamSnapshot(task) : null });
    },

    streamSnapshot: (req, res) => {
      if (guardStreamEndpoints && !resolveSession(req, res)) return;
      const { sessionId } = req.params;
      const task = getRecoverableSessionStreamTask(sessionId);
      if (!task) return res.status(404).json({ error: 'stream task not found' });
      attachSessionStreamSse(sessionId, task.id, res);
      writeSessionStreamSse(res, { type: 'stream_snapshot', task: buildSessionStreamSnapshot(task) });
    },

    /** 代拟玩家发言：借用本会话上下文，剥掉尾部 user 后让模型替玩家说一句 */
    impersonate: async (req, res) => {
      const { sessionId } = req.params;
      const session = resolveSession(req, res);
      if (!session) return;

      const { worldId, status, error } = mode.impersonate.resolveWorldId(req, session);
      if (!worldId) {
        if (status === 400) return badRequest(req, res, error);
        log.warn(`${logNs}.not_found ${formatMeta({ method: req.method, path: req.path, reason: error })}`);
        return res.status(status).json({ error });
      }

      const personaName = getOrCreatePersona(worldId)?.name || '用户';

      try {
        const { messages, overrides } = await buildTurnContext(
          mode.id,
          sessionId,
          mode.impersonate.promptOptions(),
        );

        const prompt = [...messages];
        while (prompt.length > 0 && prompt[prompt.length - 1].role === 'user') {
          prompt.pop();
        }
        prompt.push({ role: 'user', content: renderBackendPrompt('chat-impersonate.md', { PERSONA_NAME: personaName }) });

        log.info(
          `POST /impersonate  ${formatMeta({
            session: sessionId.slice(0, 8),
            worldId: worldId.slice(0, 8),
            msgs: prompt.length,
          })}`
        );

        const raw = await llm.complete(prompt, {
          temperature: overrides.temperature,
          maxTokens: mode.impersonate.maxTokens(overrides),
          model: overrides.model,
          cacheableSystem: overrides.cacheableSystem,
          // 只有显式传 thinking_level 才会覆盖配置；不传等于沿用该模式的 thinking_level
          ...(mode.impersonate.disableThinking ? { thinking_level: null } : {}),
          configScope: mode.llm.configScope,
          callType: mode.llm.callType.impersonate,
          conversationId: sessionId,
        });
        res.json({ content: stripThinkBlocksFromText(raw).trim() });
      } catch (err) {
        return unhandled(req, res, err);
      }
    },

    /** 编辑 AI 回复：改内容并按需重跑状态更新与轮次记录 */
    editAssistant: async (req, res) => {
      const { sessionId } = req.params;
      const { messageId, content } = req.body;

      if (!messageId || !content || typeof content !== 'string') {
        return badRequest(req, res, 'messageId and content are required');
      }
      if (!resolveSession(req, res)) return;

      const trimmedContent = content.trim();
      updateMessageContent(messageId, trimmedContent);
      await runHook('message:edited', { id: messageId, sessionId, content: trimmedContent });

      const allMessages = mode.session.getMessages(sessionId, ALL_MESSAGES_LIMIT, 0);
      const lastAssistant = [...allMessages].reverse().find((message) => message.role === 'assistant');
      if (lastAssistant?.id === messageId) {
        const { worldId, characterIds } = mode.resolveScope(sessionId);
        enqueue(sessionId, () => updateAllStates(worldId, characterIds, sessionId), 2, 'all-state')
          .catch((err) => log.warn('后台任务失败:', err.message));
      }

      enqueue(sessionId, () => createTurnRecord(sessionId, { isUpdate: true }), 3, 'turn-record')
        .catch((err) => log.warn('后台任务失败:', err.message));

      res.json({ success: true });
    },

    /** 手动重命名会话：与 postgen 的自动起名走同一条副模型路径 */
    retitle: async (req, res) => {
      const { sessionId } = req.params;
      if (!resolveSession(req, res)) return;

      try {
        await waitForQueueIdle(sessionId);
        const title = await generateTitle(sessionId);
        if (!title) return res.json({ title: null });
        res.json({ title });
      } catch (err) {
        return unhandled(req, res, err);
      }
    },
  };
}
