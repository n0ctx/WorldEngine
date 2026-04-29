import { getSessionById } from '../db/queries/sessions.js';

/**
 * 根据 sessionId 决定 aux 调用的 configScope。
 * 写作模式 session → 'writing-aux'（回退链：writing.aux_llm → aux_llm → llm）
 * 其他场景    → 'aux'（回退链：aux_llm → llm）
 *
 * sessionId 缺失或查不到时回退 'aux'。
 */
export function resolveAuxScope(sessionId) {
  if (!sessionId) return 'aux';
  const session = getSessionById(sessionId);
  return session?.mode === 'writing' ? 'writing-aux' : 'aux';
}
