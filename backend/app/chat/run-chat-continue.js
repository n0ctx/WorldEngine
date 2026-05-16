import * as llm from '../../llm/index.js';
import { buildChatPostgenTasks } from './build-chat-postgen-tasks.js';
import { runPostGenFlow } from '../shared/postgen/run-postgen-flow.js';
import { runStreamLifecycle } from '../shared/stream/create-stream-runner.js';
import { finalizeStreamOutput } from '../shared/stream/finalize-stream-output.js';
import { createHttpError } from '../shared/http-error.js';
import { processStreamOutput, buildContext, makeSuggestionFallbackCallbacks } from '../../services/chat.js';
import { getConfig } from '../../services/config.js';
import { getCharacterById } from '../../services/characters.js';
import {
  getMessagesBySessionId,
  getSessionById,
  touchSession,
} from '../../services/sessions.js';
import {
  updateMessageContent,
  updateMessageNextOptions,
} from '../../db/queries/messages.js';
import { ALL_MESSAGES_LIMIT } from '../../utils/constants.js';
import { createLogger, formatMeta } from '../../utils/logger.js';
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

const log = createLogger('chat');

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

  return { messages, lastAssistant, lastUser };
}

export async function runChatContinue({ sessionId, emitSse: rawEmitSse, attachSse, activeStreams }) {
  const session = getSessionById(sessionId);
  const { messages: baseMessages, lastAssistant, lastUser } = resolveContinuationBase(sessionId);
  const originalContent = lastAssistant.content;

  log.info(`POST /continue  ${formatMeta({ session: sessionId.slice(0, 8) })}`);
  const task = createSessionStreamTask({
    sessionId,
    mode: 'chat',
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
      const { messages, overrides, suggestionText } = await buildContext(sessionId);
      const usePrefill = supportsPrefill(getConfig()?.llm?.provider);
      const continuationMessages = buildContinuationMessages(messages, originalContent, {
        suggestionText,
        usePrefill,
      });

      log.info(
        `CONTINUE PROMPT READY  ${formatMeta({
          session: sid,
          msgs: continuationMessages.length,
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
        callType: 'main_continue',
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
      const characterId = session.character_id;
      const character = characterId ? getCharacterById(characterId) : null;
      const worldId = character?.world_id ?? null;

      let mergedAssistant = null;
      let mergedContent = '';
      let continueOptions = [];

      if (fullContent) {
        const processed = await processStreamOutput(fullContent, aborted, worldId, sessionId, {
          mode: session.mode,
          suggestionEnabled: !!getConfig().suggestion_enabled,
          currentUserContent: lastUser?.content ?? '',
          configScope: 'aux',
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
        touchSession(sessionId);
      }

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
        const messages = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
        if (messages.some((message) => message.role === 'user')) {
          const taskSpecs = buildChatPostgenTasks({
            sessionId,
            worldId,
            characterId,
            session,
            turnRecordOpts: { isUpdate: true },
          });
          const { hasSseWaits } = await runPostGenFlow({
            sessionId,
            worldId,
            mode: 'chat',
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
