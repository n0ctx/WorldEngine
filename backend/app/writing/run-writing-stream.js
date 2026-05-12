import * as llm from '../../llm/index.js';
import { buildWritingPostgenTasks } from './build-writing-postgen-tasks.js';
import { runPostGenFlow } from '../shared/postgen/run-postgen-flow.js';
import { runStreamLifecycle } from '../shared/stream/create-stream-runner.js';
import { finalizeStreamOutput } from '../shared/stream/finalize-stream-output.js';
import { buildWritingPrompt } from '../../prompts/assembler.js';
import { getConfig } from '../../services/config.js';
import {
  activeStreams as _unused,
  processStreamOutput,
} from '../../services/chat.js';
import {
  createMessage,
  getMessagesBySessionId,
  getWritingSessionById,
  touchWritingSession,
} from '../../services/writing-sessions.js';
import { ALL_MESSAGES_LIMIT } from '../../utils/constants.js';
import { createLogger, formatMeta, logPrompt } from '../../utils/logger.js';

const log = createLogger('writing');

function getLastUserContent(sessionId) {
  const messages = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');
  return lastUser?.content ?? '';
}

export async function runWritingStream({
  sessionId,
  res,
  emitSse,
  activeStreams,
  userMsgId,
  userContent,
  diaryInjection,
  stateRolledBack = false,
}) {
  const session = getWritingSessionById(sessionId);
  const worldId = session?.world_id;

  log.info(
    `REQUEST START  ${formatMeta({
      session: sessionId.slice(0, 8),
      worldId: worldId?.slice(0, 8) ?? null,
    })}`
  );

  return runStreamLifecycle({
    sessionId,
    res,
    activeStreams,
    emitSse,
    stateRolledBack,
    userMsgId,
    beforeStream: async ({ sid, streamState }) => {
      const usageRef = {};
      let activatedEntries = [];

      if (!streamState.isClientClosed()) emitSse({ type: 'memory_recall_start' });
      const onRecallEvent = (name, payload) => {
        if (!streamState.isClientClosed()) emitSse({ type: name, ...payload });
      };
      const {
        messages,
        temperature,
        maxTokens,
        model,
        cacheableSystem,
        activatedEntries: entries,
      } = await buildWritingPrompt(sessionId, { onRecallEvent, diaryInjection });

      activatedEntries = entries ?? [];
      log.info(
        `PROMPT READY  ${formatMeta({
          session: sid,
          msgs: messages.length,
          model: model || '',
          temperature,
          maxTokens,
        })}`
      );
      logPrompt(sessionId, messages);
      if (activatedEntries.length > 0 && !streamState.isClientClosed()) {
        emitSse({ type: 'entries_activated', entries: activatedEntries });
      }

      return {
        messages,
        temperature,
        maxTokens,
        model,
        cacheableSystem,
        usageRef,
        activatedEntries,
      };
    },
    createStream: ({ controller, setup }) =>
      llm.chat(setup.messages, {
        temperature: setup.temperature,
        maxTokens: setup.maxTokens,
        model: setup.model,
        cacheableSystem: setup.cacheableSystem,
        signal: controller.signal,
        usageRef: setup.usageRef,
        configScope: 'writing',
        callType: 'writing_main',
        conversationId: sessionId,
      }),
    onError: async ({ err, sid, fullContent, streamState }) => {
      log.error(`STREAM ERROR  ${formatMeta({ session: sid, error: err.message })}`);
      if (!streamState.isClientClosed()) emitSse({ type: 'error', error: err.message });
      return fullContent ? null : { endResponse: true };
    },
    onDone: async ({ sid, setup, fullContent, aborted, streamState }) => {
      const { savedContent, options, savedAssistant } = await processStreamOutput(
        fullContent,
        aborted,
        worldId,
        sessionId,
        {
          mode: 'writing',
          createMessageFn: createMessage,
          touchSessionFn: touchWritingSession,
          suggestionEnabled: !!getConfig().writing?.suggestion_enabled,
          currentUserContent: userContent ?? getLastUserContent(sessionId),
          configScope: 'writing-aux',
          onSuggestionFallback() {
            if (!streamState.isClientClosed()) {
              emitSse({ type: 'suggestion_fallback_started' });
            }
          },
          onSuggestionFallbackSucceeded() {
            if (!streamState.isClientClosed()) {
              emitSse({ type: 'suggestion_fallback_succeeded' });
            }
          },
          onSuggestionFallbackFailed() {
            if (!streamState.isClientClosed()) {
              emitSse({ type: 'suggestion_fallback_failed' });
            }
          },
        }
      );

      log.info(
        `STREAM END  ${formatMeta({
          session: sid,
          chars: savedContent.length,
          aborted,
        })}`
      );

      finalizeStreamOutput({
        assistant: savedAssistant,
        aborted,
        options,
        usageRef: setup.usageRef,
        activatedEntries: setup.activatedEntries,
        emitSse,
        streamState,
      });

      streamState.clear();

      if (!aborted && savedContent) {
        const messages = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
        if (messages.some((message) => message.role === 'user')) {
          const taskSpecs = buildWritingPostgenTasks({
            sessionId,
            worldId,
            session,
            messages,
          });
          const { hasSseWaits } = await runPostGenFlow({
            sessionId,
            worldId,
            mode: 'writing',
            taskSpecs,
            res,
            streamState,
            sid,
            emitSse,
          });
          if (hasSseWaits) return;
        }
      }

      if (!streamState.isClientClosed()) res.end();
    },
  });
}
