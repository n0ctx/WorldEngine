import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { needsTrailingCaret, parseStreamingBlocks } from '../../core/utils/think-blocks.js';

export function useMessageBlocks(content, showThinking, showCaret, isStreaming) {
  const blocks = useMemo(
    () => parseStreamingBlocks(content, { isStreaming }),
    [content, isStreaming],
  );
  const trailingCaret = showCaret && isStreaming && needsTrailingCaret(blocks, showThinking);
  return { blocks, trailingCaret };
}

export function useCopyFeedback(getText) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(getText());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return { copied, copy };
}

export function useDeleteConfirmation(onDelete) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef(null);

  function handleClick() {
    if (confirming) {
      clearTimeout(timerRef.current);
      setConfirming(false);
      onDelete();
    } else {
      setConfirming(true);
      timerRef.current = setTimeout(() => setConfirming(false), 2000);
    }
  }

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return { confirming, handleClick };
}

/**
 * 一轮回复的开始与收尾（样式由动效包按 data-moment 接管）：挂载时就在生成的是 'start'；
 * 续写时已有的回复重新进入流式记 'stream'；生成结束后，等正文把剩下的字打完（调用 settle）才记 'end'，每次生成收尾一次。
 * 历史消息为 null，settle 也为 undefined。
 */
export function useLiveMoment(isStreaming) {
  const [live, setLive] = useState({ streaming: isStreaming, moment: isStreaming ? 'start' : null });
  if (live.streaming !== isStreaming) setLive({ streaming: isStreaming, moment: isStreaming ? 'stream' : live.moment });
  const settle = useCallback(() => setLive((prev) => (
    prev.streaming || prev.moment === 'end' ? prev : { ...prev, moment: 'end' }
  )), []);
  return { moment: live.moment, settle: live.moment ? settle : undefined };
}
