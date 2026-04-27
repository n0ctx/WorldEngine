import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const displaySettingsStore = vi.hoisted(() => ({
  setShowThinking: vi.fn(),
  setAutoCollapseThinking: vi.fn(),
  setShowTokenUsage: vi.fn(),
  setCurrentModelPricing: vi.fn(),
  setCurrentWritingModelPricing: vi.fn(),
}));

vi.mock('../../src/api/config.js', () => ({
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
}));

vi.mock('../../src/store/displaySettings.js', () => ({
  useDisplaySettingsStore: (selector) => selector(displaySettingsStore),
}));

import { getConfig, updateConfig } from '../../src/api/config.js';
import { useSettingsConfig } from '../../src/hooks/useSettingsConfig.js';

describe('useSettingsConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.window ??= {};
    window.addEventListener ??= vi.fn();
    window.removeEventListener ??= vi.fn();
    getConfig.mockResolvedValue({
      llm: { provider: 'mock', model: 'mock-model' },
      embedding: { provider: 'openai', model: 'embed-model' },
      proxy_url: '',
      context_history_rounds: 4,
      global_system_prompt: '系统提示',
      global_post_prompt: '后置提示',
      memory_expansion_enabled: true,
      suggestion_enabled: false,
      ui: { show_thinking: true, auto_collapse_thinking: false },
      writing: {
        global_system_prompt: '写作系统',
        global_post_prompt: '写作后置',
        context_history_rounds: 8,
        suggestion_enabled: true,
        memory_expansion_enabled: false,
        llm: { model: 'writer', temperature: 0.5, max_tokens: 333 },
      },
    });
    updateConfig.mockResolvedValue({
      llm: { provider: 'ollama', model: 'llama3.2', base_url: 'http://127.0.0.1:11434', has_key: false, provider_keys: { ollama: false } },
      embedding: { provider: 'openai', model: 'embed-model', has_key: false, provider_keys: { openai: false } },
    });
  });

  it('会加载配置并暴露 patch handlers', async () => {
    const { result } = renderHook(() => useSettingsConfig());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.promptProps.globalSystemPrompt).toBe('系统提示');
    expect(result.current.promptProps.writingSystemPrompt).toBe('写作系统');

    await act(async () => {
      await result.current.llmProps.onLlmChange('provider', 'ollama');
    });

    expect(updateConfig).toHaveBeenCalledWith({ llm: { provider: 'ollama' } });
  });

  it('保存 general / writing general 时会发送结构化 patch', async () => {
    updateConfig.mockResolvedValue({});
    const { result } = renderHook(() => useSettingsConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.promptProps.setGlobalSystemPrompt('新系统');
      result.current.promptProps.setGlobalPostPrompt('新后置');
      result.current.promptProps.setContextRounds(12);
    });

    await waitFor(() => {
      expect(result.current.promptProps.globalSystemPrompt).toBe('新系统');
      expect(result.current.promptProps.globalPostPrompt).toBe('新后置');
      expect(result.current.promptProps.contextRounds).toBe(12);
    });

    await act(async () => {
      await result.current.promptProps.onSave();
    });

    await act(async () => {
      result.current.promptProps.setWritingSystemPrompt('新写作系统');
      result.current.promptProps.setWritingPostPrompt('新写作后置');
      result.current.promptProps.setWritingContextRounds(6);
    });

    await waitFor(() => {
      expect(result.current.promptProps.writingSystemPrompt).toBe('新写作系统');
      expect(result.current.promptProps.writingPostPrompt).toBe('新写作后置');
      expect(result.current.promptProps.writingContextRounds).toBe(6);
    });

    await act(async () => {
      await result.current.promptProps.onSaveWriting();
    });

    expect(updateConfig).toHaveBeenCalledWith({
      context_history_rounds: 12,
      global_system_prompt: '新系统',
      global_post_prompt: '新后置',
    });
    expect(updateConfig).toHaveBeenCalledWith({
      writing: {
        context_history_rounds: 6,
        global_system_prompt: '新写作系统',
        global_post_prompt: '新写作后置',
      },
    });
  });
});
