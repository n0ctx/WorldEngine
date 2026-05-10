import { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import ToastCard from './ToastCard.jsx';

const MAX_TOASTS = 3;
const DEDUP_MS = 1500;
const DURATION_BY_TYPE = { error: 5000, warning: 5000, info: 3000, success: 3000 };

export default function GlobalToast() {
  const [toasts, setToasts] = useState([]);
  const recentRef = useRef(new Map());
  const timersRef = useRef(new Map());

  const stopTimer = useCallback((id) => {
    const tid = timersRef.current.get(id);
    if (tid) {
      clearTimeout(tid);
      timersRef.current.delete(id);
    }
  }, []);

  const startTimer = useCallback((id, type) => {
    const ms = DURATION_BY_TYPE[type] ?? 3000;
    const tid = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timersRef.current.delete(id);
    }, ms);
    timersRef.current.set(id, tid);
  }, []);

  const closeNow = useCallback((id) => {
    stopTimer(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, [stopTimer]);

  useEffect(() => {
    function handle(event) {
      const { message = '', type = 'info', title = '' } = event.detail ?? {};
      if (!message) return;
      const now = Date.now();
      const last = recentRef.current.get(message);
      if (last && now - last < DEDUP_MS) return;
      recentRef.current.set(message, now);

      const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `t-${now}-${Math.random().toString(36).slice(2)}`;

      setToasts((prev) => {
        const next = [...prev, { id, message, type, title }];
        const overflow = next.length - MAX_TOASTS;
        if (overflow > 0) {
          for (let i = 0; i < overflow; i += 1) stopTimer(next[i].id);
          return next.slice(overflow);
        }
        return next;
      });
      startTimer(id, type);
    }
    window.addEventListener('we:toast', handle);
    return () => window.removeEventListener('we:toast', handle);
  }, [startTimer, stopTimer]);

  return (
    <div
      role="region"
      aria-label="通知"
      className="fixed top-4 right-4 z-[var(--we-z-toast)] flex flex-col items-end gap-3 pointer-events-none max-sm:left-2 max-sm:right-2 max-sm:top-2"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <ToastCard
            key={toast.id}
            toast={toast}
            onClose={() => closeNow(toast.id)}
            onMouseEnter={() => stopTimer(toast.id)}
            onMouseLeave={() => startTimer(toast.id, toast.type)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
