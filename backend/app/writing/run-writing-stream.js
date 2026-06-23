import * as llm from '../../llm/index.js';
import { recordProviderSafetyEvent, toPublicProviderSafetySignal } from '../../services/provider-safety-events.js';
import { buildWritingPostgenTasks } from './build-writing-postgen-tasks.js';
import { runPostGenFlow } from '../shared/postgen/run-postgen-flow.js';
import { runStreamLifecycle } from '../shared/stream/create-stream-runner.js';
import { finalizeStreamOutput } from '../shared/stream/finalize-stream-output.js';
import { buildWritingPrompt } from '../../prompts/assembler.js';
import { getConfig } from '../../services/config.js';
import {
  activeStreams as _unused,
  processStreamOutput,
  makeSuggestionFallbackCallbacks,
} from '../../services/chat.js';
import {
  createMessage,
  getMessagesBySessionId,
  getWritingSessionById,
  touchWritingSession,
} from '../../services/writing-sessions.js';
import { ALL_MESSAGES_LIMIT } from '../../utils/constants.js';
import { createLogger, formatMeta, logPrompt } from '../../utils/logger.js';
import {
  closeSessionStreamSse,
  completeSessionStreamTask,
  createSessionStreamTask,
  failSessionStreamTask,
} from '../../services/session-stream-task-store.js';

const log = createLogger('writing');

function getLastUserContent(sessionId) {
  const messages = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');
  return lastUser?.content ?? '';
}

export async function runWritingStream({
  sessionId,
  emitSse: rawEmitSse,
  attachSse,
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
  const task = createSessionStreamTask({
    sessionId,
    mode: 'writing',
    messages: getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0),
  });
  attachSse?.(task);
  const taskId = task.id;
  const emitSse = (payload, opts) => rawEmitSse(payload, { ...opts, taskId });

  return runStreamLifecycle({
    sessionId,
    activeStreams,
    emitSse,
    stateRolledBack,
    userMsgId,
    beforeStream: async ({ sid }) => {
      const usageRef = {};

      emitSse({ type: 'memory_recall_start' });
      const onRecallEvent = (name, payload) => {
        emitSse({ type: name, ...payload });
      };
      const {
        messages,
        temperature,
        maxTokens,
        model,
        cacheableSystem,
        activatedEntries: entries,
      } = await buildWritingPrompt(sessionId, { onRecallEvent, diaryInjection });

      const activatedEntries = entries ?? [];
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
      if (activatedEntries.length > 0) {
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
        llmCallContext: { mode: 'writing', sessionId, internalRequestId: taskId, stream: true },
        onProviderSignal: (signal) => {
          const saved = recordProviderSafetyEvent(signal);
          if (saved) emitSse({ type: 'provider_safety_signal', signal: toPublicProviderSafetySignal(saved) });
        },
      }),
    onError: async ({ err, sid, fullContent, streamState }) => {
      log.error(`STREAM ERROR  ${formatMeta({ session: sid, error: err.message })}`);
      emitSse({ type: 'error', error: err.message });
      if (!fullContent) {
        streamState.clear();
        failSessionStreamTask(sessionId, err.message, taskId);
        closeSessionStreamSse(sessionId, taskId);
        return { stopLifecycle: true };
      }
      return null;
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
          ...makeSuggestionFallbackCallbacks(emitSse),
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
            streamState,
            sid,
            emitSse,
            onAllSettled() {
              completeSessionStreamTask(sessionId, taskId);
              closeSessionStreamSse(sessionId, taskId);
            },
          });
          if (hasSseWaits) return;
        }
      }

      if (aborted) {
        setTimeout(() => closeSessionStreamSse(sessionId, taskId), 0);
        return;
      }
      completeSessionStreamTask(sessionId, taskId);
      closeSessionStreamSse(sessionId, taskId);
    },
  });
}
