import { useCallback } from 'react';

export default function Textarea({ className = '', onMouseDown, ...props }) {
  const handleMouseDown = useCallback((e) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    // 仅在 mousedown 起点落在右下角 resize 手柄区域时挂观察器；
    // ResizeObserver.observe() 会立刻投递一次初始回调，普通点击聚焦时挂上来就会被错误地置为 overflow-y:hidden，
    // 让 textarea 自身滚动条在点击后消失。
    if (e.clientX >= rect.right - 20 && e.clientY >= rect.bottom - 20) {
      let primed = false;
      const observer = new ResizeObserver(() => {
        if (!primed) { primed = true; return; }
        el.style.overflowY = 'hidden';
      });
      observer.observe(el);
      // 必须挂捕获阶段：祖先 DialogShell 的 React onMouseUp 调了 stopPropagation，
      // React 17+ 在 root 容器代理事件，会把 native 冒泡也截断，document 的 bubble 监听器永远收不到 mouseup，
      // overflow-y:hidden 就会卡死，resize 完成后 textarea 滚动条再也不出来。
      const unlock = () => {
        observer.disconnect();
        el.style.overflowY = '';
        document.removeEventListener('mouseup', unlock, true);
      };
      document.addEventListener('mouseup', unlock, true);
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
