import { listCurrentEntities, listThreads } from '../db/queries/state-memory.js';
import { STATE_NAME_MATCH_MIN } from '../utils/constants.js';

function sharesPhrase(text, context) {
  const words = text.match(/[\p{L}\p{N}]{2,}/gu) || [];
  return words.some((word) => {
    for (let i = 0; i < word.length - 1; i += 1) {
      if (context.includes(word.slice(i, i + 2))) return true;
    }
    return false;
  });
}

/** 本轮文本是否碰到这条事项：参与者名字出现，或正文与本轮共享二字词。 */
export function threadMatchesTurn(thread, turnText, names) {
  const context = turnText || '';
  const participants = JSON.parse(thread.participants_json || '[]');
  return participants.some((id) => {
    const name = names.get(id) || '';
    return name.length >= STATE_NAME_MATCH_MIN && context.includes(name);
  }) || sharesPhrase(thread.content, context);
}

export function renderRelevantThreadsForUpdate(sessionId, turnText) {
  const names = new Map(listCurrentEntities(sessionId).map((entity) => [entity.entity_id, entity.name]));
  const nameOf = (id) => names.get(id) || '';
  return listThreads(sessionId)
    .filter((thread) => thread.status === 'active' || thread.status === 'dormant')
    .filter((thread) => threadMatchesTurn(thread, turnText, names))
    .map((thread) => {
      const participants = JSON.parse(thread.participants_json || '[]').map(nameOf).filter(Boolean);
      const dormant = thread.status === 'dormant' ? '［搁置］' : '';
      const deadline = thread.deadline ? `｜期限 ${thread.deadline}` : '';
      return `t${thread.seq}｜${dormant}［${thread.kind}］${thread.content}${participants.length ? `（${participants.join('、')}）` : ''}${deadline}`;
    }).join('\n');
}
