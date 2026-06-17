import { useEffect, useState } from 'react';
import { getConfig } from '../../../core/api/config.js';
import { useDisplaySettingsStore } from '../../../core/state/displaySettings.js';

// 加载全局 config 中与 chat 页相关的派生设置；监听 we:global-config-updated 热更新。
// token usage / model pricing 直接写入 displaySettings store，与原 ChatPage 行为一致。
export function usePageConfig() {
  const setCurrentModelPricing = useDisplaySettingsStore((s) => s.setCurrentModelPricing);
  const setShowTokenUsage = useDisplaySettingsStore((s) => s.setShowTokenUsage);

  const [ltmEnabled, setLtmEnabled] = useState(false);
  const [chapterTurnSize, setChapterTurnSize] = useState(20);
  const [pageTurnSize, setPageTurnSize] = useState(50);

  useEffect(() => {
    const load = () => getConfig().then((c) => {
      setShowTokenUsage(c.ui?.show_token_usage === true);
      setCurrentModelPricing(c.llm?.model_pricing ?? null);
      setLtmEnabled(c.long_term_memory_enabled === true);
      setChapterTurnSize(c.chapter_turn_size ?? 20);
      setPageTurnSize(c.page_turn_size ?? 50);
    });
    load();
    window.addEventListener('we:global-config-updated', load);
    return () => window.removeEventListener('we:global-config-updated', load);
  }, [setCurrentModelPricing, setShowTokenUsage]);

  return { ltmEnabled, chapterTurnSize, pageTurnSize };
}
