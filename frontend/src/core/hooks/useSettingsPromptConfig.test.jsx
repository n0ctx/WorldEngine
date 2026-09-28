import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useSettingsPromptConfig } from './useSettingsPromptConfig.js';

it('按当前模式保存行为设置，切换后读取各自的值', async () => {
  const patchConfig = vi.fn().mockResolvedValue({});
  const { result, rerender } = renderHook(({ mode }) => useSettingsPromptConfig(patchConfig, mode), {
    initialProps: { mode: 'writing' },
  });

  await act(async () => {
    await result.current.promptProps.onSaveLongTermIndexBudget(8000);
    await result.current.promptProps.onToggleDanmaku(true);
  });
  expect(patchConfig).toHaveBeenCalledWith({ writing: { long_term_index_budget: 8000 } });
  expect(patchConfig).toHaveBeenCalledWith({ writing: { danmaku: { enabled: true } } });
  expect(result.current.promptProps.longTermIndexBudget).toBe(8000);
  expect(result.current.promptProps.danmakuEnabled).toBe(true);

  rerender({ mode: 'chat' });
  expect(result.current.promptProps.longTermIndexBudget).toBe(20000);
  expect(result.current.promptProps.danmakuEnabled).toBe(false);
});
