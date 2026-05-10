import crypto from 'node:crypto';
import { runWithContext } from '../utils/request-context.js';

export function requestIdMiddleware(req, res, next) {
  const requestId = crypto.randomUUID().slice(0, 8);
  res.setHeader('x-request-id', requestId);
  runWithContext({ requestId }, () => next());
}
