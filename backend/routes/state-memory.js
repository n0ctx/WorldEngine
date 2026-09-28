/**
 * state-memory.js — 状态记忆 HTTP 接口（手动编辑 + 只读聚合）
 *
 * 前缀 `/api/sessions/:sessionId/state-memory`：
 *   GET    /                              → { entities, relations, threads, facts, world, presentIds }
 *   POST   /entities                      body: { type, name, aliases?, pinned? }
 *   PATCH  /entities/:entityId            body: { name?, aliases?, pinned?, profile?, dynamic? }
 *   DELETE /entities/:entityId            → 实体退场（retire）
 *   PATCH  /entities/:entityId/fields/:fieldKey  body: { value }
 *   PATCH  /world                         body: { time?, location? }
 *   POST   /relations                     body: { subject_id, predicate, object_id?, object_value?, note? }
 *   DELETE /relations/:relationId
 *   POST   /threads                       body: { kind, participants, content }
 *   PATCH  /threads/:threadId             body: { content?, status? }
 *   POST   /facts                         body: { text }
 *   DELETE /facts/:factId
 *
 * 业务逻辑在 services/state-memory.js；这里只做参数透传与错误码映射
 * （service 抛出的 Error.code：'not_found' → 404，'conflict' → 409，其余 → 400）。
 */

import { Router } from 'express';
import {
  getStateMemory, createEntity, updateEntity, retireEntity, updateEntityField, updateWorld,
  createRelation, deleteRelation, createThread, updateThread, createFact, deleteFact,
} from '../services/state-memory.js';
import { createLogger, formatMeta } from '../utils/logger.js';

const router = Router();
const log = createLogger('state-memory', 'cyan');

const STATUS_BY_CODE = { not_found: 404, conflict: 409 };

function handle(fn) {
  return (req, res) => {
    try {
      res.json(fn(req));
    } catch (err) {
      const status = STATUS_BY_CODE[err.code] ?? 400;
      log.warn(`state-memory.error ${formatMeta({ method: req.method, path: req.path, status, reason: err.message })}`);
      res.status(status).json({ error: err.message });
    }
  };
}

router.get('/:sessionId/state-memory', handle((req) => getStateMemory(req.params.sessionId)));

router.post('/:sessionId/state-memory/entities', handle((req) => createEntity(req.params.sessionId, req.body)));

router.patch('/:sessionId/state-memory/entities/:entityId', handle((req) => (
  updateEntity(req.params.sessionId, req.params.entityId, req.body)
)));

router.delete('/:sessionId/state-memory/entities/:entityId', handle((req) => (
  retireEntity(req.params.sessionId, req.params.entityId)
)));

router.patch('/:sessionId/state-memory/entities/:entityId/fields/:fieldKey', handle((req) => (
  updateEntityField(req.params.sessionId, req.params.entityId, req.params.fieldKey, req.body)
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

router.post('/:sessionId/state-memory/facts', handle((req) => createFact(req.params.sessionId, req.body)));

router.delete('/:sessionId/state-memory/facts/:factId', handle((req) => (
  deleteFact(req.params.sessionId, req.params.factId)
)));

export default router;
