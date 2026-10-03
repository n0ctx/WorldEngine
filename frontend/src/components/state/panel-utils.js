import { useEffect, useState } from 'react';

import { fetchDiaryContent } from '../../core/api/daily-entries.js';
import useSidePanelsStore from '../../core/state/sidePanels.js';
import { log } from '../../core/utils/logger.js';

export const DIARY_RECENT_LIMIT = 5;

/** 日记按时间倒序切成「最近若干条 + 其余」 */
export function splitDiaryEntries(diaryEntries, limit = DIARY_RECENT_LIMIT) {
  const hasDiary = Array.isArray(diaryEntries) && diaryEntries.length > 0;
  const reversed = hasDiary ? [...diaryEntries].reverse() : [];
  const older = reversed.slice(limit);
  return { hasDiary, recentDiary: reversed.slice(0, limit), olderDiary: older, hasMore: older.length > 0 };
}

/**
 * 日记条目的「点击注入下轮提示词」选择态：再次点击同一条取消注入。
 * 切换会话时清空选择。
 */
export function useDiarySelection(sessionId, onDiaryInject) {
  const [selectedEntry, setSelectedEntry] = useState(null);

  useEffect(() => {
    const timeoutId = setTimeout(() => setSelectedEntry(null), 0);
    return () => clearTimeout(timeoutId);
  }, [sessionId]);

  async function handleDiarySelect(entry) {
    if (selectedEntry?.date_str === entry.date_str) {
      setSelectedEntry(null);
      onDiaryInject?.(null);
      return;
    }
    try {
      const content = await fetchDiaryContent(sessionId, entry.date_str);
      setSelectedEntry(entry);
      onDiaryInject?.(content);
    } catch (e) {
      log.error('diary.fetch_failed', e, { toast: e.message || '获取日记内容失败' });
    }
  }

  return { selectedEntry, handleDiarySelect };
}

/**
 * 正文发来的「定位到某个字段」请求（见 sidePanels 的 stateFocus）：返回页签组件的 key 与默认页签
 * （换 key 让页签按请求重新挂载），行渲染出来后滚到它并亮一下，再收掉请求；
 * 数据都到了仍找不到行（如档案字段）就只停在页签上。
 */
export function useStateFocus(panelRef, dataReady) {
  const focus = useSidePanelsStore((s) => s.stateFocus);
  const clearStateFocus = useSidePanelsStore((s) => s.clearStateFocus);
  const [tabRequest, setTabRequest] = useState(null);
  if (focus?.tab && focus.nonce !== tabRequest?.nonce) setTabRequest({ nonce: focus.nonce, tab: focus.tab });

  useEffect(() => {
    if (!focus) return;
    const selector = focus.fieldKeys.map((key) => `[data-field-key="${CSS.escape(key)}"]`).join(',');
    const row = selector ? panelRef.current?.querySelector(selector) : null;
    if (row) {
      row.scrollIntoView({ block: 'center' });
      row.classList.add('we-status-field--located');
      row.addEventListener('animationend', () => row.classList.remove('we-status-field--located'), { once: true });
    }
    if (row || dataReady) clearStateFocus();
  }, [focus, dataReady, tabRequest, panelRef, clearStateFocus]);

  return { key: tabRequest?.nonce ?? 0, defaultKey: tabRequest?.tab ?? 'player' };
}
