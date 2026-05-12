import { runHook } from '../../../hooks/hook-registry.js';
import { runPostGenTasks } from '../../../utils/post-gen-runner.js';

export async function runPostGenFlow({
  sessionId,
  worldId,
  mode,
  taskSpecs,
  res,
  streamState,
  sid,
  emitSse,
}) {
  await runHook('generation:post', { sessionId, worldId, taskSpecs, mode });
  return runPostGenTasks(sessionId, taskSpecs, {
    res,
    streamState,
    sid,
    emitSse,
  });
}
