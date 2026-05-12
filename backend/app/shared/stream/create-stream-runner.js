import { beginStreamSession, sendSse } from '../../../routes/stream-helpers.js';
import { awaitPendingStateUpdate } from '../../../utils/state-update-tracker.js';

export async function runStreamLifecycle({
  sessionId,
  res,
  activeStreams,
  emitSse,
  stateRolledBack = false,
  userMsgId = null,
  beforeStream,
  createStream,
  onError,
  onDone,
}) {
  const streamState = beginStreamSession(sessionId, res, activeStreams);
  const controller = streamState.controller;
  const sid = sessionId.slice(0, 8);

  await awaitPendingStateUpdate(sessionId);

  if (stateRolledBack && !streamState.isClientClosed()) {
    emitSse({ type: 'state_rolled_back' });
  }

  if (userMsgId && !streamState.isClientClosed()) {
    emitSse({ type: 'user_saved', id: userMsgId });
  }

  let fullContent = '';
  let aborted = false;
  let setup = {};

  try {
    setup = (await beforeStream?.({ sid, streamState, controller })) ?? {};
    const stream = await createStream({ sid, streamState, controller, setup });
    for await (const chunk of stream) {
      fullContent += chunk;
      if (!streamState.isClientClosed()) sendSse(res, { delta: chunk });
    }
  } catch (err) {
    if (err.name === 'AbortError' || controller.signal.aborted) {
      aborted = true;
    } else {
      const outcome = await onError?.({
        err,
        sid,
        setup,
        fullContent,
        streamState,
        controller,
      });
      if (outcome?.endResponse) {
        streamState.clear();
        if (!streamState.isClientClosed()) res.end();
        return outcome;
      }
    }
  }

  return onDone({
    sid,
    setup,
    fullContent,
    aborted,
    streamState,
    controller,
  });
}
