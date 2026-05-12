import {
  updateMessageActivatedEntries,
  updateMessageTokenUsage,
} from '../../../db/queries/messages.js';

export function finalizeStreamOutput({
  assistant,
  aborted,
  options = [],
  usageRef = {},
  activatedEntries = [],
  emitSse,
  streamState,
}) {
  if (!aborted && assistant && Object.keys(usageRef).length > 0) {
    updateMessageTokenUsage(assistant.id, usageRef);
    assistant.token_usage = usageRef;
  }

  if (!aborted && assistant && activatedEntries.length > 0) {
    updateMessageActivatedEntries(assistant.id, activatedEntries);
    assistant.activated_entries = activatedEntries;
  }

  if (!streamState.isClientClosed()) {
    emitSse(
      aborted
        ? { aborted: true, assistant }
        : {
            done: true,
            assistant,
            options,
            usage: Object.keys(usageRef).length > 0 ? usageRef : undefined,
          }
    );
  }

  return assistant;
}
