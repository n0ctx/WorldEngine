import { useCallback } from 'react';

export default function Textarea({ className = '', onMouseDown, ...props }) {
  const handleMouseDown = useCallback((e) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    if (e.clientX >= rect.right - 20 && e.clientY >= rect.bottom - 20) {
      el.style.overflowY = 'hidden';
      const unlock = () => {
        el.style.overflowY = '';
        document.removeEventListener('mouseup', unlock);
      };
      document.addEventListener('mouseup', unlock);
    }
    onMouseDown?.(e);
  }, [onMouseDown]);

  return (
    <textarea
      className={['we-textarea', className].filter(Boolean).join(' ')}
      onMouseDown={handleMouseDown}
      {...props}
    />
  );
}
