import { useCallback, useRef, useState } from 'react';

// 记忆指示器状态机：召回 / 扩展 / 写入 三段动画 + recallSummary。
// 每段保证至少展示 1500ms（从 start 时刻计），写入完成 2000ms 后清除 summary。
// 流式回调只调用 start/stop（不读取布尔值），故 hook 暴露这些函数 + 状态值供页面消费。
export function useMemoryIndicators() {
  const [memoryRecalling, setMemoryRecalling] = useState(false);
  const [memoryExpanding, setMemoryExpanding] = useState(false);
  const [memoryWriting, setMemoryWriting] = useState(false);
  const [recallSummary, setRecallSummary] = useState(null); // null | { recalled, expanded }

  const memoryRecallingStartRef = useRef(null);
  const memoryExpandingStartRef = useRef(null);
  const memoryWritingStartRef = useRef(null);
  const memoryWritingRunIdRef = useRef(null);
  const memoryRecallingTimerRef = useRef(null);
  const memoryExpandingTimerRef = useRef(null);
  const memoryWritingTimerRef = useRef(null);
  const recallSummaryTimerRef = useRef(null);

  const startMemoryRecalling = useCallback(() => {
    clearTimeout(memoryRecallingTimerRef.current);
    clearTimeout(recallSummaryTimerRef.current);
    memoryRecallingStartRef.current = Date.now();
    setMemoryRecalling(true);
  }, []);
  const stopMemoryRecalling = useCallback(() => {
    const elapsed = Date.now() - (memoryRecallingStartRef.current ?? 0);
    const delay = Math.max(0, 1500 - elapsed);
    memoryRecallingTimerRef.current = setTimeout(() => setMemoryRecalling(false), delay);
  }, []);

  const startMemoryExpanding = useCallback(() => {
    clearTimeout(memoryExpandingTimerRef.current);
    memoryExpandingStartRef.current = Date.now();
    setMemoryExpanding(true);
  }, []);
  const stopMemoryExpanding = useCallback(() => {
    const elapsed = Date.now() - (memoryExpandingStartRef.current ?? 0);
    const delay = Math.max(0, 1500 - elapsed);
    memoryExpandingTimerRef.current = setTimeout(() => setMemoryExpanding(false), delay);
  }, []);

  const startMemoryWriting = useCallback((runId = null) => {
    clearTimeout(memoryWritingTimerRef.current);
    memoryWritingRunIdRef.current = runId;
    memoryWritingStartRef.current = Date.now();
    setMemoryWriting(true);
  }, []);
  const stopMemoryWriting = useCallback((runId = null) => {
    if (runId !== null && memoryWritingRunIdRef.current !== runId) return;
    const elapsed = Date.now() - (memoryWritingStartRef.current ?? 0);
    const delay = Math.max(0, 1500 - elapsed);
    memoryWritingTimerRef.current = setTimeout(() => {
      if (runId !== null && memoryWritingRunIdRef.current !== runId) return;
      memoryWritingRunIdRef.current = null;
      setMemoryWriting(false);
      clearTimeout(recallSummaryTimerRef.current);
      recallSummaryTimerRef.current = setTimeout(() => setRecallSummary(null), 2000);
    }, delay);
  }, []);

  // onAborted 路径：立即取消写入指示，不走 stop 的延迟收尾。
  const cancelMemoryWriting = useCallback(() => {
    clearTimeout(memoryWritingTimerRef.current);
    memoryWritingRunIdRef.current = null;
    setMemoryWriting(false);
  }, []);

  // 切换会话 / 清空活动会话时整体复位。
  const clearMemoryState = useCallback(() => {
    clearTimeout(memoryRecallingTimerRef.current);
    clearTimeout(memoryExpandingTimerRef.current);
    clearTimeout(memoryWritingTimerRef.current);
    clearTimeout(recallSummaryTimerRef.current);
    memoryWritingRunIdRef.current = null;
    setMemoryRecalling(false);
    setMemoryExpanding(false);
    setMemoryWriting(false);
    setRecallSummary(null);
  }, []);

  return {
    memoryRecalling,
    memoryExpanding,
    memoryWriting,
    recallSummary,
    setRecallSummary,
    startMemoryRecalling,
    stopMemoryRecalling,
    startMemoryExpanding,
    stopMemoryExpanding,
    startMemoryWriting,
    stopMemoryWriting,
    cancelMemoryWriting,
    clearMemoryState,
  };
}
