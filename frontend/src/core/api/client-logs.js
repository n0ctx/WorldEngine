/**
 * client-logs.js — 前端日志上报传输层
 *
 * 把 logger.js 里对 /api/client-logs 的直接网络访问收口到 core/api 层（跨层约束：
 * 前端 fetch 只能经 core/api）。
 *
 * 重要：本模块**不得 import logger**，失败只用 console，避免与 logger 形成循环依赖
 * （logger -> 上报失败 -> logger.error -> 再次上报 ...）。这里不走通用 request.js，
 * 因为日志上报需要 keepalive / sendBeacon 语义，且必须静默失败。
 */

const ENDPOINT = '/api/client-logs';

/**
 * 通过 sendBeacon 同步发送（页面隐藏 / 卸载场景）。
 * @returns {boolean} 是否成功入队
 */
export function sendClientLogsBeacon(body) {
  if (typeof navigator === 'undefined' || !navigator.sendBeacon) return false;
  try {
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
    return navigator.sendBeacon(ENDPOINT, blob);
  } catch {
    return false;
  }
}

/**
 * 通过 fetch 异步发送。失败时 reject，由调用方负责重试缓存；本模块只 console，不回调 logger。
 */
export async function postClientLogs(body) {
  await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  });
}
