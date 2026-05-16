import { getChapterTitle, upsertChapterTitle } from '../../db/queries/chapter-titles.js';
import { getLatestTurnRecord } from '../../db/queries/turn-records.js';
import { generateChapterTitle } from '../../memory/chapter-title-generator.js';
import { updateAllStates } from '../../memory/combined-state-updater.js';
import { checkAndGenerateDiary } from '../../memory/diary-generator.js';
import { generateTitle } from '../../memory/summarizer.js';
import { createTurnRecord } from '../../memory/turn-summarizer.js';
import { detectNewChapter } from '../../utils/chapter-detector.js';
import { getEffectiveChapterTurnSize } from '../../services/config.js';

export function buildWritingPostgenTasks({
  sessionId,
  worldId,
  session,
  messages = [],
  turnRecordOpts = {},
  includeSessionTitle = true,
  includeChapterTitle = true,
}) {
  let chapterIndex;
  let chapterMessages;
  let chapterTitleCondition = false;

  if (includeChapterTitle && !turnRecordOpts?.isUpdate) {
    const newChapter = detectNewChapter(messages, getEffectiveChapterTurnSize('writing'));
    if (newChapter) {
      chapterIndex = newChapter.chapterIndex;
      chapterMessages = newChapter.chapterMessages;
      const existing = getChapterTitle(sessionId, chapterIndex);
      if (!existing) {
        const defaultTitle = chapterIndex === 1 ? '序章' : '续章';
        upsertChapterTitle(sessionId, chapterIndex, defaultTitle, 1);
        chapterTitleCondition = true;
      }
    }
  }

  return [
    {
      label: 'session-title',
      priority: 2,
      fn: () => generateTitle(sessionId),
      condition: includeSessionTitle && !!(session && !session.title),
      sseEvent: 'title_updated',
      ssePayload: (title) => (title ? { type: 'title_updated', title } : null),
      keepSseAlive: true,
    },
    {
      label: 'chapter-title',
      priority: 2,
      fn: () => generateChapterTitle(sessionId, chapterIndex, chapterMessages),
      condition: chapterTitleCondition,
      sseEvent: 'chapter_title_updated',
      ssePayload: (title) =>
        title ? { type: 'chapter_title_updated', chapterIndex, title } : null,
      keepSseAlive: true,
    },
    {
      label: 'all-state',
      priority: 2,
      fn: () => updateAllStates(worldId, [], sessionId),
      tracksState: true,
      startSseEvent: 'state_queued',
      sseEvent: 'state_updated',
      ssePayload: () => ({ type: 'state_updated' }),
      keepSseAlive: true,
    },
    {
      label: 'turn-record',
      priority: 3,
      fn: () => createTurnRecord(sessionId, turnRecordOpts),
      keepSseAlive: false,
    },
    {
      label: 'diary',
      priority: 4,
      fn: async () => {
        const latest = getLatestTurnRecord(sessionId);
        if (latest) await checkAndGenerateDiary(sessionId, latest.round_index);
      },
      sseEvent: 'diary_updated',
      ssePayload: () => ({ type: 'diary_updated' }),
      keepSseAlive: true,
    },
  ];
}
