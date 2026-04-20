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
 */

import { Router } from 'express';
import db from '../db/index.js';
import { getSessionById } from '../db/queries/sessions.js';
import { getCharacterById } from '../db/queries/characters.js';
import { getWritingSessionCharacters } from '../db/queries/writing-sessions.js';
import { clearSessionWorldStateValues } from '../db/queries/session-world-state-values.js';
import { clearSessionPersonaStateValues } from '../db/queries/session-persona-state-values.js';
import { clearSessionCharacterStateValues } from '../db/queries/session-character-state-values.js';

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

  // 世界状态
  const world = db.prepare(`
    SELECT
      wsf.field_key,
      wsf.label,
      wsf.type,
      wsf.sort_order,
      wsf.max_value,
      wsv.default_value_json AS default_value_json,
      swsv.runtime_value_json AS runtime_value_json,
      COALESCE(swsv.runtime_value_json, wsv.default_value_json, wsf.default_value) AS effective_value_json
    FROM world_state_fields wsf
    LEFT JOIN session_world_state_values swsv
      ON swsv.world_id = wsf.world_id AND swsv.field_key = wsf.field_key AND swsv.session_id = ?
    LEFT JOIN world_state_values wsv
      ON wsf.world_id = wsv.world_id AND wsf.field_key = wsv.field_key
    WHERE wsf.world_id = ?
    ORDER BY wsf.sort_order ASC
  `).all(sessionId, worldId);

  // 玩家状态
  const persona = db.prepare(`
    SELECT
      psf.field_key,
      psf.label,
      psf.type,
      psf.sort_order,
      psf.max_value,
      psv.default_value_json AS default_value_json,
      spsv.runtime_value_json AS runtime_value_json,
      COALESCE(spsv.runtime_value_json, psv.default_value_json, psf.default_value) AS effective_value_json
    FROM persona_state_fields psf
    LEFT JOIN session_persona_state_values spsv
      ON spsv.world_id = psf.world_id AND spsv.field_key = psf.field_key AND spsv.session_id = ?
    LEFT JOIN persona_state_values psv
      ON psf.world_id = psv.world_id AND psf.field_key = psv.field_key
    WHERE psf.world_id = ?
    ORDER BY psf.sort_order ASC
  `).all(sessionId, worldId);

  // 角色状态（每个角色独立查，合并返回）
  const character = [];
  for (const charId of characterIds) {
    const charObj = getCharacterById(charId);
    if (!charObj) continue;
    const rows = db.prepare(`
      SELECT
        csf.field_key,
        csf.label,
        csf.type,
        csf.sort_order,
        csf.max_value,
        csv.default_value_json AS default_value_json,
        scsv.runtime_value_json AS runtime_value_json,
        COALESCE(scsv.runtime_value_json, csv.default_value_json, csf.default_value) AS effective_value_json
      FROM character_state_fields csf
      LEFT JOIN session_character_state_values scsv
        ON scsv.character_id = ? AND scsv.field_key = csf.field_key AND scsv.session_id = ?
      LEFT JOIN character_state_values csv
        ON csf.field_key = csv.field_key AND csv.character_id = ?
      WHERE csf.world_id = ?
      ORDER BY csf.sort_order ASC
    `).all(charId, sessionId, charId, charObj.world_id);
    character.push(...rows);
  }

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

  const rows = db.prepare(`
    SELECT
      csf.field_key,
      csf.label,
      csf.type,
      csf.sort_order,
      csf.max_value,
      csv.default_value_json AS default_value_json,
      scsv.runtime_value_json AS runtime_value_json,
      COALESCE(scsv.runtime_value_json, csv.default_value_json, csf.default_value) AS effective_value_json
    FROM character_state_fields csf
    LEFT JOIN session_character_state_values scsv
      ON scsv.character_id = ? AND scsv.field_key = csf.field_key AND scsv.session_id = ?
    LEFT JOIN character_state_values csv
      ON csf.field_key = csv.field_key AND csv.character_id = ?
    WHERE csf.world_id = ?
    ORDER BY csf.sort_order ASC
  `).all(characterId, sessionId, characterId, charObj.world_id);

  res.json(rows);
});

// ── DELETE /api/sessions/:sessionId/characters/:characterId/state-values

router.delete('/:sessionId/characters/:characterId/state-values', (req, res) => {
  const { sessionId, characterId } = req.params;
  db.prepare(
    'DELETE FROM session_character_state_values WHERE session_id = ? AND character_id = ?',
  ).run(sessionId, characterId);

  // 重置后返回合并后的状态
  const charObj = getCharacterById(characterId);
  if (!charObj) return res.json([]);

  const rows = db.prepare(`
    SELECT
      csf.field_key,
      csf.label,
      csf.type,
      csf.sort_order,
      csf.max_value,
      csv.default_value_json AS default_value_json,
      NULL AS runtime_value_json,
      COALESCE(csv.default_value_json, csf.default_value) AS effective_value_json
    FROM character_state_fields csf
    LEFT JOIN character_state_values csv
      ON csf.field_key = csv.field_key AND csv.character_id = ?
    WHERE csf.world_id = ?
    ORDER BY csf.sort_order ASC
  `).all(characterId, charObj.world_id);

  res.json(rows);
});

export default router;
