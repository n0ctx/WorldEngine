import { useEffect, useEffectEvent, useMemo, useRef } from 'react';

// 翻页：按 pageTurnSize*2 条切片，每次只渲染当前页消息（不是滚动）
export default function useMessagePaging({
  messages,
  pageAnchor,
  setPageAnchor,
  pageTurnSize,
  onPageInfoChange,
  generating,
  continuingMessageId,
  scrollToLatestPendingRef,
  listRef,
}) {
  const lastPageIdxRef = useRef(0);
  const pageSize = useMemo(() => {
    const turn = Number(pageTurnSize);
    return (Number.isFinite(turn) && turn > 0 ? Math.floor(turn) : 50) * 2;
  }, [pageTurnSize]);
  const totalPages = Math.max(1, Math.ceil(messages.length / pageSize));
  const lastPageIdx = totalPages - 1;
  const currentPage = pageAnchor.followLast ? lastPageIdx : Math.min(pageAnchor.idx, lastPageIdx);
  const notifyPageInfo = useEffectEvent((info) => onPageInfoChange?.(info));
  useEffect(() => {
    lastPageIdxRef.current = lastPageIdx;
    notifyPageInfo({ totalPages, currentPage });
  }, [totalPages, currentPage, lastPageIdx]);
  const pageMessages = useMemo(() => {
    if (messages.length === 0) return messages;
    const start = currentPage * pageSize;
    return messages.slice(start, start + pageSize);
  }, [messages, currentPage, pageSize]);
  const onLastPage = currentPage === lastPageIdx;

  // 生成新一轮（流式 / 继续写）时强制跟随末页，避免用户停在旧页时新消息看不见
  useEffect(() => {
    if (generating || continuingMessageId) {
      setPageAnchor((prev) => (prev.followLast ? prev : { idx: 0, followLast: true }));
    }
  }, [generating, continuingMessageId, setPageAnchor]);

  // 初次加载贴底：等加载结果渲染后在下一帧执行。长会话加载会同时把页码从 0 切到末页，
  // 下方「翻页贴顶」看到待贴底标记会跳过，避免两者按帧先后互相覆盖。
  useEffect(() => {
    if (!scrollToLatestPendingRef.current || pageMessages.length === 0) return;
    requestAnimationFrame(() => {
      scrollToLatestPendingRef.current = false;
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [pageMessages, listRef, scrollToLatestPendingRef]);

  // 翻页后一律贴顶（包括末页），从该页第一条开始读。贴底场景由 scrollToBottom imperative 显式处理（初次加载、流式结束、用户点跳底按钮）。
  useEffect(() => {
    const el = listRef.current;
    if (!el || scrollToLatestPendingRef.current) return;
    requestAnimationFrame(() => {
      const node = listRef.current;
      if (!node) return;
      node.scrollTop = 0;
    });
  }, [currentPage, listRef, scrollToLatestPendingRef]);

  return { pageSize, totalPages, lastPageIdx, currentPage, pageMessages, onLastPage, lastPageIdxRef };
}
