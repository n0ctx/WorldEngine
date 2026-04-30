import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { variants, transitions } from '../../utils/motion.js';

const MAX_TOASTS = 3;
const DEDUP_MS   = 1500;
const DURATION_MS = 3000;

const TYPE_STYLES = {
  success: 'bg-[var(--we-color-accent)] text-[var(--we-color-text-inverse)]',
  error:   'bg-[var(--we-color-status-danger)] text-[var(--we-color-text-inverse)]',
  warning: 'bg-[var(--we-color-status-warning)] text-[var(--we-color-text-inverse)]',
  info:    'bg-[var(--we-color-status-info)] text-[var(--we-color-text-inverse)]',
};

export default function GlobalToast() {
  const [toasts, setToasts] = useState([]);
  const recentRef = useRef(new Map()); // message → timestamp，去重用

  useEffect(() => {
    function handleToast(event) {
      const { message = '', type = 'success' } = event.detail ?? {};
      if (!message) return;

      const now = Date.now();
      const lastSeen = recentRef.current.get(message);
      if (lastSeen && now - lastSeen < DEDUP_MS) return;
      recentRef.current.set(message, now);

      const id = crypto.randomUUID();
      setToasts((prev) => {
        const next = [...prev, { id, message, type }];
        return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
      });

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, DURATION_MS);
    }

    window.addEventListener('we:toast', handleToast);
    return () => window.removeEventListener('we:toast', handleToast);
  }, []);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[var(--we-z-toast)] flex flex-col items-center gap-2 pointer-events-none">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{    opacity: 0, y: -8, scale: 0.94 }}
            transition={transitions.quick}
            className={`px-4 py-2 rounded-lg text-sm shadow-lg whitespace-nowrap ${TYPE_STYLES[toast.type] ?? TYPE_STYLES.success}`}
          >
            {toast.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
