import { rollbackWritingSession } from '../shared/rollback/rollback-writing-session.js';
import { runWritingStream } from './run-writing-stream.js';

export async function runWritingRegenerate({
  sessionId,
  afterMessageId,
  res,
  emitSse,
  activeStreams,
}) {
  const { stateRolledBack } = await rollbackWritingSession(sessionId, afterMessageId);
  return runWritingStream({
    sessionId,
    res,
    emitSse,
    activeStreams,
    stateRolledBack,
  });
}
