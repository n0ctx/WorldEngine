import { useRef } from 'react';

// ── 拖动感知点击 hook ──────────────────────────────────────────────────────

export function useDragAwareClick(onClick) {
  const posRef = useRef(null);

  const onMouseDown = (e) => {
    posRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleClick = (e) => {
    if (!posRef.current) return;
    const dx = e.clientX - posRef.current.x;
    const dy = e.clientY - posRef.current.y;
    posRef.current = null;
    if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
      onClick?.(e);
    }
  };

  // 键盘激活不走拖动判定：Enter / Space 直接触发。
  // 卡片内部的编辑/删除按钮也会冒泡 keydown，用 target 判断挡掉，避免一次按键触发两个动作。
  const onKeyDown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    onClick?.(e);
  };

  return { onMouseDown, onClick: handleClick, onKeyDown };
}
