import { startTransition, useRef, useLayoutEffect, useState, useCallback, useMemo } from 'react';

// 当前页要渲染的消息切片。followLast 时只渲染末尾 windowPages 页，顶部的「加载更早消息」按需扩大窗口；
// 扩大时新增内容向上扩展，保持视口停在原位置。
export default function useRenderWindow(listRef, { messages, pageSize, followLast, currentPage }) {
  const [windowPages, setWindowPages] = useState(1);
  const expandScrollRef = useRef(null);
  const resetWindow = useCallback(() => setWindowPages(1), []);
  const hasEarlierMessages = followLast && messages.length > pageSize * windowPages;
  const pageMessages = useMemo(() => {
    if (messages.length === 0) return messages;
    if (followLast) {
      const start = Math.max(0, messages.length - pageSize * windowPages);
      return messages.slice(start);
    }
    const start = currentPage * pageSize;
    return messages.slice(start, start + pageSize);
  }, [messages, followLast, currentPage, pageSize, windowPages]);
  // 扩大窗口要一次解析整页 Markdown：放进过渡更新分片渲染，渲染期间页面照常走帧
  const loadEarlierMessages = useCallback(() => {
    const el = listRef.current;
    expandScrollRef.current = el ? el.scrollHeight : null;
    startTransition(() => setWindowPages((w) => w + 1));
  }, [listRef]);
  // 在新内容绘制前补回滚动位置，不会先露出新内容顶部再跳回
  useLayoutEffect(() => {
    if (expandScrollRef.current == null) return;
    const prevHeight = expandScrollRef.current;
    expandScrollRef.current = null;
    const el = listRef.current;
    if (el) el.scrollTop += el.scrollHeight - prevHeight;
  }, [pageMessages, listRef]);
  return { pageMessages, hasEarlierMessages, loadEarlierMessages, resetWindow };
}
