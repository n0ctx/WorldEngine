/* 墨流包的畸变：字像隔着一层被扰动的水面，挂载时水面最乱，随后平静下来。
 * 每个实例一枚 SVG 位移滤镜，强度从 strength 回落到 0；平静后撤掉滤镜，不留常驻开销。
 * 外层 span 始终保留：换掉它会让里面的文字重新挂载，入场动画再播一遍。 */
import { useEffect, useId, useRef, useState } from 'react';
import { animate } from 'framer-motion';

export default function InkWarp({ strength = 14, duration = 0.9, children }) {
  const filterId = `we-ink-warp-${useId().replace(/:/g, '')}`;
  const displaceRef = useRef(null);
  const noiseRef = useRef(null);
  const [calm, setCalm] = useState(false);

  useEffect(() => {
    const warp = animate(1, 0, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (t) => {
        displaceRef.current?.setAttribute('scale', String(strength * t));
        noiseRef.current?.setAttribute('baseFrequency', `${0.012 + 0.02 * t} ${0.06 + 0.05 * t}`);
      },
      onComplete: () => setCalm(true),
    });
    return () => warp.stop();
  }, [strength, duration]);

  return (
    <span className="we-ink-warp" style={calm ? undefined : { filter: `url(#${filterId})` }}>
      {!calm && (
        <svg className="we-ink-warp__defs" aria-hidden="true" focusable="false">
          <filter id={filterId} x="-10%" y="-40%" width="120%" height="180%">
            <feTurbulence ref={noiseRef} type="fractalNoise" baseFrequency="0.032 0.11" numOctaves="2" seed="7" />
            <feDisplacementMap ref={displaceRef} in="SourceGraphic" scale={strength} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
      )}
      {children}
    </span>
  );
}
