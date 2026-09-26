import { useEffect, useMemo, useRef, useState } from 'react';
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
