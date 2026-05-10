import { AsyncLocalStorage } from 'node:async_hooks';

const _als = new AsyncLocalStorage();

export function runWithContext(ctx, fn) {
  return _als.run(ctx, fn);
}

export function getRequestId() {
  return _als.getStore()?.requestId;
}

export function getContext() {
  return _als.getStore() ?? {};
}
