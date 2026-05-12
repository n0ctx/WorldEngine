/**
 * 可复用拖拽手柄（Resize Handle）
 *
 * 支持垂直/水平方向，带最小/最大约束，反相模式。
 * 视觉：hover 显示 1px 朱砂色半透明线。
 */

import { useCallback } from 'react';

export default function DragHandle({
  value,
  onChange,
  min = 0,
  max = Infinity,
  orientation = 'vertical',
  inverted = false,
  className = '',
  ariaLabel = '拖动调整大小',
}) {
  const startResize = useCallback(
    (e) => {
      e.preventDefault();
      const isVertical = orientation === 'vertical';
      const startCoord = isVertical ? e.clientX : e.clientY;
      const startValue = value;
      const targetEl = e.currentTarget;
      try {
        targetEl.setPointerCapture?.(e.pointerId);
      } catch {
        /* 不支持时由 document 监听器兜底 */
      }
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = 'none';

      const onMove = (ev) => {
        const currentCoord = isVertical ? ev.clientX : ev.clientY;
        let delta = startCoord - currentCoord;
        if (!inverted) delta = -delta;
        const next = Math.min(Math.max(Math.round(startValue + delta), min), max);
        onChange(next);
      };

      const onUp = (ev) => {
        document.body.style.userSelect = prevUserSelect;
        try {
          targetEl.releasePointerCapture?.(ev.pointerId);
        } catch {
          /* ignore */
        }
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    },
    [value, onChange, min, max, orientation, inverted],
  );

  const isVertical = orientation === 'vertical';

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={ariaLabel}
      onPointerDown={startResize}
      className={`group z-10 touch-none ${isVertical ? 'cursor-ew-resize' : 'cursor-ns-resize'} ${className}`}
    >
      <div
        className={`absolute bg-transparent transition-colors duration-150 group-hover:bg-[var(--we-vermilion)]/40 ${
          isVertical
            ? 'left-1/2 top-0 h-full w-px -translate-x-1/2'
            : 'left-0 top-1/2 h-px w-full -translate-y-1/2'
        }`}
      />
    </div>
  );
}
