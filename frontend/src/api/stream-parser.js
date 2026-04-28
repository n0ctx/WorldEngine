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
 *   onChapterTitleUpdated(chapterIndex, title) — 章节标题已更新（写作）
 *   onStateUpdated()            — 状态栏异步更新完成（writing 专有）
 *   onDiaryUpdated()            — 日记异步生成完成（writing 专有）
 */
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
          if (evt.delta !== undefined) callbacks.onDelta?.(evt.delta);
          else if (evt.done) callbacks.onDone?.(evt.assistant ?? null, evt.options ?? [], evt.usage ?? null);
          else if (evt.aborted) callbacks.onAborted?.(evt.assistant ?? null);
          else if (evt.type === 'error') callbacks.onError?.(evt.error);
          else if (evt.type === 'title_updated') callbacks.onTitleUpdated?.(evt.title);
          else if (evt.type === 'user_saved') callbacks.onUserSaved?.(evt.id);
          else if (evt.type === 'memory_recall_start') callbacks.onMemoryRecallStart?.();
          else if (evt.type === 'memory_recall_done') callbacks.onMemoryRecallDone?.(evt);
          else if (evt.type === 'memory_expand_start') callbacks.onMemoryExpandStart?.(evt);
          else if (evt.type === 'memory_expand_done') callbacks.onMemoryExpandDone?.(evt);
          else if (evt.type === 'chapter_title_updated') callbacks.onChapterTitleUpdated?.(evt.chapterIndex, evt.title);
          else if (evt.type === 'state_updated') callbacks.onStateUpdated?.();
          else if (evt.type === 'diary_updated') callbacks.onDiaryUpdated?.();
          else if (evt.type === 'state_rolled_back') callbacks.onStateRolledBack?.();
          else callbacks.onEvent?.(evt);
        } catch {
          // ignore malformed events
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
