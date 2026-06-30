import { useState, useEffect, useRef } from 'react';
import { getConfig, updateConfig, updateProviderKey, fetchAuxModels, testAuxConnection, fetchWritingModels, testWritingConnection, fetchWritingAuxModels, testWritingAuxConnection } from '../api/config';
import { useDisplaySettingsStore } from '../state/displaySettings';
import { LOCAL_PROVIDERS, NEEDS_BASE_URL_PROVIDERS, DIARY_DATE_MODE } from '../constants/settings';
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
  const [tableMemoryEnabled, setTableMemoryEnabled] = useState(false);
  const [writingTableMemoryEnabled, setWritingTableMemoryEnabled] = useState(false);
  const [tableMemoryRowLimits, setTableMemoryRowLimits] = useState({});
  const [memoryRecallMaxSessions, setMemoryRecallMaxSessions] = useState(5);
  const [showThinking, setShowThinkingLocal] = useState(true);
  const setShowThinkingStore = useDisplaySettingsStore((s) => s.setShowThinking);
  const [autoCollapseThinking, setAutoCollapseThinkingLocal] = useState(true);
  const setAutoCollapseThinkingStore = useDisplaySettingsStore((s) => s.setAutoCollapseThinking);
  const [showTokenUsage, setShowTokenUsageLocal] = useState(false);
  const setShowTokenUsageStore = useDisplaySettingsStore((s) => s.setShowTokenUsage);
  const setCurrentModelPricing = useDisplaySettingsStore((s) => s.setCurrentModelPricing);
  const setCurrentWritingModelPricing = useDisplaySettingsStore((s) => s.setCurrentWritingModelPricing);
  const [danmakuEnabled, setDanmakuEnabled] = useState(false);
  const [danmakuCount, setDanmakuCount] = useState(5);
  const [danmakuSpeed, setDanmakuSpeedLocal] = useState('normal');
  const setDanmakuSpeedStore = useDisplaySettingsStore((s) => s.setDanmakuSpeed);
  const { saving, saved, run: runSave } = useSaveState();
  const { saving: savingWriting, saved: savedWriting, run: runSaveWriting } = useSaveState();
  const [writingLlm, setWritingLlm] = useState({ provider: null, base_url: null, model: '', temperature: null, max_tokens: null, has_key: false });
  const [writingSystemPrompt, setWritingSystemPrompt] = useState('');
  const [writingPostPrompt, setWritingPostPrompt] = useState('');
  const [writingContextRounds, setWritingContextRounds] = useState(null);
  const [chapterTurnSize, setChapterTurnSize] = useState(20);
  const [writingChapterTurnSize, setWritingChapterTurnSize] = useState(null);
  const [pageTurnSize, setPageTurnSize] = useState(50);
  const [writingPageTurnSize, setWritingPageTurnSize] = useState(null);
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
      setTableMemoryEnabled(c.table_memory_enabled === true);
      setWritingTableMemoryEnabled(c.writing?.table_memory_enabled === true);
      setTableMemoryRowLimits(c.table_memory_row_limits ?? {});
      setMemoryRecallMaxSessions(c.memory_recall_max_sessions ?? 5);
      setShowThinkingLocal(c.ui?.show_thinking !== false);
      setShowThinkingStore(c.ui?.show_thinking !== false);
      setAutoCollapseThinkingLocal(c.ui?.auto_collapse_thinking !== false);
      setAutoCollapseThinkingStore(c.ui?.auto_collapse_thinking !== false);
      const tokenUsage = c.ui?.show_token_usage === true;
      setShowTokenUsageLocal(tokenUsage);
      setShowTokenUsageStore(tokenUsage);
      setCurrentModelPricing(c.llm?.model_pricing ?? null);
      setCurrentWritingModelPricing(c.writing?.llm?.model_pricing ?? null);
      setDanmakuEnabled(c.danmaku?.enabled === true);
      setDanmakuCount(c.danmaku?.count ?? 5);
      const dmSpeed = c.danmaku?.speed ?? 'normal';
      setDanmakuSpeedLocal(dmSpeed);
      setDanmakuSpeedStore(dmSpeed);
      const w = c.writing || {};
      setWritingLlm(w.llm || { provider: null, base_url: null, model: '', temperature: null, max_tokens: null, has_key: false });
      setWritingSystemPrompt(w.global_system_prompt ?? '');
      setWritingPostPrompt(w.global_post_prompt ?? '');
      setWritingContextRounds(w.context_history_rounds ?? null);
      setChapterTurnSize(c.chapter_turn_size ?? 20);
      setWritingChapterTurnSize(w.chapter_turn_size ?? null);
      setPageTurnSize(c.page_turn_size ?? 50);
      setWritingPageTurnSize(w.page_turn_size ?? null);
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
    setDanmakuSpeedStore,
  ]);

  const suppressNextReloadRef = useRef(false);
  useEffect(() => {
    const h = () => {
      if (suppressNextReloadRef.current) {
        suppressNextReloadRef.current = false;
        return;
      }
      setReloadKey((k) => k + 1);
    };
    window.addEventListener('we:global-config-updated', h);
    return () => window.removeEventListener('we:global-config-updated', h);
  }, []);

  async function patchConfig(patch) {
    suppressNextReloadRef.current = true;
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

  async function handleSaveChapterTurnSize(value) {
    const n = Math.max(1, Math.floor(Number(value) || 20));
    setChapterTurnSize(n);
    await patchConfig({ chapter_turn_size: n });
  }

  async function handleSaveWritingChapterTurnSize(value) {
    const isEmpty = value === '' || value === null;
    const n = isEmpty ? null : Math.max(1, Math.floor(Number(value) || 20));
    setWritingChapterTurnSize(n);
    await patchConfig({ writing: { chapter_turn_size: n } });
  }

  async function handleSavePageTurnSize(value) {
    const n = Math.max(1, Math.floor(Number(value) || 50));
    setPageTurnSize(n);
    await patchConfig({ page_turn_size: n });
  }

  async function handleSaveWritingPageTurnSize(value) {
    const isEmpty = value === '' || value === null;
    const n = isEmpty ? null : Math.max(1, Math.floor(Number(value) || 50));
    setWritingPageTurnSize(n);
    await patchConfig({ writing: { page_turn_size: n } });
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

  async function handleToggleDanmaku(enabled) {
    setDanmakuEnabled(enabled);
    await patchConfig({ danmaku: { enabled } });
  }

  async function handleSaveDanmakuCount(value) {
    const n = Math.max(1, Math.min(20, Number(value) || 5));
    setDanmakuCount(n);
    await patchConfig({ danmaku: { count: n } });
  }

  async function handleChangeDanmakuSpeed(speed) {
    setDanmakuSpeedLocal(speed);
    setDanmakuSpeedStore(speed);
    await patchConfig({ danmaku: { speed } });
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

  async function handleToggleTableMemory(enabled) {
    setTableMemoryEnabled(enabled);
    await patchConfig({ table_memory_enabled: enabled });
  }

  async function handleToggleWritingTableMemory(enabled) {
    setWritingTableMemoryEnabled(enabled);
    await patchConfig({ writing: { table_memory_enabled: enabled } });
  }

  // 单表行数上限保存：0 = 不限制；clamp 到 [0, 1000]。只 patch 该 key，后端 deepMerge 保留其余表。
  async function handleSaveTableMemoryRowLimit(key, value) {
    const isEmpty = value === '' || value === null || value === undefined;
    const n = isEmpty ? 0 : Math.min(1000, Math.max(0, Math.floor(Number(value) || 0)));
    setTableMemoryRowLimits((prev) => ({ ...prev, [key]: n }));
    await patchConfig({ table_memory_row_limits: { [key]: n } });
  }

  async function handleSaveMemoryRecallMaxSessions(value) {
    const isEmpty = value === '' || value === null || value === undefined;
    const n = isEmpty ? 5 : Math.max(1, Math.floor(Number(value) || 5));
    setMemoryRecallMaxSessions(n);
    await patchConfig({ memory_recall_max_sessions: n });
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
    setTableMemoryEnabled(c.table_memory_enabled === true);
    setWritingTableMemoryEnabled(w.table_memory_enabled === true);
    setTableMemoryRowLimits(c.table_memory_row_limits ?? {});
    setMemoryRecallMaxSessions(c.memory_recall_max_sessions ?? 5);
    setWritingLlm(w.llm || { provider: null, base_url: null, model: '', temperature: null, max_tokens: null, has_key: false });
    setWritingSystemPrompt(w.global_system_prompt ?? '');
    setWritingPostPrompt(w.global_post_prompt ?? '');
    setWritingContextRounds(w.context_history_rounds ?? null);
    setChapterTurnSize(c.chapter_turn_size ?? 20);
    setWritingChapterTurnSize(w.chapter_turn_size ?? null);
    setPageTurnSize(c.page_turn_size ?? 50);
    setWritingPageTurnSize(w.page_turn_size ?? null);
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
      danmakuEnabled, onToggleDanmaku: handleToggleDanmaku,
      danmakuCount, setDanmakuCount, onSaveDanmakuCount: handleSaveDanmakuCount,
      danmakuSpeed, onChangeDanmakuSpeed: handleChangeDanmakuSpeed,
      writingMemoryExpansionEnabled, onToggleWritingMemoryExpansion: handleToggleWritingMemoryExpansion,
      longTermMemoryEnabled, onToggleLongTermMemory: handleToggleLongTermMemory,
      writingLongTermMemoryEnabled, onToggleWritingLongTermMemory: handleToggleWritingLongTermMemory,
      tableMemoryEnabled, onToggleTableMemory: handleToggleTableMemory,
      writingTableMemoryEnabled, onToggleWritingTableMemory: handleToggleWritingTableMemory,
      tableMemoryRowLimits, setTableMemoryRowLimits,
      onSaveTableMemoryRowLimit: handleSaveTableMemoryRowLimit,
      memoryRecallMaxSessions, setMemoryRecallMaxSessions,
      onSaveMemoryRecallMaxSessions: handleSaveMemoryRecallMaxSessions,
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
      chapterTurnSize, setChapterTurnSize,
      onSaveChapterTurnSize: handleSaveChapterTurnSize,
      writingChapterTurnSize, setWritingChapterTurnSize,
      onSaveWritingChapterTurnSize: handleSaveWritingChapterTurnSize,
      pageTurnSize, setPageTurnSize,
      onSavePageTurnSize: handleSavePageTurnSize,
      writingPageTurnSize, setWritingPageTurnSize,
      onSaveWritingPageTurnSize: handleSaveWritingPageTurnSize,
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
