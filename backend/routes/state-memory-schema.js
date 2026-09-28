/**
 * 状态记忆的 schema 只读接口
 *
 *   GET /api/state-memory/schema
 *
 * 返回值来自 backend/memory/state-memory-schema.js 的唯一定义，前端不重复定义。
 */

import { Router } from 'express';
import {
  DYNAMIC_LOCATION_KEY,
  ENTITY_TYPES,
  EXCLUSIVE_PREDICATES,
  RESERVED_WORLD_FIELD_LABELS,
  THREAD_KINDS,
  getProfileFieldDefinitions,
} from '../memory/state-memory-schema.js';

const router = Router();

router.get('/state-memory/schema', (_req, res) => {
  const profileFields = Object.fromEntries(
    ENTITY_TYPES.map((entityType) => [entityType, getProfileFieldDefinitions(entityType)]),
  );
  res.json({
    entityTypes: ENTITY_TYPES,
    profileFields,
    threadKinds: THREAD_KINDS,
    exclusivePredicates: EXCLUSIVE_PREDICATES,
    reservedWorldFieldLabels: RESERVED_WORLD_FIELD_LABELS,
    dynamicLocationKey: DYNAMIC_LOCATION_KEY,
  });
});

export default router;
