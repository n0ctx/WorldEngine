import { useMemo } from 'react';
import { needsTrailingCaret, parseStreamingBlocks } from '../../core/utils/think-blocks.js';

export function useMessageBlocks(content, showThinking, showCaret, isStreaming) {
  const blocks = useMemo(
    () => parseStreamingBlocks(content, { isStreaming }),
    [content, isStreaming],
  );
  const trailingCaret = showCaret && isStreaming && needsTrailingCaret(blocks, showThinking);
  return { blocks, trailingCaret };
}
