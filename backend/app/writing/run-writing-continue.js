import * as llm from '../../llm/index.js';
import { buildWritingPostgenTasks } from './build-writing-postgen-tasks.js';
import { runPostGenFlow } from '../shared/postgen/run-postgen-flow.js';
import { runStreamLifecycle } from '../shared/stream/create-stream-runner.js';
import { finalizeStreamOutput } from '../shared/stream/finalize-stream-output.js';
import { createHttpError } from '../shared/http-error.js';
import { buildWritingPrompt } from '../../prompts/assembler.js';
import { getConfig, getWritingLlmConfig } from '../../services/config.js';
import { processStreamOutput, makeSuggestionFallbackCallbacks } from '../../services/chat.js';
import {
  getMessagesBySessionId,
  getWritingSessionById,
  touchWritingSession,
} from '../../services/writing-sessions.js';
import {
  updateMessageContent,
  updateMessageNextOptions,
} from '../../db/queries/messages.js';
import { ALL_MESSAGES_LIMIT } from '../../utils/constants.js';
import { createLogger, formatMeta, logPrompt } from '../../utils/logger.js';
import {
  closeSessionStreamSse,
  completeSessionStreamTask,
  createSessionStreamTask,
  failSessionStreamTask,
} from '../../services/session-stream-task-store.js';
import {
  buildContinuationMessages,
  supportsPrefill,
} from '../../routes/stream-helpers.js';

const log = createLogger('writing');

function resolveContinuationBase(sessionId) {
  const messages = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const lastAssistantIndex = messages.map((message) => message.role).lastIndexOf('assistant');
  const lastAssistant = lastAssistantIndex >= 0 ? messages[lastAssistantIndex] : null;
  if (!lastAssistant) {
    throw createHttpError(400, '当前会话没有 AI 回复可续写');
  }

  const hasUserBeforeAssistant = messages
    .slice(0, lastAssistantIndex)
    .some((message) => message.role === 'user');
  if (!hasUserBeforeAssistant) {
    throw createHttpError(400, '当前会话没有可续写的用户-助手轮次');
  }

  const lastUser = [...messages.slice(0, lastAssistantIndex)]
    .reverse()
    .find((message) => message.role === 'user');

  return { lastAssistant, lastUser };
}

export async function runWritingContinue({ sessionId, emitSse: rawEmitSse, attachSse, activeStreams }) {
  const session = getWritingSessionById(sessionId);
  const worldId = session.world_id;
  const { lastAssistant, lastUser } = resolveContinuationBase(sessionId);
  const originalContent = lastAssistant.content;

  log.info(
    `POST /continue  ${formatMeta({
      session: sessionId.slice(0, 8),
      worldId: worldId?.slice(0, 8) ?? null,
    })}`
  );
  const task = createSessionStreamTask({
    sessionId,
    mode: 'writing',
    messages: getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0),
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
      const {
        messages,
        temperature,
        maxTokens,
        model,
        cacheableSystem,
        suggestionText,
      } = await buildWritingPrompt(sessionId);

      log.info(
        `CONTINUE PROMPT READY  ${formatMeta({
          session: sid,
          msgs: messages.length,
          model: model || '',
          temperature,
          maxTokens,
        })}`
      );
      logPrompt(sessionId, messages);

      const usePrefill = supportsPrefill(getWritingLlmConfig()?.provider);
      const continuationMessages = buildContinuationMessages(messages, originalContent, {
        suggestionText,
        usePrefill,
      });

      return {
        continuationMessages,
        temperature,
        maxTokens,
        model,
        cacheableSystem,
        usageRef,
      };
    },
    createStream: ({ controller, setup }) =>
      llm.chat(setup.continuationMessages, {
        temperature: setup.temperature,
        maxTokens: setup.maxTokens,
        model: setup.model,
        cacheableSystem: setup.cacheableSystem,
        signal: controller.signal,
        usageRef: setup.usageRef,
        configScope: 'writing',
        callType: 'writing_continue',
        conversationId: sessionId,
      }),
    onError: async ({ err, sid, fullContent, streamState }) => {
      log.error(`CONTINUE ERROR  ${formatMeta({ session: sid, error: err.message })}`);
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
      let mergedAssistant = null;
      let mergedContent = '';
      let continueOptions = [];

      if (fullContent) {
        const processed = await processStreamOutput(fullContent, aborted, worldId, sessionId, {
          mode: 'writing',
          suggestionEnabled: !!getConfig().writing?.suggestion_enabled,
          currentUserContent: lastUser?.content ?? '',
          configScope: 'writing-aux',
          ...makeSuggestionFallbackCallbacks(emitSse),
          createMessageFn: () => null,
          touchSessionFn: () => {},
        });

        continueOptions = processed.options;
        mergedContent =
          originalContent + '\n\n' + processed.savedContent.replace(/^\n+/, '');
        updateMessageContent(lastAssistant.id, mergedContent);
        if (!aborted) {
          updateMessageNextOptions(lastAssistant.id, continueOptions);
        }

        mergedAssistant = { ...lastAssistant, content: mergedContent };
        if (!aborted) {
          mergedAssistant.next_options =
            continueOptions.length > 0 ? continueOptions : null;
        }
        touchWritingSession(sessionId);
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
        const taskSpecs = buildWritingPostgenTasks({
          sessionId,
          worldId,
          session,
          turnRecordOpts: { isUpdate: true },
          includeSessionTitle: false,
          includeChapterTitle: false,
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

      if (aborted) {
        setTimeout(() => closeSessionStreamSse(sessionId, taskId), 0);
        return;
      }
      completeSessionStreamTask(sessionId, taskId);
      closeSessionStreamSse(sessionId, taskId);
    },
  });
}
