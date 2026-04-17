import { useRef, useEffect } from 'react';

/**
 * 场景分隔线（轻量 Fleuron）
 * Props: { symbol }
 * 进入视口时触发从中央向两侧展开动画。
 */
export default function FleuronLine({ symbol = '※' }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('we-fleuron--visible');
          obs.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className="we-chapter-divider">
      <span className="we-fleuron-line" />
      <span className="we-fleuron-symbol">{symbol}</span>
      <span className="we-fleuron-line" />
    </div>
  );
}
