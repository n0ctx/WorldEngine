import { useState } from 'react';

// 正文往下滚过这么多就把大台前收起
const COMPACT_AT = 24;

/**
 * 台前收放跟着正文滚动：滚离顶部收起；回到顶部、且展开后正文仍能滚动时才展开。
 * 收起会让正文区变高，内容刚好放得下时滚动条消失、scrollTop 归零——这时保持收起，免得展开、收起来回跳。
 * onScroll 挂到正文滚动容器上（MessageList 的 onScroll）。
 * onSettled 挂到 MessageList 的 onSettled：一段会话的消息换上并贴底后、绘制前，按此刻的位置直接定收放（instant，不走过渡）。
 * 第一次定下来之前 settled 为 false，台前只占位不露面，长会话进来不会先露出大台前再收起。
 */
export default function useStageCompact() {
  const [stage, setStage] = useState({ compact: false, settled: false, instant: false });
  const onScroll = (event) => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    setStage((prev) => {
      const compact = prev.compact ? !(scrollTop <= 0 && scrollHeight > clientHeight) : scrollTop > COMPACT_AT;
      return compact === prev.compact && !prev.instant ? prev : { compact, settled: true, instant: false };
    });
  };
  const onSettled = (list) => {
    setStage({ compact: Boolean(list && list.scrollTop > COMPACT_AT), settled: true, instant: true });
  };
  return { ...stage, onScroll, onSettled };
}
