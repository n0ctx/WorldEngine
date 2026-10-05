import { startTransition, useRef, useEffect, useLayoutEffect, useState, useCallback, useMemo, useImperativeHandle, useEffectEvent } from 'react';
import { getMessages } from '../../core/api/sessions.js';
import { log } from '../../core/utils/logger.js';
import useSettledNotice from './useSettledNotice.js';

// 按消息的顶部留白定位到列表顶部
function scrollToMessageIn(list, messageId) {
  if (!list || !messageId) return;
  const target = list.querySelector(`[data-message-id="${CSS.escape(String(messageId))}"]`);
  if (!target) return;
  const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  const top = target.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop - margin;
  list.scrollTo({ top, behavior: 'smooth' });
}

// MessageList 的消息加载、翻页与滚动定位，以及对外的命令式接口
export default function useMessageListState(ref, {
  sessionId,
  onMessagesLoaded,
  pageTurnSize,
  onPageInfoChange,
  onSettled,
  generating,
  continuingMessageId,
  streamingText,
  continuingText,
}) {
  const [messages, setMessages] = useState([]);
  // messages 所属的会话；与 sessionId 不同说明新会话的消息还没到，正在显示的是上一个会话
  const [loadedSessionId, setLoadedSessionId] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const stale = Boolean(sessionId) && loadedSessionId !== sessionId;
  const [reloadToken, setReloadToken] = useState(0);
  // 翻页锚点：followLast=true 永远跟随末页（新消息到来时自动追随）；用户手动翻页后 followLast=false 停在固定页
  const [pageAnchor, setPageAnchor] = useState({ idx: 0, followLast: true });
  const listRef = useRef(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const scrollToLatestPendingRef = useRef(false);
  const messagesRef = useRef([]);
  const lastPageIdxRef = useRef(0);
  const handleMessagesLoaded = useEffectEvent((hydrated) => {
    onMessagesLoaded?.(hydrated);
  });
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const handleJumpToMessage = useCallback((messageId) => scrollToMessageIn(listRef.current, messageId), []);

  // 翻页：按 pageTurnSize*2 条切片，每次只渲染当前页消息（不是滚动）
  const pageSize = useMemo(() => {
    const turn = Number(pageTurnSize);
    return (Number.isFinite(turn) && turn > 0 ? Math.floor(turn) : 50) * 2;
  }, [pageTurnSize]);
  const totalPages = Math.max(1, Math.ceil(messages.length / pageSize));
  const lastPageIdx = totalPages - 1;
  const currentPage = pageAnchor.followLast ? lastPageIdx : Math.min(pageAnchor.idx, lastPageIdx);
  const pageMessages = useMemo(
    () => messages.slice(currentPage * pageSize, (currentPage + 1) * pageSize),
    [messages, currentPage, pageSize],
  );

  // 加载会话消息。切换会话时旧会话的消息留在原处，新消息到达后与翻页锚点一起整体换上，
  // 中间不出现空白或骨架；翻页锚点必须随之重置，避免沿用旧会话的页码停在中间历史
  useEffect(() => {
    let cancelled = false;

    if (!sessionId) {
      const timeoutId = setTimeout(() => {
        if (cancelled) return;
        setPageAnchor({ idx: 0, followLast: true });
        setMessages([]);
        setLoadedSessionId(null);
        setLoadError(null);
      }, 0);
      return () => {
        cancelled = true;
        clearTimeout(timeoutId);
      };
    }

    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoadError(null);

      try {
        const msgs = await getMessages(sessionId);
        if (cancelled) return;
        const hydrated = msgs.map((m) => (
          m.role === 'assistant' && Array.isArray(m.next_options) && m.next_options.length > 0
            ? { ...m, _options: m.next_options, _options_collapsed: true }
            : m
        ));
        // 全量加载完毕：定位到最后一条消息（由下方渲染后的 effect 执行）
        scrollToLatestPendingRef.current = hydrated.length > 0;
        // 长会话一次要解析整页 Markdown：放进过渡更新分片渲染，期间旧内容与侧栏动效照常走帧，渲染完再一起换上
        startTransition(() => {
          setPageAnchor({ idx: 0, followLast: true });
          setMessages(hydrated);
          setLoadedSessionId(sessionId);
          handleMessagesLoaded(hydrated);
        });
      } catch (err) {
        if (!cancelled) {
          setMessages([]);
          setLoadedSessionId(null);
          setLoadError('消息加载失败，请重试');
          log.error('chat.messages.load_failed', err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, reloadToken]);


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
    scrollToMessage: handleJumpToMessage,
    get messagesRef() {
      return messagesRef;
    },
  }));

  // 离底部超过三分之一屏才算「离开底部」，贴底附近的小幅滚动不浮出回到底部按钮
  const syncAwayFromBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setAwayFromBottom(el.scrollHeight - el.scrollTop - el.clientHeight > el.clientHeight / 3);
  }, []);
  // 内容变长（翻页、流式输出、续写）不会触发 scroll 事件，需要另外重算
  useEffect(() => {
    syncAwayFromBottom();
  }, [pageMessages, streamingText, continuingText, syncAwayFromBottom]);

  // 回到底部：留在当前页，仅把滚动容器拖到底
  const scrollPageToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const notifyPageInfo = useEffectEvent((info) => onPageInfoChange?.(info));
  useEffect(() => {
    lastPageIdxRef.current = lastPageIdx;
    notifyPageInfo({ totalPages, currentPage });
  }, [totalPages, currentPage, lastPageIdx]);
  const onLastPage = currentPage === lastPageIdx;

  // 生成新一轮（流式 / 继续写）时强制跟随末页，避免用户停在旧页时新消息看不见
  // 同步外部生成状态到分页锚点，属 effect 合法用途；规则误报，显式豁免
  useEffect(() => {
    if (generating || continuingMessageId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPageAnchor((prev) => (prev.followLast ? prev : { idx: 0, followLast: true }));
    }
  }, [generating, continuingMessageId]);

  // 翻页后一律贴顶（包括末页），从该页第一条开始读。贴底场景由 scrollToBottom imperative 显式处理（初次加载、流式结束、用户点跳底按钮）。
  // 加载会同时把页码切到末页，看到待贴底标记就跳过，交给下方贴底；两者都在绘制前执行，不会先露出页顶再跳
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || scrollToLatestPendingRef.current) return;
    el.scrollTop = 0;
  }, [currentPage]);

  // 加载完贴底：在加载结果绘制前执行
  useLayoutEffect(() => {
    if (!scrollToLatestPendingRef.current || pageMessages.length === 0) return;
    scrollToLatestPendingRef.current = false;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [pageMessages]);

  // 放在贴底之后：交出的是贴底后的位置
  useSettledNotice(listRef, { stale, loadedSessionId, loadError, onSettled });

  return {
    listRef,
    messages,
    loadedSessionId,
    loading: stale && loadedSessionId === null && !loadError,
    stale,
    loadError,
    reload: () => setReloadToken((token) => token + 1),
    pageMessages,
    onLastPage,
    onFirstPage: currentPage === 0,
    handleJumpToMessage,
    awayFromBottom,
    syncAwayFromBottom,
    scrollPageToBottom,
  };
}
