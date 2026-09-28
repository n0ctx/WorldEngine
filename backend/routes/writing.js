import { Router } from 'express';

import { getEffectiveChapterTurnSize } from '../services/config.js';
import { createLogger, formatMeta } from '../utils/logger.js';
import {
  createWritingSession,
  getActiveWritingSessionsByWorldId,
  getWritingSessionById,
  deleteWritingSession,
  getMessagesBySessionId,
} from '../services/writing-sessions.js';
import { getCharactersByWorldId } from '../services/characters.js';
import { getWorldById } from '../services/worlds.js';
import { waitForQueueIdle } from '../utils/async-queue.js';
import { ALL_MESSAGES_LIMIT } from '../utils/constants.js';
import { generateChapterTitle } from '../memory/chapter-title-generator.js';
import { groupChapterMessages } from '../utils/chapter-detector.js';
import {
  getChapterTitlesBySessionId,
  upsertChapterTitle,
} from '../db/queries/chapter-titles.js';
import { assertExists } from '../utils/route-helpers.js';
import { writingMode } from '../app/modes/writing-mode.js';
import { createSseEmitter } from '../app/shared/http/create-sse-emitter.js';
import { createTurnHandlers } from '../app/shared/http/create-turn-handlers.js';

const router = Router();
const log = createLogger('writing');

function worldJsonHandler(read) {
  return (req, res) => {
    const { worldId } = req.params;
    const world = getWorldById(worldId);
    if (!assertExists(res, world, 'World not found')) return;
    res.json(read(worldId));
  };
}

function getSessionInWorld(req, res) {
 const { worldId, sessionId } = req.params;
 const session = getWritingSessionById(sessionId);
 if (!assertExists(res, session, 'Session not found')) return null;
 if (session.world_id !== worldId) {
 log.warn(
 `writing.world_mismatch ${formatMeta({
 method: req.method,
 path: req.path,
 worldId,
 sessionId,
 actualWorldId: session.world_id,
 })}`,
 );
 res.status(404).json({ error: 'Session not found' });
 return null;
 }
 return session;
}

const handlers = createTurnHandlers({
  mode: writingMode,
  resolveSession: getSessionInWorld,
  emitSse: createSseEmitter(log),
  logNs: 'writing',
});

router.get('/:worldId/writing-sessions', worldJsonHandler(getActiveWritingSessionsByWorldId));

router.post('/:worldId/writing-sessions', worldJsonHandler(createWritingSession));

router.delete('/:worldId/writing-sessions/:sessionId', async (req, res) => {
 const { sessionId } = req.params;
 if (!getSessionInWorld(req, res)) return;
 await deleteWritingSession(sessionId);
 res.json({ success: true });
});

router.get('/:worldId/writing-sessions/:sessionId/messages', (req, res) => {
 const { sessionId } = req.params;
 if (!getSessionInWorld(req, res)) return;
 res.json(getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0));
});

router.get('/:worldId/characters', worldJsonHandler(getCharactersByWorldId));

router.post('/:worldId/writing-sessions/:sessionId/generate', handlers.generate({
  requireContent: false,
  allowAttachments: false,
  logLabel: 'POST /generate',
}));
router.post('/:worldId/writing-sessions/:sessionId/stop', handlers.stop);
router.post('/:worldId/writing-sessions/:sessionId/continue', handlers.continueTurn);
router.post('/:worldId/writing-sessions/:sessionId/impersonate', handlers.impersonate);
router.post('/:worldId/writing-sessions/:sessionId/regenerate', handlers.regenerate);
router.get('/:worldId/writing-sessions/:sessionId/recover-stream', handlers.recoverStream);
router.get('/:worldId/writing-sessions/:sessionId/stream', handlers.streamSnapshot);
router.post('/:worldId/writing-sessions/:sessionId/edit-assistant', handlers.editAssistant);


router.get('/:worldId/writing-sessions/:sessionId/chapter-titles', (req, res) => {
 const { sessionId } = req.params;
 if (!getSessionInWorld(req, res)) return;
 res.json(getChapterTitlesBySessionId(sessionId));
});

router.put('/:worldId/writing-sessions/:sessionId/chapter-titles/:chapterIndex', (req, res) => {
  const { sessionId, chapterIndex } = req.params;
  const { title } = req.body;
  if (!title || typeof title !== 'string' || !title.trim()) {
    log.warn(
      `writing.bad_request ${formatMeta({
        method: req.method,
        path: req.path,
        reason: 'title is required',
      })}`
    );
    return res.status(400).json({ error: 'title is required' });
  }
 if (!getSessionInWorld(req, res)) return;
 upsertChapterTitle(sessionId, Number(chapterIndex), title.trim().slice(0, 20), 0);
  res.json({ success: true });
});

router.post('/:worldId/writing-sessions/:sessionId/chapter-titles/:chapterIndex/retitle', async (req, res) => {
  const { sessionId, chapterIndex } = req.params;
 if (!getSessionInWorld(req, res)) return;

 const idx = Number(chapterIndex);
  const allMsgs = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const chapterMsgs = groupChapterMessages(allMsgs, idx, getEffectiveChapterTurnSize('writing'));
  if (chapterMsgs.length === 0) {
    log.warn(`writing.not_found ${formatMeta({ method: req.method, path: req.path, id: `chapter:${idx}` })}`);
    return res.status(404).json({ error: 'Chapter not found' });
  }

  try {
    await waitForQueueIdle(sessionId);
    const title = await generateChapterTitle(sessionId, idx, chapterMsgs);
    if (!title) {
      log.error(
        `writing.unhandled ${formatMeta({
          method: req.method,
          path: req.path,
          msg: 'generateChapterTitle returned empty',
        })}`
      );
      return res.status(500).json({ error: '生成失败' });
    }
    res.json({ title, chapterIndex: idx });
  } catch (err) {
    log.error(
      `writing.unhandled ${formatMeta({
        method: req.method,
        path: req.path,
        msg: err?.message,
      })}`
    );
    res.status(500).json({ error: err.message });
  }
});

router.post('/:worldId/writing-sessions/:sessionId/retitle', handlers.retitle);

export default router;
