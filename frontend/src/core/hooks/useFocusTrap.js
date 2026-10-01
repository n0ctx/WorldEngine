import { useCallback, useEffect } from 'react';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * 把键盘焦点圈在 ref 指向的浮层里：挂载时焦点落进浮层（里面已有 autoFocus 的元素就不动），
 * Tab / Shift+Tab 在首尾之间循环，卸载时把焦点还给打开前的元素。
 * 返回的 onKeyDown 挂在浮层根节点上；浮层根节点要能接收焦点（tabIndex={-1}）。
 * 焦点不在浮层里时不干预（挂在 body 上的下拉列表自己处理键盘）；内层浮层已处理的 Tab 外层跳过。
 * @param {{ current: HTMLElement | null }} ref
 * @param {boolean} [enabled=true]
 */
export function useFocusTrap(ref, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const previous = document.activeElement;
    const node = ref.current;
    if (node && !node.contains(document.activeElement)) node.focus({ preventScroll: true });
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, [ref, enabled]);

  return useCallback((e) => {
    if (!enabled || e.key !== 'Tab' || e.defaultPrevented) return;
    const node = ref.current;
    const active = document.activeElement;
    if (!node || (active !== node && !node.contains(active))) return;
    const items = [...node.querySelectorAll(FOCUSABLE)];
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (active === first || active === node)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }, [ref, enabled]);
}
