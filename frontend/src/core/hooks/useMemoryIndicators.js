import { useCallback, useRef, useState } from 'react';

function stopIndicator(startRef, timerRef, setActive) {
  const elapsed = Date.now() - (startRef.current ?? 0);
  const delay = Math.max(0, 1500 - elapsed);
  timerRef.current = setTimeout(() => setActive(false), delay);
}

// 记忆指示器状态机：召回 / 写入 两段动画 + recallSummary。对话页与写作页共用。
// 每段保证至少展示 1500ms（从 start 时刻计），写入完成 2000ms 后清除 summary。
// 流式回调只调用 start/stop（不读取布尔值），故 hook 暴露这些函数 + 状态值供页面消费。
export function useMemoryIndicators() {
  const [memoryRecalling, setMemoryRecalling] = useState(false);
  const [memoryWriting, setMemoryWriting] = useState(false);
  const [recallSummary, setRecallSummary] = useState(null); // null | { hit }

  const memoryRecallingStartRef = useRef(null);
  const memoryWritingStartRef = useRef(null);
  const memoryWritingRunIdRef = useRef(null);
  const memoryRecallingTimerRef = useRef(null);
  const memoryWritingTimerRef = useRef(null);
  const recallSummaryTimerRef = useRef(null);

  const startMemoryRecalling = useCallback(() => {
    clearTimeout(memoryRecallingTimerRef.current);
    clearTimeout(recallSummaryTimerRef.current);
    memoryRecallingStartRef.current = Date.now();
    setMemoryRecalling(true);
  }, []);
  const stopMemoryRecalling = useCallback(() => {
    stopIndicator(memoryRecallingStartRef, memoryRecallingTimerRef, setMemoryRecalling);
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
    clearTimeout(memoryWritingTimerRef.current);
    clearTimeout(recallSummaryTimerRef.current);
    memoryWritingRunIdRef.current = null;
    setMemoryRecalling(false);
    setMemoryWriting(false);
    setRecallSummary(null);
  }, []);

  return {
    memoryRecalling,
    memoryWriting,
    recallSummary,
    setRecallSummary,
    startMemoryRecalling,
    stopMemoryRecalling,
    startMemoryWriting,
    stopMemoryWriting,
    cancelMemoryWriting,
    clearMemoryState,
  };
}
