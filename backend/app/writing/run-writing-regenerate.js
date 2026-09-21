import { writingMode } from '../modes/writing-mode.js';
import { rollbackSession } from '../shared/rollback/rollback-session.js';
import { runWritingStream } from './run-writing-stream.js';

export async function runWritingRegenerate({
  sessionId,
  afterMessageId,
  emitSse,
  attachSse,
  activeStreams,
}) {
  const { stateRolledBack } = await rollbackSession(writingMode, sessionId, afterMessageId);
  return runWritingStream({
    sessionId,
    emitSse,
    attachSse,
    activeStreams,
    stateRolledBack,
  });
}
