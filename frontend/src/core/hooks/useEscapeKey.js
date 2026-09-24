import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isImeComposing } from '../utils/ime.js';

/*
 * 浮层叠放时 Esc 只关最上层。层序取「开始启用时的渲染先后」：父组件先于子组件渲染、
 * 后打开的浮层后渲染，都正好对应视觉上的上下层；effect 的执行顺序是子先父后，不能用。
 * 下拉框等内部控件自己消费了 Esc 时应 preventDefault，这里跳过。
 */
let nextOrder = 0;
const layers = new Set();

function onKeyDown(e) {
  if (e.key !== 'Escape' || e.defaultPrevented || isImeComposing(e)) return;
  let top = null;
  for (const layer of layers) {
    if (!top || layer.order > top.order) top = layer;
  }
  top?.handlerRef.current?.();
}

/**
 * 浮层打开期间按 Esc 调用 onEscape。
 * @param {(() => void) | undefined} onEscape
 * @param {boolean} [enabled=true]
 */
export function useEscapeKey(onEscape, enabled = true) {
  const handlerRef = useRef(onEscape);
  useLayoutEffect(() => {
    handlerRef.current = onEscape;
  });

  const [layerState, setLayerState] = useState(() => ({ enabled, order: nextOrder++ }));
  let order = layerState.order;
  if (layerState.enabled !== enabled) {
    order = nextOrder++;
    setLayerState({ enabled, order });
  }

  useEffect(() => {
    if (!enabled) return undefined;
    const layer = { order, handlerRef };
    layers.add(layer);
    if (layers.size === 1) window.addEventListener('keydown', onKeyDown);
    return () => {
      layers.delete(layer);
      if (layers.size === 0) window.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled, order]);
}
