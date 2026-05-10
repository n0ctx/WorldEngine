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
