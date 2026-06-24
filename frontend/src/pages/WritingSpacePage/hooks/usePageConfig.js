import { useEffect, useState } from 'react';
import { getConfig } from '../../../core/api/config.js';
import { useDisplaySettingsStore } from '../../../core/state/displaySettings.js';

// 加载全局 config 中与 writing 页相关的派生设置；监听 we:global-config-updated 热更新。
// writing 优先读 c.writing.* 字段，缺省回落到全局同名字段，与原 WritingSpacePage 行为一致。
export function usePageConfig() {
  const setCurrentWritingModelPricing = useDisplaySettingsStore((s) => s.setCurrentWritingModelPricing);
  const setShowTokenUsage = useDisplaySettingsStore((s) => s.setShowTokenUsage);

  const [ltmEnabled, setLtmEnabled] = useState(false);
  const [tableMemoryEnabled, setTableMemoryEnabled] = useState(false);
  const [chapterTurnSize, setChapterTurnSize] = useState(20);
  const [pageTurnSize, setPageTurnSize] = useState(50);

  useEffect(() => {
    const load = () => getConfig().then((c) => {
      setShowTokenUsage(c.ui?.show_token_usage === true);
      const writingModel = c.writing?.llm?.model_pricing ?? null;
      setCurrentWritingModelPricing(writingModel);
      setLtmEnabled(c.writing?.long_term_memory_enabled === true);
      setTableMemoryEnabled(c.writing?.table_memory_enabled === true);
      setChapterTurnSize(c.writing?.chapter_turn_size ?? c.chapter_turn_size ?? 20);
      setPageTurnSize(c.writing?.page_turn_size ?? c.page_turn_size ?? 50);
    });
    load();
    window.addEventListener('we:global-config-updated', load);
    return () => window.removeEventListener('we:global-config-updated', load);
  }, [setCurrentWritingModelPricing, setShowTokenUsage]);

  return { ltmEnabled, tableMemoryEnabled, chapterTurnSize, pageTurnSize };
}
