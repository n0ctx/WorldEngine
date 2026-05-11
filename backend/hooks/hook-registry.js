import { createLogger, formatMeta } from '../utils/logger.js';

const log = createLogger('hook');

// event → Array<{ fn: Function, label: string }>
const registry = new Map();

/**
 * 注册一个 hook 处理函数
 *
 * @param {string} event
 * @param {(payload: object) => Promise<void>} fn
 * @param {{ label?: string }} [options]
 */
export function registerHook(event, fn, { label } = {}) {
  if (typeof event !== 'string' || !event) throw new Error('[hook-registry] event 必须是非空字符串');
  if (typeof fn !== 'function') throw new Error(`[hook-registry] ${event} 的 fn 必须是函数`);

  if (!registry.has(event)) registry.set(event, []);
  registry.get(event).push({ fn, label: label || fn.name || event });
}

/**
 * 执行指定事件的所有已注册 hook
 * 单个 hook 抛错只 warn，不中断后续 hook，不向上抛
 *
 * @param {string} event
 * @param {object} payload
 * @returns {Promise<void>}
 */
export async function runHook(event, payload) {
  const handlers = registry.get(event);
  if (!handlers || handlers.length === 0) return;

  for (const { fn, label } of handlers) {
    try {
      await fn(payload);
    } catch (err) {
      log.warn(`HOOK FAIL  ${formatMeta({ event, label, error: err.message })}`);
    }
  }
}

/**
 * 列出已注册的所有事件及其 hook 数量（用于启动日志）
 * @returns {Map<string, number>}
 */
export function listHooks() {
  const result = new Map();
  for (const [event, handlers] of registry) {
    result.set(event, handlers.length);
  }
  return result;
}
