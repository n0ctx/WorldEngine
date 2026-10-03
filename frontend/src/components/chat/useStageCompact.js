import { useState } from 'react';

// 正文往下滚过这么多就把大台前收起
const COMPACT_AT = 24;

/**
 * 台前收放跟着正文滚动：滚离顶部收起；回到顶部、且展开后正文仍能滚动时才展开。
 * 收起会让正文区变高，内容刚好放得下时滚动条消失、scrollTop 归零——这时保持收起，免得展开、收起来回跳。
 * onScroll 挂到正文滚动容器上（MessageList 的 onScroll）。
 */
export default function useStageCompact() {
  const [compact, setCompact] = useState(false);
  const onScroll = (event) => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    setCompact((prev) => (prev ? !(scrollTop <= 0 && scrollHeight > clientHeight) : scrollTop > COMPACT_AT));
  };
  return { compact, onScroll };
}
