import { getClientLogger, formatMeta } from '../utils/logger.js';

const ALLOWED_LEVELS = new Set(['debug', 'info', 'warn', 'error']);

export function ingestClientLogs(body) {
  const { client = {}, logs = [] } = body || {};
  const log = getClientLogger();
  let accepted = 0;
  let dropped = 0;

  for (const entry of logs) {
    if (!entry || !ALLOWED_LEVELS.has(entry.level) || !entry.event) {
      dropped += 1;
      continue;
    }
    const meta = formatMeta({
      page: client.page,
      ua: client.ua,
      feSession: client.session,
      ts: entry.ts,
      ...(entry.payload && typeof entry.payload === 'object' ? entry.payload : {}),
    });
    log[entry.level](`${entry.event} ${meta}`);
    accepted += 1;
  }
  return { accepted, dropped };
}
