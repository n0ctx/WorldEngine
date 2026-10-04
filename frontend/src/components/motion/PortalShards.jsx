import { useLayoutEffect, useRef } from 'react';
import { stepShard } from './shatter.js';

/**
 * 拆版的碎块（shatter.js 切出来的）：挂在转场遮罩里，带重力往下掉，在底边弹一下，
 * 底边随后撤掉、全部掉出画面。每帧直接写 transform，不经过 React。样式见 themes/motion/<包>.css 的 .we-portal-shard。
 */
const MAX_STEP = 0.05;
const place = (body) => `translate(${body.x}px, ${body.y}px) rotate(${body.r}deg)`;

export default function PortalShards({ shards }) {
  const rootRef = useRef(null);
  const nodes = useRef([]);

  // 先于绘制把视口坐标换算到自己的位置上，碎块第一帧就落在卡片原处
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const box = root.getBoundingClientRect();
    const bodies = shards.map((shard) => ({ ...shard, x: shard.x - box.left, y: shard.y - box.top, r: 0 }));
    bodies.forEach((body, i) => { if (nodes.current[i]) nodes.current[i].style.transform = place(body); });
    let frame = 0;
    let last = 0;
    let t = 0;
    function tick(now) {
      const dt = last ? Math.min((now - last) / 1000, MAX_STEP) : 0;
      last = now;
      t += dt;
      let falling = false;
      bodies.forEach((body, i) => {
        stepShard(body, t, dt, box.height);
        if (body.y < box.height) falling = true;
        const node = nodes.current[i];
        if (node) node.style.transform = place(body);
      });
      if (falling) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [shards]);

  return (
    <div ref={rootRef} className="we-portal-shards" aria-hidden="true">
      {shards.map((shard, i) => (
        <span
          // 碎块切出来就不再增删，位置就是身份
          key={`${shard.kind}-${i}`}
          ref={(node) => { nodes.current[i] = node; }}
          className={`we-portal-shard we-portal-shard--${shard.kind}`}
          style={{ ...shard.style, width: shard.w, height: shard.h }}
        >
          {shard.ch}
        </span>
      ))}
    </div>
  );
}
