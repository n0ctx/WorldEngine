import { rollbackChatSession } from '../shared/rollback/rollback-chat-session.js';
import { runChatStream } from './run-chat-stream.js';

export async function runChatRegenerate({
  sessionId,
  afterMessageId,
  res,
  emitSse,
  activeStreams,
}) {
  const { stateRolledBack } = await rollbackChatSession(sessionId, afterMessageId);
  return runChatStream({
    sessionId,
    res,
    emitSse,
    activeStreams,
    stateRolledBack,
  });
}
