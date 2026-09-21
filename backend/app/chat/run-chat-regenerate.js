import { chatMode } from '../modes/chat-mode.js';
import { rollbackSession } from '../shared/rollback/rollback-session.js';
import { runChatStream } from './run-chat-stream.js';

export async function runChatRegenerate({
  sessionId,
  afterMessageId,
  emitSse,
  attachSse,
  activeStreams,
}) {
  const { stateRolledBack } = await rollbackSession(chatMode, sessionId, afterMessageId);
  return runChatStream({
    sessionId,
    emitSse,
    attachSse,
    activeStreams,
    stateRolledBack,
  });
}
