import { runHook } from '../../../hooks/hook-registry.js';
import { runPostGenTasks } from '../../../utils/post-gen-runner.js';

export async function runPostGenFlow({
  sessionId,
  worldId,
  mode,
  taskSpecs,
  streamState,
  sid,
  emitSse,
  onAllSettled,
}) {
  await runHook('generation:post', { sessionId, worldId, taskSpecs, mode });
  return runPostGenTasks(sessionId, taskSpecs, {
    streamState,
    sid,
    emitSse,
    onAllSettled,
  });
}
