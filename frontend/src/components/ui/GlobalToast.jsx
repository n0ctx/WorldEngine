import { useEffect, useRef, useState } from 'react';

export default function GlobalToast() {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    function handleToast(event) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setToast({
        message: event.detail?.message ?? '',
        type: event.detail?.type ?? 'success',
      });
      timerRef.current = setTimeout(() => setToast(null), 3000);
    }

    window.addEventListener('we:toast', handleToast);
    return () => {
      window.removeEventListener('we:toast', handleToast);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!toast?.message) return null;

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[var(--we-z-toast)] px-4 py-2 rounded-lg text-sm shadow-lg pointer-events-none ${
        toast.type === 'error'
          ? 'bg-[var(--we-color-status-danger)] text-[var(--we-color-text-inverse)]'
          : 'bg-[var(--we-color-accent)] text-[var(--we-color-text-inverse)]'
      }`}
    >
      {toast.message}
    </div>
  );
}
