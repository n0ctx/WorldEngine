import { useEffect, useRef, useState } from 'react';
import { useDanmakuBandStore } from '../state/danmakuBand.js';
import { useMemoryIndicators } from './useMemoryIndicators.js';

export function useConversationPageState() {
  const [pageInfo, setPageInfo] = useState({ totalPages: 1, currentPage: 0 });
  const inputBoxRef = useRef(null);
  const messageListRef = useRef(null);
  const memory = useMemoryIndicators();
  const clearDanmakuBand = useDanmakuBandStore((state) => state.clear);

  useEffect(() => () => clearDanmakuBand(), [clearDanmakuBand]);

  return {
    pageInfo,
    setPageInfo,
    inputBoxRef,
    messageListRef,
    memory,
  };
}
