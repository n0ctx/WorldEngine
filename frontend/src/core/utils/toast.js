/**
 * 内部出口：仅供 utils/logger.js 调用。
 * 组件请使用 utils/logger.js 的 log.{level}(...)。
 * 直接 import 本文件将被 lint 拦截（见 eslint-rules/no-direct-toast-import.js）。
 */
export function pushToast(message, type = 'success') {
  window.dispatchEvent(new CustomEvent('we:toast', { detail: { message, type } }));
}
export function pushErrorToast(message)   { pushToast(message, 'error');   }
export function pushWarningToast(message) { pushToast(message, 'warning'); }
export function pushInfoToast(message)    { pushToast(message, 'info');    }
