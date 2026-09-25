import { rollbackSession } from '../shared/rollback/rollback-session.js';
import { runTurnStream } from './run-turn-stream.js';

/** 重生成：先回滚到目标用户消息之后，再按新一轮生成走完整管线 */
export async function runTurnRegenerate({
  mode,
  sessionId,
  afterMessageId,
  emitSse,
  attachSse,
  activeStreams,
}) {
  const { stateRolledBack } = await rollbackSession(
    mode,
    sessionId,
    () => mode.session.deleteMessagesAfter(afterMessageId),
  );
  return runTurnStream({
    mode,
    sessionId,
    emitSse,
    attachSse,
    activeStreams,
    stateRolledBack,
  });
}
