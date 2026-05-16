import * as llm from '../../llm/index.js';
import { buildChatPostgenTasks } from './build-chat-postgen-tasks.js';
import { runPostGenFlow } from '../shared/postgen/run-postgen-flow.js';
import { runStreamLifecycle } from '../shared/stream/create-stream-runner.js';
import { finalizeStreamOutput } from '../shared/stream/finalize-stream-output.js';
import { processStreamOutput, buildContext, makeSuggestionFallbackCallbacks } from '../../services/chat.js';
import { getConfig } from '../../services/config.js';
import { getCharacterById } from '../../services/characters.js';
import { getMessagesBySessionId, getSessionById } from '../../services/sessions.js';
import { ALL_MESSAGES_LIMIT } from '../../utils/constants.js';
import { createLogger, formatMeta } from '../../utils/logger.js';
import {
  closeSessionStreamSse,
  completeSessionStreamTask,
  createSessionStreamTask,
  failSessionStreamTask,
} from '../../services/session-stream-task-store.js';

const log = createLogger('chat');

function getLastUserContent(sessionId) {
  const messages = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');
  return lastUser?.content ?? '';
}

export async function runChatStream({
  sessionId,
  emitSse: rawEmitSse,
  attachSse,
  activeStreams,
  userMsgId,
  userContent,
  diaryInjection,
  stateRolledBack = false,
}) {
  const startedAt = Date.now();

  log.info(
    `REQUEST START  ${formatMeta({
      session: sessionId.slice(0, 8),
      userMsgId: userMsgId?.slice(0, 8) ?? null,
    })}`
  );
  const task = createSessionStreamTask({
    sessionId,
    mode: 'chat',
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
      const { messages, overrides, recallHitCount, activatedEntries: entries } =
        await buildContext(sessionId, {
          onRecallEvent(name, payload) {
            emitSse({ type: name, ...payload });
          },
          diaryInjection,
        });

      const activatedEntries = entries ?? [];
      emitSse({ type: 'memory_recall_done', hit: recallHitCount });
      if (activatedEntries.length > 0) {
        emitSse({ type: 'entries_activated', entries: activatedEntries });
      }

      log.info(
        `CONTEXT DONE  ${formatMeta({
          session: sid,
          msgs: messages.length,
          recall: recallHitCount,
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
        callType: 'main_answer',
        conversationId: sessionId,
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
      log.info(
        `STREAM END  ${formatMeta({
          session: sid,
          chars: fullContent.length,
          aborted,
          ms: Date.now() - startedAt,
        })}`
      );

      const session = getSessionById(sessionId);
      const characterId = session?.character_id;
      const character = characterId ? getCharacterById(characterId) : null;
      const worldId = character?.world_id ?? null;

      const { savedContent, options, savedAssistant } = await processStreamOutput(
        fullContent,
        aborted,
        worldId,
        sessionId,
        {
          suggestionEnabled: !!getConfig().suggestion_enabled,
          currentUserContent: userContent ?? getLastUserContent(sessionId),
          configScope: 'aux',
          ...makeSuggestionFallbackCallbacks(emitSse),
        }
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
          const taskSpecs = buildChatPostgenTasks({
            sessionId,
            worldId,
            characterId,
            session,
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
