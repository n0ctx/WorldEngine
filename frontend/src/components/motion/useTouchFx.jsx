/* 触点反馈：把指针在元素里的位置写进 --mx / --my，按下时在触点放一圈涟漪。
 * 光晕跟不跟着指针、涟漪长什么样，都由动效包的 CSS 按所在元素决定（.we-touch-fx / .we-touch-fx__ripple）；
 * 宿主元素要 position: relative，把返回的 fx 放进去。减少动态效果时只记位置，不放涟漪。 */
import { useRef, useState } from 'react';
import { useMotion } from '../../core/hooks/useMotion.js';

export function setTouchPoint(event) {
  const el = event.currentTarget;
  const box = el.getBoundingClientRect();
  const point = { x: event.clientX - box.left, y: event.clientY - box.top };
  el.style.setProperty('--mx', `${point.x}px`);
  el.style.setProperty('--my', `${point.y}px`);
  return point;
}

export function clearTouchPoint(event) {
  event.currentTarget.style.removeProperty('--mx');
  event.currentTarget.style.removeProperty('--my');
}

// 调用方自己的 onPointerDown / onPointerMove 一并传进来，返回合成后的处理函数
export function useTouchFx({ onPointerDown, onPointerMove } = {}) {
  const { reduced } = useMotion();
  const [ripples, setRipples] = useState([]);
  const seq = useRef(0);

  const handlers = {
    onPointerMove: (event) => {
      setTouchPoint(event);
      onPointerMove?.(event);
    },
    onPointerDown: (event) => {
      // 位置要在这里取出来：更新函数会延后执行，那时 event.currentTarget 已被清空
      const point = setTouchPoint(event);
      if (!reduced) {
        seq.current += 1;
        const ripple = { id: seq.current, ...point };
        setRipples((list) => [...list.slice(-2), ripple]);
      }
      onPointerDown?.(event);
    },
  };

  const settle = (id) => setRipples((list) => list.filter((ripple) => ripple.id !== id));
  const fx = (
    <span className="we-touch-fx" aria-hidden="true">
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          className="we-touch-fx__ripple"
          style={{ '--rx': `${ripple.x}px`, '--ry': `${ripple.y}px` }}
          onAnimationEnd={() => settle(ripple.id)}
        />
      ))}
    </span>
  );

  return { handlers, fx };
}
