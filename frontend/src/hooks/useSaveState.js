import { useState, useRef, useCallback } from 'react';

/**
 * 统一保存按钮状态管理 hook（适用于保存后留在页面的场景）
 * 状态流：idle → saving → saved（1.5s）→ idle
 */
export function useSaveState() {
  const [status, setStatus] = useState('idle'); // 'idle' | 'saving' | 'saved'
  const timerRef = useRef(null);

  const run = useCallback(async (fn) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus('saving');
    try {
      await fn();
      setStatus('saved');
      timerRef.current = setTimeout(() => setStatus('idle'), 1500);
    } catch (e) {
      setStatus('idle');
      throw e;
    }
  }, []);

  return {
    saving: status === 'saving',
    saved: status === 'saved',
    run,
  };
}
