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
