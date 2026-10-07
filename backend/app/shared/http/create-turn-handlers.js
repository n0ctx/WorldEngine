import * as llm from '../../../llm/index.js';
import { activeStreams, saveAttachments } from '../../../services/chat.js';
import { getOrCreatePersona } from '../../../services/personas.js';
import { updateMessageContent } from '../../../db/queries/messages.js';
import { getMessageById } from '../../../services/sessions.js';
import { generateTitle } from '../../../memory/summarizer.js';
import { waitForQueueIdle } from '../../../utils/async-queue.js';
import { runPostGenTasks } from '../../../utils/post-gen-runner.js';
import { ALL_MESSAGES_LIMIT } from '../../../utils/constants.js';
import { formatMeta } from '../../../utils/logger.js';
import { stripThinkBlocksFromText } from '../../../utils/turn-dialogue.js';
import { renderBackendPrompt } from '../../../prompts/prompt-loader.js';
import { runHook } from '../../../hooks/hook-registry.js';
import { buildTurnContext } from '../../turn/build-turn-context.js';
import { runTurnContinue } from '../../turn/run-turn-continue.js';
import { runTurnRegenerate } from '../../turn/run-turn-regenerate.js';
import { runTurnStream } from '../../turn/run-turn-stream.js';
import { buildTurnPostgenTasks } from '../postgen/build-turn-postgen-tasks.js';
import { rollbackSession } from '../rollback/rollback-session.js';
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

  const streamHandlers = createStreamHandlers({
    mode,
    resolveSession,
    emitSse,
    logNs,
    log,
    badRequest,
    guardStreamEndpoints,
  });

  return {
    ...streamHandlers,

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
        const { messages, overrides, turnContext } = await buildTurnContext(
          mode.id,
          sessionId,
          mode.impersonate.promptOptions(),
        );

        // 剥掉尾部连续的 user 消息，只留到最后一条非 user 消息为止；本轮上下文随尾部 user 一起被剥掉，补回指令前
        const lastNonUserIndex = messages.findLastIndex((message) => message.role !== 'user');
        const prompt = messages.slice(0, lastNonUserIndex + 1);
        const instruction = renderBackendPrompt('chat-impersonate.md', { PERSONA_NAME: personaName });
        prompt.push({ role: 'user', content: [turnContext, instruction].filter(Boolean).join('\n\n') });

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
          configScope: mode.llm.configScope,
          callType: mode.llm.callType.impersonate,
          conversationId: sessionId,
        });
        res.json({ content: stripThinkBlocksFromText(raw).trim() });
      } catch (err) {
        return unhandled(req, res, err);
      }
    },

    /** 编辑 AI 回复：只允许原地编辑最后一条消息（必须是 assistant），按需重做最后一轮 */
    editAssistant: createEditAssistantHandler({ mode, resolveSession, badRequest, log, logNs }),

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

/** 编辑最后一条 AI 回复：目标不是会话最后一条 assistant 消息时拒绝，否则重做最后一轮。 */
function createEditAssistantHandler({ mode, resolveSession, badRequest, log, logNs }) {
  return async (req, res) => {
    const { sessionId } = req.params;
    const { messageId, content } = req.body;

    if (!messageId || !content || typeof content !== 'string') {
      return badRequest(req, res, 'messageId and content are required');
    }
    if (!resolveSession(req, res)) return;

    const allMessages = mode.session.getMessages(sessionId, ALL_MESSAGES_LIMIT, 0);
    const lastMessage = allMessages.at(-1);
    // 目标必须是会话最后一条消息且为 assistant；末尾是失败残留的 user 消息时同样拒绝
    if (lastMessage?.id !== messageId || lastMessage?.role !== 'assistant') {
      log.warn(`${logNs}.edit_not_last ${formatMeta({ session: sessionId.slice(0, 8), messageId: messageId.slice(0, 8) })}`);
      return res.status(409).json({ error: 'only the last assistant message can be edited' });
    }

    const trimmedContent = content.trim();
    updateMessageContent(messageId, trimmedContent);
    await runHook('message:edited', { id: messageId, sessionId, content: trimmedContent });

    // 开场白（会话里还没有任何 user 消息）不构成一轮，只改内容
    if (!allMessages.some((message) => message.role === 'user')) {
      return res.json({ success: true });
    }

    const { worldId, characterIds, session } = mode.resolveScope(sessionId);
    await rollbackSession(mode, sessionId, {}, { redoLatestRound: true });
    runPostGenTasks(
      sessionId,
      buildTurnPostgenTasks({
        mode,
        sessionId,
        worldId,
        characterIds,
        session,
        messages: allMessages,
        turnRecordOpts: { isUpdate: true },
        includeSessionTitle: false,
        includeChapterTitle: false,
      }),
      { sid: sessionId.slice(0, 8), emitSse: () => {} },
    );

    res.json({ success: true });
  };
}

function createContinueTurnHandler({ mode, resolveSession, logNs, log, streamIo }) {
  return async (req, res) => {
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
  };
}

/** SSE 生成、续写及断线恢复端点共享的 handler。 */
function createStreamHandlers({ mode, resolveSession, emitSse, logNs, log, badRequest, guardStreamEndpoints }) {
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
        diaryInjection: typeof diaryInjection === 'string' ? diaryInjection : undefined,
      });
    },

    stop: (req, res) => {
      const { sessionId } = req.params;
      if (!resolveSession(req, res)) return;
      const controller = activeStreams.get(sessionId);
      if (controller) controller.abort();
      // active=false：后端已无该会话的活动流（如服务重启后 dev 代理连接悬挂），前端需自行断开收尾
      res.json({ success: true, active: !!controller });
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

    continueTurn: createContinueTurnHandler({ mode, resolveSession, logNs, log, streamIo }),

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
  };
}
