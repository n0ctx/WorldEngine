import { useRef, useState } from 'react';

const relativeTo = (event) => {
  const box = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
};

/**
 * 卡片外的触点包装：把指针位置写进 --mx / --my（墨流的光晕追着它走），
 * 按下时在触点放一圈涟漪（墨流洇开），信号锁定的括号只靠 CSS 的 :hover / :active。
 * 只有出样一侧的 CSS 会给它样式，「现在」一侧只多一层不可见的容器。
 */
export default function Touch({ children }) {
  const [ripples, setRipples] = useState([]);
  const seq = useRef(0);

  const track = (event) => {
    const { x, y } = relativeTo(event);
    event.currentTarget.style.setProperty('--mx', `${x}px`);
    event.currentTarget.style.setProperty('--my', `${y}px`);
  };
  const press = (event) => {
    track(event);
    seq.current += 1;
    setRipples((list) => [...list.slice(-2), { id: seq.current, ...relativeTo(event) }]);
  };
  const settle = (id) => setRipples((list) => list.filter((ripple) => ripple.id !== id));

  return (
    <div className="we-sketch-touch" role="presentation" onPointerMove={track} onPointerDown={press}>
      {children}
      <span className="we-sketch-touch__fx" aria-hidden="true">
        {ripples.map((ripple) => (
          <span
            key={ripple.id}
            className="we-sketch-touch__ripple"
            style={{ '--rx': `${ripple.x}px`, '--ry': `${ripple.y}px` }}
            onAnimationEnd={() => settle(ripple.id)}
          />
        ))}
      </span>
    </div>
  );
}
