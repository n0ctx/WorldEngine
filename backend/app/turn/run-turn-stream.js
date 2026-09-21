import * as llm from '../../llm/index.js';
import { recordProviderSafetyEvent, toPublicProviderSafetySignal } from '../../services/provider-safety-events.js';
import { buildTurnPostgenTasks } from '../shared/postgen/build-turn-postgen-tasks.js';
import { runPostGenFlow } from '../shared/postgen/run-postgen-flow.js';
import { runStreamLifecycle } from '../shared/stream/create-stream-runner.js';
import { finalizeStreamOutput } from '../shared/stream/finalize-stream-output.js';
import { processStreamOutput, makeSuggestionFallbackCallbacks } from '../../services/chat.js';
import { buildTurnContext } from './build-turn-context.js';
import { getLastUserContent, makeStreamErrorHandler } from './turn-helpers.js';
import { ALL_MESSAGES_LIMIT } from '../../utils/constants.js';
import { formatMeta } from '../../utils/logger.js';
import {
  closeSessionStreamSse,
  completeSessionStreamTask,
  createSessionStreamTask,
} from '../../services/session-stream-task-store.js';

/**
 * 一轮新生成：装配上下文 → 流式产出 → 落库 → 触发副模型后处理。
 * 两种模式共用，差异全部来自 mode 描述符。
 */
export async function runTurnStream({
  mode,
  sessionId,
  emitSse: rawEmitSse,
  attachSse,
  activeStreams,
  userMsgId,
  userContent,
  diaryInjection,
  stateRolledBack = false,
}) {
  const log = mode.log;
  const startedAt = Date.now();
  const { session, worldId, characterIds } = mode.resolveScope(sessionId);

  log.info(
    `REQUEST START  ${formatMeta({
      session: sessionId.slice(0, 8),
      worldId: worldId?.slice(0, 8) ?? null,
      userMsgId: userMsgId?.slice(0, 8) ?? null,
    })}`
  );

  const task = createSessionStreamTask({
    sessionId,
    mode: mode.id,
    messages: mode.session.getMessages(sessionId, ALL_MESSAGES_LIMIT, 0),
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
      // memory_recall_done 由 assembler 内部经 onRecallEvent 推送，这里不再重复推一次
      const { messages, overrides, recallHitCount, activatedEntries } = await buildTurnContext(
        mode.id,
        sessionId,
        {
          onRecallEvent(name, payload) {
            emitSse({ type: name, ...payload });
          },
          diaryInjection,
        },
      );

      if (activatedEntries.length > 0) {
        emitSse({ type: 'entries_activated', entries: activatedEntries });
      }

      log.info(
        `CONTEXT DONE  ${formatMeta({
          session: sid,
          msgs: messages.length,
          recall: recallHitCount,
          model: overrides.model || '',
          temperature: overrides.temperature,
          maxTokens: overrides.maxTokens,
        })}`
      );

      return { messages, overrides, usageRef, activatedEntries };
    },

    createStream: ({ controller, setup }) =>
      llm.chat(setup.messages, {
        ...setup.overrides,
        signal: controller.signal,
        usageRef: setup.usageRef,
        configScope: mode.llm.configScope,
        callType: mode.llm.callType.stream,
        conversationId: sessionId,
        llmCallContext: { mode: mode.id, sessionId, internalRequestId: taskId, stream: true },
        onProviderSignal: (signal) => {
          const saved = recordProviderSafetyEvent(signal);
          if (saved) emitSse({ type: 'provider_safety_signal', signal: toPublicProviderSafetySignal(saved) });
        },
      }),

    onError: makeStreamErrorHandler({ log, label: 'STREAM ERROR', sessionId, taskId, emitSse }),

    onDone: async ({ sid, setup, fullContent, aborted, streamState }) => {
      const { savedContent, options, savedAssistant } = await processStreamOutput(
        fullContent,
        aborted,
        worldId,
        sessionId,
        {
          mode: mode.id,
          createMessageFn: mode.session.createMessage,
          touchSessionFn: mode.session.touch,
          suggestionEnabled: mode.suggestionEnabled(),
          currentUserContent: userContent ?? getLastUserContent(mode, sessionId),
          configScope: mode.auxScope,
          ...makeSuggestionFallbackCallbacks(emitSse),
        }
      );

      log.info(
        `STREAM END  ${formatMeta({
          session: sid,
          chars: fullContent.length,
          aborted,
          ms: Date.now() - startedAt,
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
        const messages = mode.session.getMessages(sessionId, ALL_MESSAGES_LIMIT, 0);
        if (messages.some((message) => message.role === 'user')) {
          const { hasSseWaits } = await runPostGenFlow({
            sessionId,
            worldId,
            mode: mode.id,
            taskSpecs: buildTurnPostgenTasks({
              mode,
              sessionId,
              worldId,
              characterIds,
              session,
              messages,
            }),
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
