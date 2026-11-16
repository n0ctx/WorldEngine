/**
 * context-blocks.js — 剧情摘要（上下文压缩块）HTTP 接口
 *
 * GET    /api/sessions/:sessionId/context                         → { blocks, stats }
 *   blocks：在用的块（按轮次排列）；stats：原文与摘要占用、压缩比、最近一次提示词占用与压缩结果。
 * GET    /api/sessions/:sessionId/context/search?q=               → { hits }
 * GET    /api/sessions/:sessionId/context/blocks/:blockId/source  → { block, children, rounds }
 *   默认展开一级（子块 + 子块没覆盖的原文）；?full=1 给出覆盖范围内的全部原文。
 * PUT    /api/sessions/:sessionId/context/blocks/:blockId         body: { summary, topic? } → { block }
 * DELETE /api/sessions/:sessionId/context/blocks/:blockId         → { blocks, stats }  恢复原文（展开一级）
 */

import express from 'express';
import { getSessionById } from '../db/queries/sessions.js';
import {
  CONTEXT_BLOCK_NOT_FOUND,
  editContextBlock,
  getContextBlockSource,
  getContextOverview,
  restoreContextBlock,
  searchContext,
} from '../services/context-blocks.js';
import { assertExists, sendValidationError } from '../utils/route-helpers.js';
import { createLogger } from '../utils/logger.js';

const router = express.Router();
const log = createLogger('context-routes');

function withSession(handler) {
  return (req, res) => {
    const { sessionId, blockId } = req.params;
    if (!assertExists(res, getSessionById(sessionId), '会话不存在')) return undefined;
    try {
      return handler(req, res, sessionId);
    } catch (err) {
      return sendValidationError(res, err, { log, ns: 'context', notFoundMessage: CONTEXT_BLOCK_NOT_FOUND, id: blockId });
    }
  };
}

router.get('/:sessionId/context', withSession((req, res, sessionId) => res.json(getContextOverview(sessionId))));

router.get('/:sessionId/context/search', withSession((req, res, sessionId) => res.json(searchContext(sessionId, req.query.q))));

router.get('/:sessionId/context/blocks/:blockId/source', withSession((req, res, sessionId) => (
  res.json(getContextBlockSource(sessionId, req.params.blockId, { full: req.query.full === '1' }))
)));

router.put('/:sessionId/context/blocks/:blockId', withSession((req, res, sessionId) => (
  res.json({ block: editContextBlock(sessionId, req.params.blockId, req.body ?? {}) })
)));

router.delete('/:sessionId/context/blocks/:blockId', withSession((req, res, sessionId) => (
  res.json(restoreContextBlock(sessionId, req.params.blockId))
)));

export default router;
