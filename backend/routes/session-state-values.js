/**
 * 会话状态值路由（会话级隔离）
 *
 *   GET    /api/sessions/:sessionId/state-values
 *     — 返回 { world: [...], persona: [...], character: [...] }
 *       每项结构与 getWorldStateValuesWithFields 兼容，effective_value_json 已合并会话 runtime
 *
 *   DELETE /api/sessions/:sessionId/world-state-values
 *   DELETE /api/sessions/:sessionId/persona-state-values
 *   DELETE /api/sessions/:sessionId/character-state-values
 *     — 清空该会话对应类型的运行时状态
 *
 *   GET    /api/sessions/:sessionId/characters/:characterId/state-values
 *   DELETE /api/sessions/:sessionId/characters/:characterId/state-values
 *     — 单角色会话状态值查询 / 重置
 */

import { Router } from 'express';
import { getSessionById } from '../db/queries/sessions.js';
import { getCharacterById } from '../db/queries/characters.js';
import { getWritingSessionCharacters } from '../db/queries/writing-sessions.js';
import {
  getSessionWorldStateValues,
  getSessionPersonaStateValues,
  getSessionCharacterStateValues,
  getSingleCharacterSessionStateValues,
  getCharacterStateValuesAfterReset,
} from '../db/queries/session-state-values.js';
import { clearSessionWorldStateValues } from '../db/queries/session-world-state-values.js';
import { clearSessionPersonaStateValues } from '../db/queries/session-persona-state-values.js';
import {
  clearSessionCharacterStateValues,
  clearSingleCharacterSessionStateValues,
} from '../db/queries/session-character-state-values.js';

const router = Router();

// ── GET /api/sessions/:sessionId/state-values ─────────────────────

router.get('/:sessionId/state-values', (req, res) => {
  const { sessionId } = req.params;
  const session = getSessionById(sessionId);
  if (!session) return res.status(404).json({ error: '会话不存在' });

  const worldId = session.world_id ?? getCharacterById(session.character_id)?.world_id;
  if (!worldId) return res.json({ world: [], persona: [], character: [] });

  // 写作模式：取所有激活角色；对话模式：取绑定角色
  const characterIds = session.mode === 'writing'
    ? getWritingSessionCharacters(sessionId).map((c) => c.id)
    : session.character_id ? [session.character_id] : [];

  const world = getSessionWorldStateValues(sessionId, worldId);
  const persona = getSessionPersonaStateValues(sessionId, worldId);
  const character = getSessionCharacterStateValues(sessionId, worldId, characterIds);

  res.json({ world, persona, character });
});

// ── DELETE /api/sessions/:sessionId/world-state-values ────────────

router.delete('/:sessionId/world-state-values', (req, res) => {
  const { sessionId } = req.params;
  const session = getSessionById(sessionId);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  clearSessionWorldStateValues(sessionId);
  res.json({ success: true });
});

// ── DELETE /api/sessions/:sessionId/persona-state-values ──────────

router.delete('/:sessionId/persona-state-values', (req, res) => {
  const { sessionId } = req.params;
  const session = getSessionById(sessionId);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  clearSessionPersonaStateValues(sessionId);
  res.json({ success: true });
});

// ── DELETE /api/sessions/:sessionId/character-state-values ────────

router.delete('/:sessionId/character-state-values', (req, res) => {
  const { sessionId } = req.params;
  const session = getSessionById(sessionId);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  clearSessionCharacterStateValues(sessionId);
  res.json({ success: true });
});

// ── GET /api/sessions/:sessionId/characters/:characterId/state-values ─

router.get('/:sessionId/characters/:characterId/state-values', (req, res) => {
  const { sessionId, characterId } = req.params;
  const charObj = getCharacterById(characterId);
  if (!charObj) return res.status(404).json({ error: '角色不存在' });

  res.json(getSingleCharacterSessionStateValues(sessionId, characterId, charObj.world_id));
});

// ── DELETE /api/sessions/:sessionId/characters/:characterId/state-values

router.delete('/:sessionId/characters/:characterId/state-values', (req, res) => {
  const { sessionId, characterId } = req.params;
  clearSingleCharacterSessionStateValues(sessionId, characterId);

  const charObj = getCharacterById(characterId);
  if (!charObj) return res.json([]);

  res.json(getCharacterStateValuesAfterReset(characterId, charObj.world_id));
});

export default router;
