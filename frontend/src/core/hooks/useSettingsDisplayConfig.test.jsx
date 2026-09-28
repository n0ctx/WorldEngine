import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useSettingsDisplayConfig } from './useSettingsDisplayConfig.js';

it('写作显示选项单独保存，切回对话仍保留对话值', async () => {
  const patchConfig = vi.fn().mockResolvedValue({});
  const { result, rerender } = renderHook(({ mode }) => useSettingsDisplayConfig(patchConfig, mode), {
    initialProps: { mode: 'writing' },
  });

  await act(async () => {
    await result.current.displayProps.onToggleShowThinking(false);
    await result.current.displayProps.onToggleShowTokenUsage(true);
  });
  expect(patchConfig).toHaveBeenCalledWith({ writing: { ui: { show_thinking: false } } });
  expect(patchConfig).toHaveBeenCalledWith({ writing: { ui: { show_token_usage: true } } });
  expect(result.current.displayProps.showThinking).toBe(false);
  expect(result.current.displayProps.showTokenUsage).toBe(true);

  rerender({ mode: 'chat' });
  expect(result.current.displayProps.showThinking).toBe(true);
  expect(result.current.displayProps.showTokenUsage).toBe(false);
});
