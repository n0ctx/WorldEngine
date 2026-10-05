import { createLogger, formatMeta } from './logger.js';

const log = createLogger('routes', 'cyan');

/**
 * assertExists — 统一 404 检查工具
 * 返回 false 表示已响应 404，调用方应立即 return。
 * 所有经此函数的 404 会自动产生 log.warn（method/path/reason）。
 */
export function assertExists(res, resource, message = '资源不存在') {
  if (!resource) {
    const req = res.req;
    log.warn(`routes.not_found ${formatMeta({
      method: req?.method,
      path: req?.originalUrl || req?.path,
      reason: message,
    })}`);
    res.status(404).json({ error: message });
    return false;
  }
  return true;
}

/**
 * sendValidationError — 把 service 抛出的校验错误转成响应
 * 错误信息等于 notFoundMessage 时回 404，否则回 400；日志写到调用方的 logger，事件名以 ns 为前缀。
 */
export function sendValidationError(res, err, { log: routeLog, ns, notFoundMessage, id }) {
  const req = res.req;
  if (err.message === notFoundMessage) {
    routeLog.warn(`${ns}.not_found ${formatMeta({ method: req.method, path: req.path, id })}`);
    return res.status(404).json({ error: err.message });
  }
  routeLog.warn(`${ns}.bad_request ${formatMeta({ method: req.method, path: req.path, reason: err.message })}`);
  return res.status(400).json({ error: err.message });
}

const ENTITY_CARD_ERROR_STATUS = { ENTITY_NOT_FOUND: 404, SESSION_NOT_FOUND: 404, SESSION_WORLD_MISMATCH: 400 };

/**
 * sendEntityCardError — 状态记忆实体存为卡片（角色卡 / 玩家卡）失败时的响应
 * 实体或会话不存在回 404，会话不属于该世界或缺参数回 400，其余回 500。
 */
export function sendEntityCardError(res, err, { log: routeLog, ns }) {
  const req = res.req;
  const status = ENTITY_CARD_ERROR_STATUS[err?.code] ?? (/required/i.test(err?.message ?? '') ? 400 : 500);
  if (status === 500) {
    routeLog.error(`${ns}.unhandled ${formatMeta({ method: req.method, path: req.path, msg: err?.message })}`);
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
  const event = status === 404 ? 'not_found' : 'bad_request';
  routeLog.warn(`${ns}.${event} ${formatMeta({ method: req.method, path: req.path, reason: err.message, code: err.code })}`);
  return res.status(status).json({ error: err.message });
}
