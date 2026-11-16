/**
 * speakers.js — 记忆类提示词里两方说话人的标注与称呼规则（轮次索引、上下文压缩共用）
 *
 * 对外暴露：
 *   resolveSpeakers(session) → { userLabel, assistantLabel, namingRule }
 */

import { getCharacterById } from '../db/queries/characters.js';
import { getOrCreatePersona } from '../services/personas.js';

/**
 * 对话模式两边是玩家与角色卡；写作模式没有单一角色，助手一侧是写出的故事正文。
 */
export function resolveSpeakers(session) {
  const character = session?.character_id ? getCharacterById(session.character_id) : null;
  const worldId = character?.world_id ?? session?.world_id;
  const personaName = (worldId ? getOrCreatePersona(worldId) : null)?.name?.trim();
  if (session?.mode === 'writing') {
    const protagonist = personaName ? `玩家扮演的主角叫"${personaName}"；` : '';
    return {
      userLabel: '玩家输入',
      assistantLabel: '正文',
      namingRule: `${protagonist}"玩家输入"是玩家这一轮的要求，"正文"是据此写出的故事，事实以正文为准；人物一律写出名字，不要用"玩家""角色""主角"这类代称`,
    };
  }
  const userName = personaName || '玩家';
  const characterName = character?.name?.trim() || '角色';
  return {
    userLabel: userName,
    assistantLabel: characterName,
    namingRule: `用户一方称"${userName}"，角色一方称"${characterName}"，其余人物写出名字`,
  };
}
