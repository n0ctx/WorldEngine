import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { getMessages } from '../../core/api/sessions.js';
import { log } from '../../core/utils/logger.js';

// 会话消息的加载态：切换 session（或重试）时重置分页锚点、拉取消息、标注历史选项
export default function useSessionMessages({ sessionId, onMessagesLoaded, setPageAnchor }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const messagesRef = useRef([]);
  const scrollToLatestPendingRef = useRef(false);
  const handleMessagesLoaded = useEffectEvent((hydrated) => {
    onMessagesLoaded?.(hydrated);
  });
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // 初始加载
  useEffect(() => {
    let cancelled = false;
    // 切换 session 必须重置翻页锚点，避免沿用旧会话的页码停在中间历史；与异步加载耦合，无法外提
    setPageAnchor({ idx: 0, followLast: true });

    if (!sessionId) {
      const timeoutId = setTimeout(() => {
        if (cancelled) return;
        setMessages([]);
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
      setLoading(true);
      setLoadError(null);
      setMessages([]);

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
        setMessages(hydrated);
        setLoading(false);
        handleMessagesLoaded(hydrated);
      } catch (err) {
        if (!cancelled) {
          setLoading(false);
          setLoadError('消息加载失败，请重试');
          log.error('chat.messages.load_failed', err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, reloadToken, setPageAnchor]);

  return {
    messages,
    setMessages,
    loading,
    loadError,
    reload: () => setReloadToken((token) => token + 1),
    messagesRef,
    scrollToLatestPendingRef,
  };
}
