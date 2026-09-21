import { Router } from 'express';

import { chatMode } from '../app/modes/chat-mode.js';
import { createSseEmitter } from '../app/shared/http/create-sse-emitter.js';
import { createTurnHandlers } from '../app/shared/http/create-turn-handlers.js';
import { getSessionById } from '../services/sessions.js';
import { assertExists } from '../utils/route-helpers.js';
import { createLogger } from '../utils/logger.js';

const router = Router();
const log = createLogger('chat');

const handlers = createTurnHandlers({
  mode: chatMode,
  resolveSession(req, res) {
    const session = getSessionById(req.params.sessionId);
    return assertExists(res, session, 'Session not found') ? session : null;
  },
  emitSse: createSseEmitter(log),
  logNs: 'chat',
  // 对话侧的断线恢复端点历来不校验会话存在性：查不到任务返回 {task:null} 即可
  guardStreamEndpoints: false,
});

router.post('/:sessionId/chat', handlers.generate({
  requireContent: true,
  allowAttachments: true,
  logLabel: 'POST /chat',
}));
router.post('/:sessionId/stop', handlers.stop);
router.post('/:sessionId/regenerate', handlers.regenerate);
router.post('/:sessionId/continue', handlers.continueTurn);
router.get('/:sessionId/recover-stream', handlers.recoverStream);
router.get('/:sessionId/stream', handlers.streamSnapshot);
router.post('/:sessionId/impersonate', handlers.impersonate);
router.post('/:sessionId/edit-assistant', handlers.editAssistant);
router.post('/:sessionId/retitle', handlers.retitle);

export default router;
