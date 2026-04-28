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
  updateAuxApiKey: vi.fn(),
  fetchAuxModels: vi.fn(),
  testAuxConnection: vi.fn(),
  updateWritingApiKey: vi.fn(),
  fetchWritingModels: vi.fn(),
  testWritingConnection: vi.fn(),
}));

vi.mock('../../src/store/displaySettings.js', () => ({
  useDisplaySettingsStore: (selector) => selector(displaySettingsStore),
}));

import {
  fetchAuxModels,
  fetchWritingModels,
  getConfig,
  testAuxConnection,
  testWritingConnection,
  updateAuxApiKey,
  updateConfig,
  updateWritingApiKey,
} from '../../src/api/config.js';
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
      embedding: { provider: 'openai', model: 'embed-model', has_key: false, provider_keys: { openai: false } },
      aux_llm: { provider: 'openai', model: 'gpt-4.1-mini', base_url: '', has_key: true, provider_keys: { openai: true } },
      writing: { llm: { provider: 'openai', model: 'writer-next', base_url: '', has_key: true, provider_keys: { openai: true } } },
    });
    updateAuxApiKey.mockResolvedValue({});
    updateWritingApiKey.mockResolvedValue({});
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

    expect(updateAuxApiKey).toHaveBeenCalledWith('aux-key');
    expect(updateWritingApiKey).toHaveBeenCalledWith('writing-key');
  });

  it('导入完成后会重新拉取并刷新 prompt / diary 相关状态', async () => {
    getConfig
      .mockResolvedValueOnce({
        llm: {},
        embedding: {},
        writing: { llm: { provider: null } },
        ui: {},
      })
      .mockResolvedValueOnce({
        global_system_prompt: '导入后的系统',
        global_post_prompt: '导入后的后置',
        context_history_rounds: 16,
        memory_expansion_enabled: false,
        suggestion_enabled: true,
        writing: {
          global_system_prompt: '导入后的写作系统',
          global_post_prompt: '导入后的写作后置',
          context_history_rounds: 6,
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
    expect(result.current.promptProps.contextRounds).toBe(16);
    expect(result.current.promptProps.memoryExpansionEnabled).toBe(false);
    expect(result.current.promptProps.suggestionEnabled).toBe(true);
  });

  it('覆盖 embedding / features / diary / ui 相关 handlers', async () => {
    const { result } = renderHook(() => useSettingsConfig());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.llmProps.onEmbeddingChange('provider', 'openai_compatible');
      await result.current.llmProps.onEmbeddingChange('base_url', 'https://embed.example/v1');
      await result.current.llmProps.onToggleShowThinking(false);
      await result.current.llmProps.onToggleAutoCollapseThinking(true);
      await result.current.llmProps.onToggleShowTokenUsage(true);
      await result.current.llmProps.onProxyUrlSave('http://127.0.0.1:7890');

      await result.current.promptProps.onSaveContextRounds(12);
      await result.current.promptProps.onSaveWritingContextRounds(5);
      await result.current.promptProps.onToggleMemoryExpansion(false);
      await result.current.promptProps.onToggleSuggestion(true);
      await result.current.promptProps.onToggleWritingSuggestion(false);
      await result.current.promptProps.onToggleWritingMemoryExpansion(true);

      await result.current.diaryProps.onToggleChatEnabled(false);
      await result.current.diaryProps.onChangeChatDateMode('virtual');
      await result.current.diaryProps.onToggleWritingEnabled(true);
      await result.current.diaryProps.onChangeWritingDateMode('real');
    });

    expect(updateConfig).toHaveBeenCalledWith({ embedding: { provider: 'openai_compatible' } });
    expect(updateConfig).toHaveBeenCalledWith({ embedding: { base_url: 'https://embed.example/v1' } });
    expect(updateConfig).toHaveBeenCalledWith({ ui: { show_thinking: false } });
    expect(updateConfig).toHaveBeenCalledWith({ ui: { auto_collapse_thinking: true } });
    expect(updateConfig).toHaveBeenCalledWith({ ui: { show_token_usage: true } });
    expect(updateConfig).toHaveBeenCalledWith({ proxy_url: 'http://127.0.0.1:7890' });
    expect(updateConfig).toHaveBeenCalledWith({ context_history_rounds: 12 });
    expect(updateConfig).toHaveBeenCalledWith({ writing: { context_history_rounds: 5 } });
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
