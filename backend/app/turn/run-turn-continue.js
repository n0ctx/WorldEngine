import * as llm from '../../llm/index.js';
import { recordProviderSafetyEvent, toPublicProviderSafetySignal } from '../../services/provider-safety-events.js';
import { buildTurnPostgenTasks } from '../shared/postgen/build-turn-postgen-tasks.js';
import { runPostGenFlow } from '../shared/postgen/run-postgen-flow.js';
import { runStreamLifecycle } from '../shared/stream/create-stream-runner.js';
import { finalizeStreamOutput } from '../shared/stream/finalize-stream-output.js';
import { processStreamOutput, makeSuggestionFallbackCallbacks } from '../../services/chat.js';
import { updateMessageContent, updateMessageNextOptions } from '../../db/queries/messages.js';
import { buildContinuationMessages, supportsPrefill } from '../../routes/stream-helpers.js';
import { buildTurnContext } from './build-turn-context.js';
import { makeStreamErrorHandler, resolveContinuationBase } from './turn-helpers.js';
import { ALL_MESSAGES_LIMIT } from '../../utils/constants.js';
import { formatMeta } from '../../utils/logger.js';
import {
  closeSessionStreamSse,
  completeSessionStreamTask,
  createSessionStreamTask,
} from '../../services/session-stream-task-store.js';

/**
 * 续写：不新建 assistant 消息，把新产出拼到最后一条 assistant 之后。
 * 两种模式共用，差异全部来自 mode 描述符。
 */
export async function runTurnContinue({ mode, sessionId, emitSse: rawEmitSse, attachSse, activeStreams }) {
  const log = mode.log;
  const { session, worldId, characterIds } = mode.resolveScope(sessionId);
  const { messages: baseMessages, lastAssistant, lastUser } = resolveContinuationBase(mode, sessionId);
  const originalContent = lastAssistant.content;

  log.info(`POST /continue  ${formatMeta({ session: sessionId.slice(0, 8) })}`);

  const task = createSessionStreamTask({
    sessionId,
    mode: mode.id,
    messages: baseMessages,
    continuingMessageId: lastAssistant.id,
  });
  attachSse?.(task);
  const taskId = task.id;
  const emitSse = (payload, opts) => rawEmitSse(payload, { ...opts, taskId });

  return runStreamLifecycle({
    sessionId,
    activeStreams,
    emitSse,

    beforeStream: async ({ sid }) => {
      const usageRef = {};
      const { messages, overrides, suggestionText } = await buildTurnContext(mode.id, sessionId, {
        continuation: true,
      });
      const usePrefill = supportsPrefill(mode.llm.prefillProvider());
      const continuationMessages = buildContinuationMessages(messages, originalContent, {
        suggestionText,
        usePrefill,
      });

      log.info(
        `CONTINUE PROMPT READY  ${formatMeta({
          session: sid,
          msgs: continuationMessages.length,
          model: overrides.model || '',
          temperature: overrides.temperature,
          maxTokens: overrides.maxTokens,
        })}`
      );

      return { continuationMessages, overrides, usageRef };
    },

    createStream: ({ controller, setup }) =>
      llm.chat(setup.continuationMessages, {
        ...setup.overrides,
        signal: controller.signal,
        usageRef: setup.usageRef,
        configScope: mode.llm.configScope,
        callType: mode.llm.callType.continue,
        conversationId: sessionId,
        llmCallContext: { mode: mode.id, sessionId, internalRequestId: taskId, stream: true },
        onProviderSignal: (signal) => {
          const saved = recordProviderSafetyEvent(signal);
          if (saved) emitSse({ type: 'provider_safety_signal', signal: toPublicProviderSafetySignal(saved) });
        },
      }),

    onError: makeStreamErrorHandler({ log, label: 'CONTINUE ERROR', sessionId, taskId, emitSse }),

    onDone: async ({ sid, setup, fullContent, aborted, streamState }) => {
      let mergedAssistant = null;
      let mergedContent = '';
      let continueOptions = [];

      if (fullContent) {
        const processed = await processStreamOutput(fullContent, aborted, worldId, sessionId, {
          mode: mode.id,
          suggestionEnabled: mode.suggestionEnabled(),
          currentUserContent: lastUser?.content ?? '',
          configScope: mode.auxScope,
          ...makeSuggestionFallbackCallbacks(emitSse),
          // 续写不新建消息，只把产出拼回原 assistant
          createMessageFn: () => null,
          touchSessionFn: () => {},
        });

        continueOptions = processed.options;
        mergedContent = originalContent + '\n\n' + processed.savedContent.replace(/^\n+/, '');
        updateMessageContent(lastAssistant.id, mergedContent);
        if (!aborted) {
          updateMessageNextOptions(lastAssistant.id, continueOptions);
        }

        mergedAssistant = { ...lastAssistant, content: mergedContent };
        if (!aborted) {
          mergedAssistant.next_options = continueOptions.length > 0 ? continueOptions : null;
        }
        mode.session.touch(sessionId);
      }

      log.info(
        `CONTINUE END  ${formatMeta({
          session: sid,
          chars: mergedContent.length || fullContent.length,
          aborted,
        })}`
      );

      finalizeStreamOutput({
        assistant: mergedAssistant,
        aborted,
        options: continueOptions,
        usageRef: setup.usageRef,
        emitSse,
        streamState,
      });

      streamState.clear();

      if (!aborted && mergedContent) {
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
              turnRecordOpts: { isUpdate: true },
              includeSessionTitle: false,
              includeChapterTitle: false,
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
