import { getSessionById } from '../../db/queries/sessions.js';
import { chatMode } from './chat-mode.js';
import { writingMode } from './writing-mode.js';

export { chatMode, writingMode };

/**
 * 按 sessions.mode 反查模式描述符。
 * 与 utils/aux-scope.js 的 resolveAuxScope 同源同口径（那边只解析副模型 scope，
 * 且处在 utils 层不能反向依赖 app/），两者保持并存。
 */
export function getModeForSession(sessionId) {
  return getSessionById(sessionId)?.mode === 'writing' ? writingMode : chatMode;
}
