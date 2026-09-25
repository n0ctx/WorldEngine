import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * 在 ref 指向的元素之外按下鼠标时调用 onOutside。
 * @param {{ current: Element | null }} ref
 * @param {() => void} onOutside
 */
export function useClickOutside(ref, onOutside) {
  const handlerRef = useRef(onOutside);
  useLayoutEffect(() => {
    handlerRef.current = onOutside;
  });

  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) handlerRef.current();
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [ref]);
}
