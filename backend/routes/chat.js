import { Router } from 'express';
import * as llm from '../llm/index.js';
import { buildContext, activeStreams, saveAttachments } from '../services/chat.js';
import {
  createMessage,
  getMessagesBySessionId,
  touchSession,
  getSessionById,
  deleteMessagesAfter,
} from '../services/sessions.js';
import { enqueue } from '../utils/async-queue.js';
import { generateSummary, generateTitle } from '../memory/summarizer.js';

const router = Router();

// ── 工具函数 ──

function sseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
}

function sseSend(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * 执行流式生成（chat 和 regenerate 共用）
 */
async function runStream(sessionId, res) {
  // 若该 sessionId 已有进行中的请求，先 abort
  const existing = activeStreams.get(sessionId);
  if (existing) existing.abort();

  const ac = new AbortController();
  activeStreams.set(sessionId, ac);

  // 监听客户端断开（页面刷新/关闭）
  let clientClosed = false;
  res.on('close', () => {
    clientClosed = true;
    if (activeStreams.get(sessionId) === ac) {
      ac.abort();
    }
  });

  sseHeaders(res);

  let fullContent = '';
  let aborted = false;

  try {
    const { messages, overrides } = await buildContext(sessionId);
    const stream = llm.chat(messages, { ...overrides, signal: ac.signal });

    for await (const chunk of stream) {
      fullContent += chunk;
      if (!clientClosed) sseSend(res, { delta: chunk });
    }
  } catch (err) {
    if (err.name === 'AbortError' || ac.signal.aborted) {
      aborted = true;
    } else {
      // LLM 错误
      if (!clientClosed) sseSend(res, { type: 'error', error: err.message });
      // 无内容时直接结束
      if (!fullContent) {
        activeStreams.delete(sessionId);
        if (!clientClosed) res.end();
        return;
      }
      // 有部分内容时继续保存（作为正常 done 处理）
    }
  }

  // 保存 AI 回复
  if (aborted && fullContent) {
    fullContent += '\n\n[已中断]';
  }

  if (fullContent) {
    createMessage({ session_id: sessionId, role: 'assistant', content: fullContent });
    touchSession(sessionId);
  }

  // 推送结束事件
  if (!clientClosed) {
    sseSend(res, aborted ? { aborted: true } : { done: true });
  }

  activeStreams.delete(sessionId);

  // TODO T21: memory_recall_start / memory_recall_done

  // 正常完成且有内容时，入队异步任务
  if (!aborted && fullContent) {
    const msgs = getMessagesBySessionId(sessionId, 9999, 0);
    const hasUserMsg = msgs.some((m) => m.role === 'user');

    if (hasUserMsg) {
      const session = getSessionById(sessionId);

      // 优先级 1：生成 summary（不可丢弃，fire-and-forget）
      enqueue(sessionId, () => generateSummary(sessionId), 1).catch(() => {});

      // 优先级 2：生成标题（不可丢弃，仅当 title 为 NULL）
      if (session && !session.title) {
        enqueue(sessionId, () => generateTitle(sessionId), 2)
          .then((title) => {
            if (title && !clientClosed) sseSend(res, { type: 'title_updated', title });
          })
          .catch(() => {})
          .finally(() => {
            if (!clientClosed) res.end();
          });
        return; // 等待标题生成后再关闭连接
      }
    }
  }

  if (!clientClosed) res.end();
}

// ── POST /api/sessions/:sessionId/chat ──

router.post('/:sessionId/chat', async (req, res) => {
  const { sessionId } = req.params;
  const { content, attachments } = req.body;

  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'content is required' });
  }

  const session = getSessionById(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // 保存用户消息
  const userMsg = createMessage({ session_id: sessionId, role: 'user', content });
  touchSession(sessionId);

  // 保存附件（写磁盘 + 更新 DB）
  if (attachments && attachments.length > 0) {
    saveAttachments(userMsg.id, attachments);
  }

  await runStream(sessionId, res);
});

// ── POST /api/sessions/:sessionId/stop ──

router.post('/:sessionId/stop', (req, res) => {
  const { sessionId } = req.params;
  const ac = activeStreams.get(sessionId);
  if (ac) ac.abort();
  res.json({ success: true });
});

// ── POST /api/sessions/:sessionId/regenerate ──

router.post('/:sessionId/regenerate', async (req, res) => {
  const { sessionId } = req.params;
  const { afterMessageId } = req.body;

  if (!afterMessageId) {
    return res.status(400).json({ error: 'afterMessageId is required' });
  }

  const session = getSessionById(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // 保留 afterMessageId 本身，删除之后的所有消息
  deleteMessagesAfter(afterMessageId);

  await runStream(sessionId, res);
});

export default router;
