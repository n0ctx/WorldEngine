import { useImperativeHandle } from 'react';

// MessageList 的命令式接口：追加/替换消息、翻页、冻结选项、贴底
export default function useMessageListHandle(ref, {
  setMessages,
  setPageAnchor,
  lastPageIdxRef,
  listRef,
  messagesRef,
  handleJumpToMessage,
}) {
  useImperativeHandle(ref, () => ({
    appendMessage: (msg) => setMessages((prev) => [...prev, msg]),
    updateMessages: (updater) => setMessages(updater),
    setPage: (idx) => {
      const safe = Number.isFinite(idx) ? Math.max(0, Math.floor(idx)) : 0;
      setPageAnchor({ idx: safe, followLast: safe >= (lastPageIdxRef.current ?? 0) });
    },
    freezeOptions: (frozenOptions, selectedIndex, collapsed) => {
      setMessages((prev) => {
        const idx = [...prev].reverse().findIndex((m) => m.role === 'assistant');
        if (idx === -1) return prev;
        const realIdx = prev.length - 1 - idx;
        const updated = [...prev];
        updated[realIdx] = {
          ...updated[realIdx],
          _options: frozenOptions,
          _selectedOption: selectedIndex,
          _options_collapsed: collapsed,
        };
        return updated;
      });
    },
    scrollToBottom: () => {
      // 外部生成新消息/继续等场景：先切回末页（若不在末页），再滚到底
      setPageAnchor({ idx: 0, followLast: true });
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    },
    scrollPageToBottom: () => {
      // 用户点"跳转到底部"：留在当前页，仅把滚动容器拖到底
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    },
    scrollToMessage: handleJumpToMessage,
    get messagesRef() {
      return messagesRef;
    },
  }));
}
