import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useSettingsPromptConfig } from './useSettingsPromptConfig.js';

it('按当前模式保存行为设置，切换后读取各自的值', async () => {
  const patchConfig = vi.fn().mockResolvedValue({});
  const { result, rerender } = renderHook(({ mode }) => useSettingsPromptConfig(patchConfig, mode), {
    initialProps: { mode: 'writing' },
  });

  await act(async () => {
    await result.current.promptProps.onSaveMemoryRecallMaxSessions(8);
    await result.current.promptProps.onSaveTableMemoryRowLimit('relations', 12);
    await result.current.promptProps.onToggleDanmaku(true);
  });
  expect(patchConfig).toHaveBeenCalledWith({ writing: { memory_recall_max_sessions: 8 } });
  expect(patchConfig).toHaveBeenCalledWith({ writing: { table_memory_row_limits: { relations: 12 } } });
  expect(patchConfig).toHaveBeenCalledWith({ writing: { danmaku: { enabled: true } } });
  expect(result.current.promptProps.memoryRecallMaxSessions).toBe(8);
  expect(result.current.promptProps.danmakuEnabled).toBe(true);

  rerender({ mode: 'chat' });
  expect(result.current.promptProps.memoryRecallMaxSessions).toBe(5);
  expect(result.current.promptProps.danmakuEnabled).toBe(false);
});
