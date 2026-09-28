import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const displaySettingsStore = vi.hoisted(() => ({
  setShowThinking: vi.fn(),
  setAutoCollapseThinking: vi.fn(),
  setShowTokenUsage: vi.fn(),
  setDanmakuSpeed: vi.fn(),
  setCurrentModelPricing: vi.fn(),
  setCurrentWritingModelPricing: vi.fn(),
}));

vi.mock('../../src/core/api/config.js', () => ({
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
  updateProviderKey: vi.fn(),
  fetchAuxModels: vi.fn(),
  testAuxConnection: vi.fn(),
  fetchWritingModels: vi.fn(),
  testWritingConnection: vi.fn(),
  fetchWritingAuxModels: vi.fn(),
  testWritingAuxConnection: vi.fn(),
}));

vi.mock('../../src/core/state/displaySettings.js', () => ({
  useDisplaySettingsStore: (selector) => selector(displaySettingsStore),
}));

import {
  fetchAuxModels,
  fetchWritingModels,
  getConfig,
  testAuxConnection,
  testWritingConnection,
  updateConfig,
  updateProviderKey,
} from '../../src/core/api/config.js';
import { useSettingsConfig } from '../../src/core/hooks/useSettingsConfig.js';

describe('useSettingsConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.window ??= {};
    window.addEventListener ??= vi.fn();
    window.removeEventListener ??= vi.fn();
    getConfig.mockResolvedValue({
      llm: { provider: 'mock', model: 'mock-model' },
      proxy_url: '',
      short_term_token_budget: 4000,
      global_system_prompt: '系统提示',
      global_post_prompt: '后置提示',
      memory_expansion_enabled: true,
      suggestion_enabled: false,
      ui: { show_thinking: true, auto_collapse_thinking: false },
      writing: {
        global_system_prompt: '写作系统',
        global_post_prompt: '写作后置',
        short_term_token_budget: 12000,
        suggestion_enabled: true,
        memory_expansion_enabled: false,
        llm: { provider: null, model: 'writer', temperature: 0.5, max_tokens: 333 },
      },
      aux_llm: { provider: null, model: null, has_key: false, provider_keys: {} },
      assistant: { model_source: 'main' },
      diary: {
        chat: { enabled: true, date_mode: 'real' },
        writing: { enabled: false, date_mode: 'virtual' },
      },
    });
    updateConfig.mockResolvedValue({
      llm: { provider: 'ollama', model: 'llama3.2', base_url: 'http://127.0.0.1:11434', has_key: false, provider_keys: { ollama: false } },
      aux_llm: { provider: 'openai', model: 'gpt-4.1-mini', base_url: '', has_key: true, provider_keys: { openai: true } },
      writing: { llm: { provider: 'openai', model: 'writer-next', base_url: '', has_key: true, provider_keys: { openai: true } } },
    });
    updateProviderKey.mockResolvedValue({});
    fetchAuxModels.mockResolvedValue([]);
    fetchWritingModels.mockResolvedValue([]);
    testAuxConnection.mockResolvedValue({ success: false, error: 'aux failed' });
    testWritingConnection.mockResolvedValue({ success: false, error: 'writing failed' });
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

  it('自动保存成功时提示已保存，带保存按钮的提示词保存不重复提示', async () => {
    const toasts = [];
    const onToast = (e) => toasts.push(e.detail.message);
    window.addEventListener('we:toast', onToast);
    const { result } = renderHook(() => useSettingsConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.promptProps.onSave();
    });
    expect(toasts).not.toContain('设置已保存');

    // 越过 logger 的同文案去重窗口（前面用例的自动保存可能刚提示过）
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);
    await act(async () => {
      await result.current.promptProps.onToggleSuggestion(true);
    });
    nowSpy.mockRestore();
    window.removeEventListener('we:toast', onToast);
    expect(toasts).toContain('设置已保存');
  });

  it('自动保存失败时弹出提示', async () => {
    const toasts = [];
    const onToast = (e) => toasts.push(e.detail.message);
    window.addEventListener('we:toast', onToast);
    const { result } = renderHook(() => useSettingsConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    updateConfig.mockRejectedValueOnce(new Error('网络错误'));
    await act(async () => {
      await expect(result.current.promptProps.onToggleMemoryExpansion(false)).rejects.toThrow('网络错误');
    });

    window.removeEventListener('we:toast', onToast);
    expect(toasts).toContain('设置保存失败，本次修改未生效：网络错误');
  });

  it('自动保存失败后保留未保存的提示词内容', async () => {
    updateConfig.mockRejectedValueOnce(new Error('写入失败'));
    const { result } = renderHook(() => useSettingsConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.promptProps.setGlobalSystemPrompt('仍待保存的内容');
    });
    await act(async () => {
      await expect(result.current.promptProps.onSave()).rejects.toThrow('写入失败');
    });

    expect(result.current.promptProps.globalSystemPrompt).toBe('仍待保存的内容');
    expect(getConfig).toHaveBeenCalledTimes(1);
  });

  it('收到外部配置更新后重新加载各设置分区', async () => {
    const { result } = renderHook(() => useSettingsConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));
    getConfig.mockResolvedValueOnce({
      global_system_prompt: '外部更新的提示词',
      short_term_token_budget: 15000,
      ui: { show_thinking: false },
      diary: { chat: { enabled: false }, writing: { enabled: true } },
    });

    await act(async () => {
      window.dispatchEvent(new Event('we:global-config-updated'));
    });

    await waitFor(() => {
      expect(result.current.promptProps.globalSystemPrompt).toBe('外部更新的提示词');
      expect(result.current.llmProps.showThinking).toBe(false);
      expect(result.current.diaryProps.writingEnabled).toBe(true);
    });
    expect(getConfig).toHaveBeenCalledTimes(2);
  });

  it('保存 general / writing general 时会发送结构化 patch', async () => {
    updateConfig.mockResolvedValue({});
    const { result } = renderHook(() => useSettingsConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.promptProps.setGlobalSystemPrompt('新系统');
      result.current.promptProps.setGlobalPostPrompt('新后置');
      result.current.promptProps.setShortTermTokenBudget(12000);
    });

    await waitFor(() => {
      expect(result.current.promptProps.globalSystemPrompt).toBe('新系统');
      expect(result.current.promptProps.globalPostPrompt).toBe('新后置');
      expect(result.current.promptProps.shortTermTokenBudget).toBe(12000);
    });

    await act(async () => {
      await result.current.promptProps.onSave();
    });

    await act(async () => {
      result.current.promptProps.setWritingSystemPrompt('新写作系统');
      result.current.promptProps.setWritingPostPrompt('新写作后置');
      result.current.promptProps.setWritingShortTermTokenBudget(6000);
    });

    await waitFor(() => {
      expect(result.current.promptProps.writingSystemPrompt).toBe('新写作系统');
      expect(result.current.promptProps.writingPostPrompt).toBe('新写作后置');
      expect(result.current.promptProps.writingShortTermTokenBudget).toBe(6000);
    });

    await act(async () => {
      await result.current.promptProps.onSaveWriting();
    });

    expect(updateConfig).toHaveBeenCalledWith({
      global_system_prompt: '新系统',
      global_post_prompt: '新后置',
    });
    expect(updateConfig).toHaveBeenCalledWith({
      writing: {
        global_system_prompt: '新写作系统',
        global_post_prompt: '新写作后置',
      },
    });
  });

  it('支持副模型、写作模型和助手模型来源切换', async () => {
    const { result } = renderHook(() => useSettingsConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.llmProps.onAuxLlmChange('provider', 'openai');
      await result.current.llmProps.onWritingLlmChange('provider', 'openai');
      await result.current.llmProps.onAssistantModelSourceChange('aux');
    });

    expect(updateConfig).toHaveBeenCalledWith({ aux_llm: { provider: 'openai', base_url: '' } });
    expect(updateConfig).toHaveBeenCalledWith({ writing: { llm: { provider: 'openai', base_url: '' } } });
    expect(updateConfig).toHaveBeenCalledWith({ assistant: { model_source: 'aux' } });
  });

  it('暴露副模型/写作模型连接测试和密钥保存接口', async () => {
    const { result } = renderHook(() => useSettingsConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.llmProps.testAuxConnection()).resolves.toEqual({ success: false, error: 'aux failed' });
    await expect(result.current.llmProps.testWritingConnection()).resolves.toEqual({ success: false, error: 'writing failed' });

    await act(async () => {
      await result.current.llmProps.onAuxApiKeySave('aux-key');
      await result.current.llmProps.onWritingApiKeySave('writing-key');
    });

    expect(updateProviderKey).toHaveBeenCalledWith('aux-key');
    expect(updateProviderKey).toHaveBeenCalledWith('writing-key');
  });

  it('导入完成后会重新拉取并刷新 prompt / diary 相关状态', async () => {
    getConfig
      .mockResolvedValueOnce({
        llm: {},
        writing: { llm: { provider: null } },
        ui: {},
      })
      .mockResolvedValueOnce({
        global_system_prompt: '导入后的系统',
        global_post_prompt: '导入后的后置',
        short_term_token_budget: 16000,
        memory_expansion_enabled: false,
        suggestion_enabled: true,
        writing: {
          global_system_prompt: '导入后的写作系统',
          global_post_prompt: '导入后的写作后置',
          short_term_token_budget: 6000,
          suggestion_enabled: false,
          memory_expansion_enabled: true,
          llm: { provider: 'openai', model: 'writer-2' },
        },
      });

    const { result } = renderHook(() => useSettingsConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.onImportSuccess();
    });

    expect(result.current.promptProps.globalSystemPrompt).toBe('导入后的系统');
    expect(result.current.promptProps.writingSystemPrompt).toBe('导入后的写作系统');
    expect(result.current.promptProps.shortTermTokenBudget).toBe(16000);
    expect(result.current.promptProps.memoryExpansionEnabled).toBe(false);
    expect(result.current.promptProps.suggestionEnabled).toBe(true);
  });

  it('覆盖 features / diary / ui 相关 handlers', async () => {
    const { result } = renderHook(() => useSettingsConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.llmProps.onToggleShowThinking(false);
      await result.current.llmProps.onToggleAutoCollapseThinking(true);
      await result.current.llmProps.onToggleShowTokenUsage(true);
      await result.current.llmProps.onProxyUrlSave('http://127.0.0.1:7890');

      await result.current.promptProps.onSaveShortTermTokenBudget(12000);
      await result.current.promptProps.onSaveWritingShortTermTokenBudget(5000);
      await result.current.promptProps.onToggleMemoryExpansion(false);
      await result.current.promptProps.onToggleSuggestion(true);
      await result.current.promptProps.onToggleWritingSuggestion(false);
      await result.current.promptProps.onToggleWritingMemoryExpansion(true);

      await result.current.diaryProps.onToggleChatEnabled(false);
      await result.current.diaryProps.onChangeChatDateMode('virtual');
      await result.current.diaryProps.onToggleWritingEnabled(true);
      await result.current.diaryProps.onChangeWritingDateMode('real');
    });

    expect(updateConfig).toHaveBeenCalledWith({ ui: { show_thinking: false } });
    expect(updateConfig).toHaveBeenCalledWith({ ui: { auto_collapse_thinking: true } });
    expect(updateConfig).toHaveBeenCalledWith({ ui: { show_token_usage: true } });
    expect(updateConfig).toHaveBeenCalledWith({ proxy_url: 'http://127.0.0.1:7890' });
    expect(updateConfig).toHaveBeenCalledWith({ short_term_token_budget: 12000 });
    expect(updateConfig).toHaveBeenCalledWith({ writing: { short_term_token_budget: 5000 } });
    expect(updateConfig).toHaveBeenCalledWith({ memory_expansion_enabled: false });
    expect(updateConfig).toHaveBeenCalledWith({ suggestion_enabled: true });
    expect(updateConfig).toHaveBeenCalledWith({ writing: { suggestion_enabled: false } });
    expect(updateConfig).toHaveBeenCalledWith({ writing: { memory_expansion_enabled: true } });
    expect(updateConfig).toHaveBeenCalledWith({ diary: { chat: { enabled: false } } });
    expect(updateConfig).toHaveBeenCalledWith({ diary: { chat: { date_mode: 'virtual' } } });
    expect(updateConfig).toHaveBeenCalledWith({ diary: { writing: { enabled: true } } });
    expect(updateConfig).toHaveBeenCalledWith({ diary: { writing: { date_mode: 'real' } } });
  });
});
