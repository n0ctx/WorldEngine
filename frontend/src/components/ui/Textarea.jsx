import { useCallback } from 'react';

export default function Textarea({ className = '', onMouseDown, ...props }) {
  const handleMouseDown = useCallback((e) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    if (e.clientX >= rect.right - 16 && e.clientY >= rect.bottom - 16) {
      const saved = el.scrollTop;
      const lock = () => { el.scrollTop = saved; };
      const unlock = () => {
        el.removeEventListener('scroll', lock);
        document.removeEventListener('mouseup', unlock);
      };
      el.addEventListener('scroll', lock);
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
