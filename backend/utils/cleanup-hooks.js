/**
 * cleanup-hooks.js — 副作用资源删除钩子注册表
 *
 * 对外暴露：
 *   registerOnDelete(entity, fn)  → void
 *   runOnDelete(entity, id)       → Promise<void>
 *
 * 使用方式：
 *   在 services/cleanup-registrations.js 中注册钩子；
 *   在各 delete service 内调用 runOnDelete，再执行 DB DELETE。
 *
 * 钩子失败只记录 warn，不中断后续钩子，不向上抛出。
 * 以后新增任何副作用资源只需在 cleanup-registrations.js 注册一个钩子，
 * 不再改动 deleteWorld / deleteCharacter / deleteSession 等核心逻辑。
 */

import { createLogger, formatMeta } from './logger.js';

const log = createLogger('cleanup');
const VALID_ENTITIES = ['world', 'character', 'session', 'message'];

/** @type {{ world: Function[], character: Function[], session: Function[], message: Function[] }} */
const hooks = {
  world: [],
  character: [],
  session: [],
  message: [],
};

/**
 * 注册删除钩子
 *
 * @param {'world'|'character'|'session'|'message'} entity
 * @param {(id: string) => Promise<void>} fn
 */
export function registerOnDelete(entity, fn) {
  if (!VALID_ENTITIES.includes(entity)) {
    throw new Error(`[cleanup-hooks] 未知 entity: ${entity}，必须是 ${VALID_ENTITIES.join(' | ')}`);
  }
  hooks[entity].push(fn);
}

/**
 * 执行指定 entity 的所有删除钩子
 * 单个钩子抛错只 warn，不中断后续钩子，不向上抛
 *
 * @param {'world'|'character'|'session'|'message'} entity
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function runOnDelete(entity, id) {
  const fns = hooks[entity] ?? [];
  for (const fn of fns) {
    try {
      await fn(id);
    } catch (err) {
      log.warn(`HOOK FAIL  ${formatMeta({ entity, id, error: err.message })}`);
    }
  }
}
