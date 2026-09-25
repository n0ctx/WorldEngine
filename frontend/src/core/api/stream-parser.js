import { log } from '../utils/logger.js';
import { publishProviderSafetySignal } from './provider-safety-events.js';

/**
 * 解析 SSE 流，分发事件到对应回调
 *
 * 支持的 callbacks 字段（均为可选）：
 *   onDelta(delta)              — 流式文本增量
 *   onDone(assistant, options, usage) — 生成完成
 *   onAborted(assistant)        — 生成被中断
 *   onError(error)              — 错误
 *   onTitleUpdated(title)       — 会话标题已更新
 *   onUserSaved(id)             — 用户消息已保存，id 为真实 id（替换前端 tempId）
 *   onMemoryRecallStart()       — 向量召回开始
 *   onMemoryRecallDone(evt)     — 向量召回完成
 *   onMemoryExpandStart(evt)    — 记忆展开开始
 *   onMemoryExpandDone(evt)     — 记忆展开完成
 *   onSavedRecallDone(evt)      — saved nearby 角色召回判定完成；evt.ids 为本轮应展开的角色 id 列表，evt.mode 为 'judge'|'all-in'
 *   onChapterTitleUpdated(chapterIndex, title) — 章节标题已更新（写作）
 *   onStateQueued()             — 状态栏整理 LLM 开始调用（整理中出现时机）
 *   onStateUpdated()            — 状态栏异步更新完成
 *   onStateUpdateFailed(evt)    — 状态栏更新失败，evt.error 为错误信息
 *   onPostprocessFailed(evt)    — keep-alive 后处理失败/超时（如标题生成）
 *   onDiaryUpdated()            — 日记异步生成完成（writing 专有）
 *   onSuggestionFallbackStarted(evt) — 选项区缺失或截断，后端触发副模型补选项；evt.mode 为 'fallback'|'continuation'
 *   onSuggestionFallbackSucceeded(evt) — 补选项成功；evt.mode 同上
 *   onSuggestionFallbackFailed(evt) — 补选项失败；evt.mode/evt.reason
 *   onEntriesActivated(entries) — 本轮激活的非常驻条目（运行时展示，不持久化）
 *   onDanmaku(comments)         — 本轮回复后副模型生成的观众弹幕（纯文本数组，前端临时特效）
 */
export async function subscribeSse(url, callbacks, signal) {
  const res = await fetch(url, { method: 'GET', signal });
  await readSseResponse(res, callbacks);
}

/** HTTP 失败时把 body.error（或状态码）交给 onError；成功时解析 SSE 流 */
export async function readSseResponse(res, callbacks) {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    callbacks.onError?.(err.error || `HTTP ${res.status}`);
    return;
  }
  await parseSSEStream(res, callbacks);
}

function dispatchProgressEvent(evt, callbacks) {
  switch (evt.type) {
    case 'memory_recall_start': callbacks.onMemoryRecallStart?.(); break;
    case 'memory_recall_done': callbacks.onMemoryRecallDone?.(evt); break;
    case 'memory_expand_start': callbacks.onMemoryExpandStart?.(evt); break;
    case 'memory_expand_done': callbacks.onMemoryExpandDone?.(evt); break;
    case 'saved_recall_done': callbacks.onSavedRecallDone?.(evt); break;
    case 'state_queued': callbacks.onStateQueued?.(); break;
    case 'state_updated': callbacks.onStateUpdated?.(); break;
    case 'state_update_failed': callbacks.onStateUpdateFailed?.(evt); break;
    case 'postprocess_failed': callbacks.onPostprocessFailed?.(evt); break;
    case 'diary_updated': callbacks.onDiaryUpdated?.(); break;
    case 'suggestion_fallback_started': callbacks.onSuggestionFallbackStarted?.(evt); break;
    case 'suggestion_fallback_succeeded': callbacks.onSuggestionFallbackSucceeded?.(evt); break;
    case 'suggestion_fallback_failed': callbacks.onSuggestionFallbackFailed?.(evt); break;
    case 'state_rolled_back': callbacks.onStateRolledBack?.(); break;
    default: return false;
  }
  return true;
}

function dispatchSessionEvent(evt, callbacks) {
  switch (evt.type) {
    case 'error': callbacks.onError?.(evt.error); break;
    case 'title_updated': callbacks.onTitleUpdated?.(evt.title); break;
    case 'user_saved': callbacks.onUserSaved?.(evt.id); break;
    case 'chapter_title_updated': callbacks.onChapterTitleUpdated?.(evt.chapterIndex, evt.title); break;
    case 'entries_activated': callbacks.onEntriesActivated?.(evt.entries ?? []); break;
    case 'danmaku': callbacks.onDanmaku?.(evt.comments ?? []); break;
    case 'stream_snapshot': callbacks.onStreamSnapshot?.(evt.task ?? null); break;
    default: return false;
  }
  return true;
}

function dispatchSSEEvent(evt, callbacks) {
  if (evt.delta !== undefined) {
    callbacks.onDelta?.(evt.delta);
    return;
  }
  if (evt.done) {
    callbacks.onDone?.(evt.assistant ?? null, evt.options ?? [], evt.usage ?? null);
    return;
  }
  if (evt.aborted) {
    callbacks.onAborted?.(evt.assistant ?? null);
    return;
  }
  if (dispatchProgressEvent(evt, callbacks) || dispatchSessionEvent(evt, callbacks)) return;

  if (evt.type === 'provider_safety_signal') {
    const signal = evt.signal ?? null;
    publishProviderSafetySignal(signal);
    callbacks.onProviderSafetySignal?.(signal);
    return;
  }
  callbacks.onEvent?.(evt);
}

export async function parseSSEStream(response, callbacks) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const json = line.slice(6).trim();
        if (!json) continue;
        try {
          const evt = JSON.parse(json);
          dispatchSSEEvent(evt, callbacks);
        } catch (err) {
          log.warn('sse.malformed_event', {
            message: err?.message || 'Malformed SSE event',
            preview: json.slice(0, 200),
          });
        }
      }
    }
    if (buffer.trim()) {
      log.warn('sse.trailing_buffer', { preview: buffer.trim().slice(0, 200) });
    }
  } finally {
    reader.releaseLock();
  }
}
