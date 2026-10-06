/**
 * state-memory.js — 状态记忆 HTTP 接口（手动编辑 + 只读聚合）
 *
 * 前缀 `/api/sessions/:sessionId/state-memory`：
 *   GET    /                              → { entities, relations, threads, world, presentIds }
 *   POST   /entities                      body: { type, name, aliases?, pinned? }
 *   POST   /entities/from-card            body: { character_id }，从角色卡建置顶关联实体
 *   PATCH  /entities/:entityId            body: { name?, aliases?, pinned?, profile?, dynamic? }
 *   DELETE /entities/:entityId            → 实体退场（retire）
 *   PATCH  /entities/:entityId/fields/:fieldKey  body: { value }
 *   POST   /entities/:entityId/analyze    → LLM 制卡草稿 { name, system_prompt, description, first_message }
 *   PATCH  /world                         body: { time?, location? }
 *   POST   /relations                     body: { subject_id, predicate, object_id?, object_value?, note? }
 *   DELETE /relations/:relationId
 *   POST   /threads                       body: { kind, participants, content }
 *   PATCH  /threads/:threadId             body: { content?, status?, deadline? }
 *
 * 业务逻辑在 services/state-memory.js；这里只做参数透传与错误码映射
 * （service 抛出的 Error.code：'not_found' → 404，'conflict' → 409，其余 → 400）。
 */

import { Router } from 'express';
import {
  getStateMemory, createEntity, createEntityFromCard, updateEntity, retireEntity, updateEntityField, updateWorld,
  createRelation, deleteRelation, createThread, updateThread,
} from '../services/state-memory.js';
import { analyzeEntityForCard } from '../services/entity-card-maker.js';
import { createLogger, formatMeta } from '../utils/logger.js';

const router = Router();
const log = createLogger('state-memory', 'cyan');

const STATUS_BY_CODE = { not_found: 404, conflict: 409 };
const ANALYZE_STATUS_BY_CODE = { ENTITY_NOT_FOUND: 404, SESSION_NOT_FOUND: 404 };

function respondError(req, res, err, status) {
  log.warn(`state-memory.error ${formatMeta({ method: req.method, path: req.path, status, reason: err.message })}`);
  res.status(status).json({ error: err.message });
}

function handle(fn) {
  return (req, res) => {
    try {
      res.json(fn(req));
    } catch (err) {
      respondError(req, res, err, STATUS_BY_CODE[err.code] ?? 400);
    }
  };
}

/** 制卡分析走 LLM，错误码风格与 handle 不同（大写 *_NOT_FOUND），未知错误按 500 处理。 */
function handleAnalyze(fn) {
  return async (req, res) => {
    try {
      res.json(await fn(req));
    } catch (err) {
      respondError(req, res, err, ANALYZE_STATUS_BY_CODE[err.code] ?? 500);
    }
  };
}

router.get('/:sessionId/state-memory', handle((req) => getStateMemory(req.params.sessionId)));

router.post('/:sessionId/state-memory/entities', handle((req) => createEntity(req.params.sessionId, req.body)));

router.post('/:sessionId/state-memory/entities/from-card', handle((req) => (
  createEntityFromCard(req.params.sessionId, req.body)
)));

router.patch('/:sessionId/state-memory/entities/:entityId', handle((req) => (
  updateEntity(req.params.sessionId, req.params.entityId, req.body)
)));

router.delete('/:sessionId/state-memory/entities/:entityId', handle((req) => (
  retireEntity(req.params.sessionId, req.params.entityId)
)));

router.patch('/:sessionId/state-memory/entities/:entityId/fields/:fieldKey', handle((req) => (
  updateEntityField(req.params.sessionId, req.params.entityId, req.params.fieldKey, req.body)
)));

router.post('/:sessionId/state-memory/entities/:entityId/analyze', handleAnalyze((req) => (
  analyzeEntityForCard(req.params.sessionId, req.params.entityId)
)));

router.patch('/:sessionId/state-memory/world', handle((req) => updateWorld(req.params.sessionId, req.body)));

router.post('/:sessionId/state-memory/relations', handle((req) => createRelation(req.params.sessionId, req.body)));

router.delete('/:sessionId/state-memory/relations/:relationId', handle((req) => (
  deleteRelation(req.params.sessionId, req.params.relationId)
)));

router.post('/:sessionId/state-memory/threads', handle((req) => createThread(req.params.sessionId, req.body)));

router.patch('/:sessionId/state-memory/threads/:threadId', handle((req) => (
  updateThread(req.params.sessionId, req.params.threadId, req.body)
)));

export default router;
