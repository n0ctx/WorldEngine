import { useEffect, useState } from 'react';
import { getConfig } from '../api/config.js';
import { useDisplaySettingsStore } from '../state/displaySettings.js';

// 加载全局 config 中与当前页相关的派生设置；监听 we:global-config-updated 热更新。
// token usage / model pricing 直接写入 displaySettings store。
//
// writing 模式优先读 c.writing.* 字段，缺省回落到全局同名字段；
// 模型计价两种模式各存各的（顶栏按当前页取用）。
export function usePageConfig(mode = 'chat') {
  const isWriting = mode === 'writing';
  const setCurrentModelPricing = useDisplaySettingsStore((s) => s.setCurrentModelPricing);
  const setCurrentWritingModelPricing = useDisplaySettingsStore((s) => s.setCurrentWritingModelPricing);
  const setShowTokenUsage = useDisplaySettingsStore((s) => s.setShowTokenUsage);
  const setPricing = isWriting ? setCurrentWritingModelPricing : setCurrentModelPricing;

  const [ltmEnabled, setLtmEnabled] = useState(false);
  const [tableMemoryEnabled, setTableMemoryEnabled] = useState(false);
  const [chapterTurnSize, setChapterTurnSize] = useState(20);
  const [pageTurnSize, setPageTurnSize] = useState(50);

  useEffect(() => {
    const load = () => getConfig().then((c) => {
      const scoped = isWriting ? (c.writing ?? {}) : c;
      setShowTokenUsage(c.ui?.show_token_usage === true);
      setPricing((isWriting ? c.writing?.llm : c.llm)?.model_pricing ?? null);
      setLtmEnabled(scoped.long_term_memory_enabled === true);
      setTableMemoryEnabled(scoped.table_memory_enabled === true);
      setChapterTurnSize(scoped.chapter_turn_size ?? c.chapter_turn_size ?? 20);
      setPageTurnSize(scoped.page_turn_size ?? c.page_turn_size ?? 50);
    });
    load();
    window.addEventListener('we:global-config-updated', load);
    return () => window.removeEventListener('we:global-config-updated', load);
  }, [isWriting, setPricing, setShowTokenUsage]);

  return { ltmEnabled, tableMemoryEnabled, chapterTurnSize, pageTurnSize };
}
