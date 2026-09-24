import { useEffect, useState } from 'react';

// 画布类组件滚出视口就停画；环境没有 IntersectionObserver 时按一直可见处理
export function useInViewport(ref) {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== 'function') return undefined;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}
