import { useEffectEvent, useLayoutEffect } from 'react';

/**
 * 一段会话的消息换上或加载失败后、绘制前，把滚动容器交给 onSettled（外层用它定台前收放）。
 * 要在贴底之后调用，交出的是贴底后的位置；加载失败时列表没有渲染，交出的是 null。
 */
export default function useSettledNotice(listRef, { stale, loadedSessionId, loadError, onSettled }) {
  const notify = useEffectEvent(() => onSettled?.(listRef.current));
  useLayoutEffect(() => {
    if (!stale || loadError) notify();
  }, [stale, loadedSessionId, loadError]);
}
