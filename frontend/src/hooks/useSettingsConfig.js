import { useState, useEffect } from 'react';
import { getConfig, updateConfig, updateProviderKey, fetchAuxModels, testAuxConnection, fetchWritingModels, testWritingConnection, fetchWritingAuxModels, testWritingAuxConnection } from '../api/config';
import { useDisplaySettingsStore } from '../store/displaySettings';
import { LOCAL_PROVIDERS, NEEDS_BASE_URL_PROVIDERS, DIARY_DATE_MODE } from '../components/settings/SettingsConstants';
import { useSaveState } from './useSaveState';

export function useSettingsConfig() {
  const [loading, setLoading] = useState(true);
  const [llm, setLlm] = useState({});
  const [embedding, setEmbedding] = useState({});
  const [proxyUrl, setProxyUrl] = useState('');
  const [contextRounds, setContextRounds] = useState(10);
  const [globalSystemPrompt, setGlobalSystemPrompt] = useState('');
  const [globalPostPrompt, setGlobalPostPrompt] = useState('');
  const [memoryExpansionEnabled, setMemoryExpansionEnabled] = useState(true);
  const [suggestionEnabled, setSuggestionEnabled] = useState(false);
  const [writingSuggestionEnabled, setWritingSuggestionEnabled] = useState(false);
  const [writingMemoryExpansionEnabled, setWritingMemoryExpansionEnabled] = useState(true);
  const [longTermMemoryEnabled, setLongTermMemoryEnabled] = useState(false);
  const [writingLongTermMemoryEnabled, setWritingLongTermMemoryEnabled] = useState(false);
  const [showThinking, setShowThinkingLocal] = useState(true);
  const setShowThinkingStore = useDisplaySettingsStore((s) => s.setShowThinking);
  const [autoCollapseThinking, setAutoCollapseThinkingLocal] = useState(true);
  const setAutoCollapseThinkingStore = useDisplaySettingsStore((s) => s.setAutoCollapseThinking);
  const [showTokenUsage, setShowTokenUsageLocal] = useState(false);
  const setShowTokenUsageStore = useDisplaySettingsStore((s) => s.setShowTokenUsage);
  const setCurrentModelPricing = useDisplaySettingsStore((s) => s.setCurrentModelPricing);
  const setCurrentWritingModelPricing = useDisplaySettingsStore((s) => s.setCurrentWritingModelPricing);
  const { saving, saved, run: runSave } = useSaveState();
  const { saving: savingWriting, saved: savedWriting, run: runSaveWriting } = useSaveState();
  const [writingLlm, setWritingLlm] = useState({ provider: null, base_url: null, model: '', temperature: null, max_tokens: null, has_key: false });
  const [writingSystemPrompt, setWritingSystemPrompt] = useState('');
  const [writingPostPrompt, setWritingPostPrompt] = useState('');
  const [writingContextRounds, setWritingContextRounds] = useState(null);
  const [diaryChatEnabled, setDiaryChatEnabled] = useState(false);
  const [diaryChatDateMode, setDiaryChatDateMode] = useState(DIARY_DATE_MODE.VIRTUAL);
  const [diaryWritingEnabled, setDiaryWritingEnabled] = useState(false);
  const [diaryWritingDateMode, setDiaryWritingDateMode] = useState(DIARY_DATE_MODE.VIRTUAL);
  const [auxLlm, setAuxLlm] = useState({});
  const [writingAuxLlm, setWritingAuxLlm] = useState({});
  const [assistantModelSource, setAssistantModelSource] = useState('main');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    getConfig().then((c) => {
      setLlm(c.llm || {});
      setEmbedding(c.embedding || {});
      setAuxLlm(c.aux_llm || {});
      setWritingAuxLlm(c.writing?.aux_llm || {});
      setAssistantModelSource(c.assistant?.model_source ?? 'main');
      setProxyUrl(c.proxy_url ?? '');
      setContextRounds(c.context_history_rounds ?? 10);
      setGlobalSystemPrompt(c.global_system_prompt ?? '');
      setGlobalPostPrompt(c.global_post_prompt ?? '');
      setMemoryExpansionEnabled(c.memory_expansion_enabled !== false);
      setSuggestionEnabled(c.suggestion_enabled === true);
      setWritingSuggestionEnabled(c.writing?.suggestion_enabled === true);
      setWritingMemoryExpansionEnabled(c.writing?.memory_expansion_enabled !== false);
      setLongTermMemoryEnabled(c.long_term_memory_enabled === true);
      setWritingLongTermMemoryEnabled(c.writing?.long_term_memory_enabled === true);
      setShowThinkingLocal(c.ui?.show_thinking !== false);
      setShowThinkingStore(c.ui?.show_thinking !== false);
      setAutoCollapseThinkingLocal(c.ui?.auto_collapse_thinking !== false);
      setAutoCollapseThinkingStore(c.ui?.auto_collapse_thinking !== false);
      const tokenUsage = c.ui?.show_token_usage === true;
      setShowTokenUsageLocal(tokenUsage);
      setShowTokenUsageStore(tokenUsage);
      setCurrentModelPricing(c.llm?.model_pricing ?? null);
      setCurrentWritingModelPricing(c.writing?.llm?.model_pricing ?? null);
      const w = c.writing || {};
      setWritingLlm(w.llm || { provider: null, base_url: null, model: '', temperature: null, max_tokens: null, has_key: false });
      setWritingSystemPrompt(w.global_system_prompt ?? '');
      setWritingPostPrompt(w.global_post_prompt ?? '');
      setWritingContextRounds(w.context_history_rounds ?? null);
      const d = c.diary || {};
      setDiaryChatEnabled(d.chat?.enabled === true);
      setDiaryChatDateMode(d.chat?.date_mode ?? DIARY_DATE_MODE.VIRTUAL);
      setDiaryWritingEnabled(d.writing?.enabled === true);
      setDiaryWritingDateMode(d.writing?.date_mode ?? DIARY_DATE_MODE.VIRTUAL);
      setLoading(false);
    });
  }, [
    reloadKey,
    setAutoCollapseThinkingStore,
    setCurrentModelPricing,
    setCurrentWritingModelPricing,
    setShowThinkingStore,
    setShowTokenUsageStore,
  ]);

  useEffect(() => {
    const h = () => setReloadKey((k) => k + 1);
    window.addEventListener('we:global-config-updated', h);
    return () => window.removeEventListener('we:global-config-updated', h);
  }, []);

  async function patchConfig(patch) {
    await updateConfig(patch);
  }

  async function handleLlmChange(field, value) {
    if (field === 'provider') {
      const isLocal = LOCAL_PROVIDERS.includes(value);
      const patch = isLocal ? { provider: value } : { provider: value, base_url: '' };
      const updated = await updateConfig({ llm: patch });
      setLlm((prev) => ({
        ...prev,
        provider: value,
        base_url: updated.llm?.base_url ?? '',
        model: updated.llm?.model ?? '',
        has_key: updated.llm?.has_key ?? false,
      }));
    } else if (field === 'has_key') {
      setLlm((prev) => ({ ...prev, has_key: value }));
    } else {
      setLlm((prev) => ({ ...prev, [field]: value }));
      await patchConfig({ llm: { [field]: value } });
    }
  }

  async function handleEmbeddingChange(field, value) {
    if (field === 'provider') {
      const keepBaseUrl = NEEDS_BASE_URL_PROVIDERS.has(value);
      const patch = keepBaseUrl ? { provider: value } : { provider: value, base_url: '' };
      const updated = await updateConfig({ embedding: patch });
      setEmbedding((prev) => ({
        ...prev,
        provider: value,
        base_url: updated.embedding?.base_url ?? '',
        model: updated.embedding?.model ?? '',
        has_key: updated.embedding?.has_key ?? false,
      }));
    } else if (field === 'has_key') {
      setEmbedding((prev) => ({ ...prev, has_key: value }));
    } else {
      setEmbedding((prev) => ({ ...prev, [field]: value }));
      await patchConfig({ embedding: { [field]: value } });
    }
  }

  async function handleAuxLlmChange(field, value) {
    if (field === 'provider') {
      const isLocal = value && LOCAL_PROVIDERS.includes(value);
      const patch = value ? (isLocal ? { provider: value } : { provider: value, base_url: '' }) : { provider: null };
      const updated = await updateConfig({ aux_llm: patch });
      setAuxLlm((prev) => ({
        ...prev,
        provider: value || null,
        base_url: updated.aux_llm?.base_url ?? null,
        model: updated.aux_llm?.model ?? null,
        has_key: updated.aux_llm?.has_key ?? false,
      }));
    } else if (field === 'has_key') {
      setAuxLlm((prev) => ({ ...prev, has_key: value }));
    } else {
      setAuxLlm((prev) => ({ ...prev, [field]: value }));
      await patchConfig({ aux_llm: { [field]: value } });
    }
  }

  async function handleWritingAuxLlmChange(field, value) {
    if (field === 'provider') {
      const isLocal = value && LOCAL_PROVIDERS.includes(value);
      const patch = value ? (isLocal ? { provider: value } : { provider: value, base_url: '' }) : { provider: null };
      const updated = await updateConfig({ writing: { aux_llm: patch } });
      setWritingAuxLlm((prev) => ({
        ...prev,
        provider: value || null,
        base_url: updated.writing?.aux_llm?.base_url ?? null,
        model: updated.writing?.aux_llm?.model ?? null,
        has_key: updated.writing?.aux_llm?.has_key ?? false,
      }));
    } else if (field === 'has_key') {
      setWritingAuxLlm((prev) => ({ ...prev, has_key: value }));
    } else {
      setWritingAuxLlm((prev) => ({ ...prev, [field]: value }));
      await patchConfig({ writing: { aux_llm: { [field]: value } } });
    }
  }

  async function handleAssistantModelSourceChange(value) {
    setAssistantModelSource(value);
    await patchConfig({ assistant: { model_source: value } });
  }

  async function handleWritingLlmChange(field, value) {
    if (field === 'provider') {
      const isLocal = value && LOCAL_PROVIDERS.includes(value);
      const patch = value ? (isLocal ? { provider: value } : { provider: value, base_url: '' }) : { provider: null };
      const updated = await updateConfig({ writing: { llm: patch } });
      setWritingLlm((prev) => ({
        ...prev,
        provider: value || null,
        base_url: updated.writing?.llm?.base_url ?? null,
        model: updated.writing?.llm?.model ?? '',
        has_key: updated.writing?.llm?.has_key ?? false,
      }));
    } else if (field === 'has_key') {
      setWritingLlm((prev) => ({ ...prev, has_key: value }));
    } else {
      setWritingLlm((prev) => ({ ...prev, [field]: value }));
      await patchConfig({ writing: { llm: { [field]: value } } });
    }
  }

  async function handleSaveGeneral() {
    await runSave(() => patchConfig({
      global_system_prompt: globalSystemPrompt,
      global_post_prompt: globalPostPrompt,
    }));
  }

  async function handleSaveWritingGeneral() {
    await runSaveWriting(() => patchConfig({
      writing: {
        global_system_prompt: writingSystemPrompt,
        global_post_prompt: writingPostPrompt,
      },
    }));
  }

  async function handleSaveContextRounds(value) {
    await patchConfig({ context_history_rounds: Number(value) });
  }

  async function handleSaveWritingContextRounds(value) {
    await patchConfig({
      writing: {
        context_history_rounds: value !== '' && value !== null ? Number(value) : null,
      },
    });
  }

  async function handleProxyUrlSave(url) {
    setProxyUrl(url);
    await patchConfig({ proxy_url: url });
  }

  async function handleToggleMemoryExpansion(enabled) {
    setMemoryExpansionEnabled(enabled);
    await patchConfig({ memory_expansion_enabled: enabled });
  }

  async function handleToggleSuggestion(enabled) {
    setSuggestionEnabled(enabled);
    await patchConfig({ suggestion_enabled: enabled });
  }

  async function handleToggleWritingSuggestion(enabled) {
    setWritingSuggestionEnabled(enabled);
    await patchConfig({ writing: { suggestion_enabled: enabled } });
  }

  async function handleToggleWritingMemoryExpansion(enabled) {
    setWritingMemoryExpansionEnabled(enabled);
    await patchConfig({ writing: { memory_expansion_enabled: enabled } });
  }

  async function handleToggleLongTermMemory(enabled) {
    setLongTermMemoryEnabled(enabled);
    await patchConfig({ long_term_memory_enabled: enabled });
  }

  async function handleToggleWritingLongTermMemory(enabled) {
    setWritingLongTermMemoryEnabled(enabled);
    await patchConfig({ writing: { long_term_memory_enabled: enabled } });
  }

  async function handleToggleShowThinking(enabled) {
    setShowThinkingLocal(enabled);
    setShowThinkingStore(enabled);
    await patchConfig({ ui: { show_thinking: enabled } });
  }

  async function handleToggleAutoCollapseThinking(enabled) {
    setAutoCollapseThinkingLocal(enabled);
    setAutoCollapseThinkingStore(enabled);
    await patchConfig({ ui: { auto_collapse_thinking: enabled } });
  }

  async function handleToggleShowTokenUsage(enabled) {
    setShowTokenUsageLocal(enabled);
    setShowTokenUsageStore(enabled);
    await patchConfig({ ui: { show_token_usage: enabled } });
  }

  async function handleToggleDiaryChatEnabled(enabled) {
    setDiaryChatEnabled(enabled);
    await patchConfig({ diary: { chat: { enabled } } });
  }

  async function handleChangeDiaryChatDateMode(mode) {
    setDiaryChatDateMode(mode);
    await patchConfig({ diary: { chat: { date_mode: mode } } });
  }

  async function handleToggleDiaryWritingEnabled(enabled) {
    setDiaryWritingEnabled(enabled);
    await patchConfig({ diary: { writing: { enabled } } });
  }

  async function handleChangeDiaryWritingDateMode(mode) {
    setDiaryWritingDateMode(mode);
    await patchConfig({ diary: { writing: { date_mode: mode } } });
  }

  async function handleImportSuccess() {
    const c = await getConfig();
    setGlobalSystemPrompt(c.global_system_prompt ?? '');
    setGlobalPostPrompt(c.global_post_prompt ?? '');
    setContextRounds(c.context_history_rounds ?? 10);
    setMemoryExpansionEnabled(c.memory_expansion_enabled !== false);
    setSuggestionEnabled(c.suggestion_enabled === true);
    const w = c.writing || {};
    setWritingSuggestionEnabled(w.suggestion_enabled === true);
    setWritingMemoryExpansionEnabled(w.memory_expansion_enabled !== false);
    setLongTermMemoryEnabled(c.long_term_memory_enabled === true);
    setWritingLongTermMemoryEnabled(w.long_term_memory_enabled === true);
    setWritingLlm(w.llm || { provider: null, base_url: null, model: '', temperature: null, max_tokens: null, has_key: false });
    setWritingSystemPrompt(w.global_system_prompt ?? '');
    setWritingPostPrompt(w.global_post_prompt ?? '');
    setWritingContextRounds(w.context_history_rounds ?? null);
  }

  return {
    loading,
    llmProps: {
      llm,
      embedding,
      auxLlm,
      writingAuxLlm,
      assistantModelSource,
      onLlmChange: handleLlmChange,
      onEmbeddingChange: handleEmbeddingChange,
      onAuxLlmChange: handleAuxLlmChange,
      onWritingAuxLlmChange: handleWritingAuxLlmChange,
      onAssistantModelSourceChange: handleAssistantModelSourceChange,
      onAuxApiKeySave: updateProviderKey,
      fetchAuxModels,
      testAuxConnection,
      onWritingAuxApiKeySave: updateProviderKey,
      fetchWritingAuxModels,
      testWritingAuxConnection,
      writingLlm,
      onWritingLlmChange: handleWritingLlmChange,
      onWritingApiKeySave: updateProviderKey,
      fetchWritingModels,
      testWritingConnection,
      proxyUrl,
      onProxyUrlSave: handleProxyUrlSave,
      showThinking,
      onToggleShowThinking: handleToggleShowThinking,
      autoCollapseThinking,
      onToggleAutoCollapseThinking: handleToggleAutoCollapseThinking,
      showTokenUsage,
      onToggleShowTokenUsage: handleToggleShowTokenUsage,
    },
    promptProps: {
      globalSystemPrompt, setGlobalSystemPrompt,
      globalPostPrompt, setGlobalPostPrompt,
      contextRounds, setContextRounds,
      onSaveContextRounds: handleSaveContextRounds,
      memoryExpansionEnabled, onToggleMemoryExpansion: handleToggleMemoryExpansion,
      suggestionEnabled, onToggleSuggestion: handleToggleSuggestion,
      writingSuggestionEnabled, onToggleWritingSuggestion: handleToggleWritingSuggestion,
      writingMemoryExpansionEnabled, onToggleWritingMemoryExpansion: handleToggleWritingMemoryExpansion,
      longTermMemoryEnabled, onToggleLongTermMemory: handleToggleLongTermMemory,
      writingLongTermMemoryEnabled, onToggleWritingLongTermMemory: handleToggleWritingLongTermMemory,
      onSave: handleSaveGeneral,
      saving,
      saved,
      savingWriting,
      savedWriting,
      writingSystemPrompt, setWritingSystemPrompt,
      writingPostPrompt, setWritingPostPrompt,
      writingContextRounds, setWritingContextRounds,
      onSaveWriting: handleSaveWritingGeneral,
      onSaveWritingContextRounds: handleSaveWritingContextRounds,
    },
    onImportSuccess: handleImportSuccess,
    diaryProps: {
      chatEnabled: diaryChatEnabled,
      onToggleChatEnabled: handleToggleDiaryChatEnabled,
      chatDateMode: diaryChatDateMode,
      onChangeChatDateMode: handleChangeDiaryChatDateMode,
      writingEnabled: diaryWritingEnabled,
      onToggleWritingEnabled: handleToggleDiaryWritingEnabled,
      writingDateMode: diaryWritingDateMode,
      onChangeWritingDateMode: handleChangeDiaryWritingDateMode,
    },
  };
}
