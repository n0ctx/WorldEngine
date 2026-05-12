import { awaitPendingStateUpdate } from '../../../utils/state-update-tracker.js';

export async function runStreamLifecycle({
  sessionId,
  activeStreams,
  emitSse,
  stateRolledBack = false,
  userMsgId = null,
  beforeStream,
  createStream,
  onError,
  onDone,
}) {
  const existing = activeStreams.get(sessionId);
  if (existing) existing.abort();

  const controller = new AbortController();
  activeStreams.set(sessionId, controller);
  const sid = sessionId.slice(0, 8);
  const streamState = {
    controller,
    clear() {
      if (activeStreams.get(sessionId) === controller) {
        activeStreams.delete(sessionId);
      }
    },
  };

  await awaitPendingStateUpdate(sessionId);

  if (stateRolledBack) {
    emitSse({ type: 'state_rolled_back' });
  }

  if (userMsgId) {
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
      emitSse({ delta: chunk });
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
      if (outcome?.stopLifecycle) {
        streamState.clear();
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
