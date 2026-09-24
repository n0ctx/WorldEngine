/**
 * 可复用拖拽手柄（Resize Handle）
 *
 * 支持垂直/水平方向，带最小/最大约束，反相模式；可聚焦后用方向键调整。
 * 视觉：hover / 聚焦时显示一条细线。
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

  function handleKeyDown(e) {
    const growKey = isVertical ? (inverted ? 'ArrowLeft' : 'ArrowRight') : (inverted ? 'ArrowUp' : 'ArrowDown');
    const shrinkKey = isVertical ? (inverted ? 'ArrowRight' : 'ArrowLeft') : (inverted ? 'ArrowDown' : 'ArrowUp');
    if (e.key !== growKey && e.key !== shrinkKey) return;
    e.preventDefault();
    const step = e.shiftKey ? 64 : 16;
    onChange(Math.min(Math.max(value + (e.key === growKey ? step : -step), min), max));
  }

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={orientation}
      aria-label={ariaLabel}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={Number.isFinite(max) ? max : undefined}
      onPointerDown={startResize}
      onKeyDown={handleKeyDown}
      className={`we-resize-handle we-resize-handle--${orientation} ${className}`}
    />
  );
}
