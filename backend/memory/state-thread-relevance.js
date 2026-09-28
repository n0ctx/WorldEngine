import { listActiveThreads, listCurrentEntities } from '../db/queries/state-memory.js';
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

export function renderRelevantThreadsForUpdate(sessionId, turnText) {
  const context = turnText || '';
  const names = new Map(listCurrentEntities(sessionId).map((entity) => [entity.entity_id, entity.name]));
  const nameOf = (id) => names.get(id) || '';
  return listActiveThreads(sessionId)
    .filter((thread) => {
      const participants = JSON.parse(thread.participants_json || '[]');
      return participants.some((id) => {
        const name = nameOf(id);
        return name.length >= STATE_NAME_MATCH_MIN && context.includes(name);
      }) || sharesPhrase(thread.content, context);
    })
    .map((thread) => {
      const participants = JSON.parse(thread.participants_json || '[]').map(nameOf).filter(Boolean);
      return `t${thread.seq}｜［${thread.kind}］${thread.content}${participants.length ? `（${participants.join('、')}）` : ''}`;
    }).join('\n');
}
