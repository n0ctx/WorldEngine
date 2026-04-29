import { useCallback } from 'react';

export default function Textarea({ className = '', onMouseDown, ...props }) {
  const handleMouseDown = useCallback((e) => {
    const el = e.currentTarget;
    const observer = new ResizeObserver(() => {
      el.style.overflowY = 'hidden';
    });
    observer.observe(el);
    const unlock = () => {
      observer.disconnect();
      el.style.overflowY = '';
      document.removeEventListener('mouseup', unlock);
    };
    document.addEventListener('mouseup', unlock);
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
