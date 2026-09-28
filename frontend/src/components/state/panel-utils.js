import { useEffect, useState } from 'react';

import { fetchDiaryContent } from '../../core/api/daily-entries.js';
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
