import { getLastTurnMessages, getMessagesBySessionId } from '../db/queries/messages.js';
import { queryLocalRecall } from '../db/queries/local-recall.js';
import { buildRoundUnits } from './context/view.js';
import { countTokens } from '../utils/token-counter.js';
import { toPromptMessage } from '../utils/turn-dialogue.js';

export function buildRecentMessagesText(sessionId) {
  const lastTurn = getLastTurnMessages(sessionId).map(toPromptMessage);
  const lastUser = lastTurn.find((message) => message.role === 'user');
  const lastAsst = lastTurn.find((message) => message.role === 'assistant');
  return [
    lastAsst ? `AI：${lastAsst.content}` : '',
    lastUser ? `用户：${lastUser.content}` : '',
  ].filter(Boolean).join('\n');
}

export function currentUnits(sessionId) {
  return buildRoundUnits(getMessagesBySessionId(sessionId, null), { toPromptMessage });
}

export function usableSnapshotRounds(scope, liveUnits) {
  return new Set(scope.units.flatMap((unit, index) => (
    liveUnits[index]?.digest === unit.digest ? [index + 1] : []
  )));
}

export async function recallLocalTurns({ sessionId, contextText, scope, liveUnits, validRounds, shadowEnabled, budget, renderEvidence, legacyRecall, logShadow }) {
  const ranked = queryLocalRecall(sessionId, liveUnits, contextText);
  const rounds = selectRankedLocalEvidence(ranked, scope, validRounds, budget, renderEvidence);
  if (shadowEnabled) {
    const comparison = await legacyRecall();
    logShadow(rounds, comparison.rounds);
  }
  const stillValid = usableSnapshotRounds(scope, currentUnits(sessionId));
  const currentRounds = rounds.filter((round) => stillValid.has(round));
  return {
    rounds: currentRounds,
    candidateCount: scope.outOfViewRounds.size,
    droppedCount: Math.max(0, scope.outOfViewRounds.size - currentRounds.length),
  };
}

export function selectRankedLocalEvidence(ranked, scope, validRounds, budget, renderEvidence) {
  const allowed = ranked.filter((hit) => validRounds.has(hit.round) && scope.outOfViewRounds.has(hit.round));
  const selected = [];
  let used = 0;
  for (const hit of allowed) {
    const evidence = renderEvidence([hit.round], scope.units, budget - used);
    if (!evidence.hitRounds.length) continue;
    const tokens = countTokens(evidence.text);
    selected.push({ round: hit.round, tokens });
    used += tokens;
  }
  return selected.sort((a, b) => a.round - b.round).map(({ round }) => round);
}
