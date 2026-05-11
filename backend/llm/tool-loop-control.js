export class ToolLoopCancelledError extends Error {
  constructor(message = 'tool loop cancelled') {
    super(message);
    this.name = 'ToolLoopCancelledError';
  }
}

export function isToolLoopCancelledError(err) {
  return err instanceof ToolLoopCancelledError || err?.name === 'ToolLoopCancelledError';
}
