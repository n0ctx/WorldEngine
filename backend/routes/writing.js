import { Router } from 'express';

import { getEffectiveChapterTurnSize } from '../services/config.js';
import { createLogger, formatMeta } from '../utils/logger.js';
import {
  createWritingSession,
  getActiveWritingSessionsByWorldId,
  getWritingSessionById,
  deleteWritingSession,
  listNearby,
  addSavedFromCharacter,
  removeNearby,
  setNearbyIsSaved,
  patchNearbyPersona,
  renameNearby,
  patchNearbyState,
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
import { analyzeNearbyForCard } from '../services/nearby-card-maker.js';
import { writingMode } from '../app/modes/writing-mode.js';
import { createSseEmitter } from '../app/shared/http/create-sse-emitter.js';
import { createTurnHandlers } from '../app/shared/http/create-turn-handlers.js';

const router = Router();
const log = createLogger('writing');


function handleNearbyError(err, res) {
  if (err && err.code === 'NEARBY_NAME_CONFLICT') {
    return res.status(409).json({ error: err.message });
  }
  const msg = err?.message ?? '';
  if (/not found/i.test(msg)) {
    return res.status(404).json({ error: msg });
  }
  if (/required|not enabled|world mismatch|not in this world/i.test(msg)) {
    return res.status(400).json({ error: msg });
  }
  log.error(`NEARBY ERROR  ${formatMeta({ error: msg })}`);
  return res.status(500).json({ error: msg || 'Internal error' });
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

router.get('/:worldId/writing-sessions', (req, res) => {
  const { worldId } = req.params;
  const world = getWorldById(worldId);
  if (!assertExists(res, world, 'World not found')) return;
  res.json(getActiveWritingSessionsByWorldId(worldId));
});

router.post('/:worldId/writing-sessions', (req, res) => {
  const { worldId } = req.params;
  const world = getWorldById(worldId);
  if (!assertExists(res, world, 'World not found')) return;
  res.json(createWritingSession(worldId));
});

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

router.get('/:worldId/writing-sessions/:sessionId/nearby', (req, res) => {
 const { sessionId } = req.params;
 if (!getSessionInWorld(req, res)) return;
 try {
    res.json(listNearby(sessionId));
  } catch (err) {
    handleNearbyError(err, res);
  }
});

router.post('/:worldId/writing-sessions/:sessionId/nearby', (req, res) => {
 const { sessionId } = req.params;
 if (!getSessionInWorld(req, res)) return;
 const characterId = req.body?.character_id;
  if (!characterId || typeof characterId !== 'string') {
    log.warn(
      `writing.bad_request ${formatMeta({
        method: req.method,
        path: req.path,
        reason: 'character_id is required',
      })}`
    );
    return res.status(400).json({ error: 'character_id is required' });
  }
  try {
    const id = addSavedFromCharacter(sessionId, characterId);
    res.status(201).json({ id });
  } catch (err) {
    handleNearbyError(err, res);
  }
});

router.patch('/:worldId/writing-sessions/:sessionId/nearby/:nearbyId', (req, res) => {
 const { sessionId, nearbyId } = req.params;
 if (!getSessionInWorld(req, res)) return;
 const { is_saved, persona, name } = req.body ?? {};
  try {
    if (typeof name === 'string') renameNearby(sessionId, nearbyId, name);
    if (is_saved !== undefined) setNearbyIsSaved(sessionId, nearbyId, is_saved ? 1 : 0);
    if (persona !== undefined) patchNearbyPersona(sessionId, nearbyId, persona);
    const row = listNearby(sessionId).find((nearby) => nearby.id === nearbyId);
    if (!row) {
      log.warn(`writing.not_found ${formatMeta({ method: req.method, path: req.path, id: nearbyId })}`);
      return res.status(404).json({ error: 'nearby not found in session' });
    }
    res.json(row);
  } catch (err) {
    handleNearbyError(err, res);
  }
});

router.patch('/:worldId/writing-sessions/:sessionId/nearby/:nearbyId/state', (req, res) => {
 const { sessionId, nearbyId } = req.params;
 if (!getSessionInWorld(req, res)) return;
 const { field_key, value_json } = req.body ?? {};
  if (!field_key || typeof field_key !== 'string') {
    log.warn(
      `writing.bad_request ${formatMeta({
        method: req.method,
        path: req.path,
        reason: 'field_key is required',
      })}`
    );
    return res.status(400).json({ error: 'field_key is required' });
  }
  try {
    patchNearbyState(sessionId, nearbyId, field_key, value_json ?? null);
    res.json({ ok: true });
  } catch (err) {
    handleNearbyError(err, res);
  }
});

router.post('/:worldId/writing-sessions/:sessionId/nearby/:nearbyId/analyze', async (req, res) => {
 const { sessionId, nearbyId } = req.params;
 if (!getSessionInWorld(req, res)) return;
 try {
    res.json(await analyzeNearbyForCard(sessionId, nearbyId));
  } catch (err) {
    handleNearbyError(err, res);
  }
});

router.delete('/:worldId/writing-sessions/:sessionId/nearby/:nearbyId', (req, res) => {
 const { sessionId, nearbyId } = req.params;
 if (!getSessionInWorld(req, res)) return;
 try {
    removeNearby(sessionId, nearbyId);
    res.status(204).end();
  } catch (err) {
    handleNearbyError(err, res);
  }
});

router.get('/:worldId/characters', (req, res) => {
  const { worldId } = req.params;
  const world = getWorldById(worldId);
  if (!assertExists(res, world, 'World not found')) return;
  res.json(getCharactersByWorldId(worldId));
});

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
