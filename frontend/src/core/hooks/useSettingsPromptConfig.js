import { useCallback, useState } from 'react';
import { useDisplaySettingsStore } from '../state/displaySettings.js';
import { useSaveState } from './useSaveState.js';
import {
  readDanmakuSettings,
  readMemorySettings,
  readPromptSettings,
  readTurnSizeSettings,
} from './settingsConfigState.js';

export function useSettingsPromptConfig(patchConfig) {
  const [globalSystemPrompt, setGlobalSystemPrompt] = useState('');
  const [globalPostPrompt, setGlobalPostPrompt] = useState('');
  const [contextRounds, setContextRounds] = useState(10);
  const [writingSystemPrompt, setWritingSystemPrompt] = useState('');
  const [writingPostPrompt, setWritingPostPrompt] = useState('');
  const [writingContextRounds, setWritingContextRounds] = useState(null);
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
  const [danmakuEnabled, setDanmakuEnabled] = useState(false);
  const [danmakuCount, setDanmakuCount] = useState(5);
  const [danmakuSpeed, setDanmakuSpeedLocal] = useState('normal');
  const [chapterTurnSize, setChapterTurnSize] = useState(20);
  const [writingChapterTurnSize, setWritingChapterTurnSize] = useState(null);
  const [pageTurnSize, setPageTurnSize] = useState(50);
  const [writingPageTurnSize, setWritingPageTurnSize] = useState(null);
  const setDanmakuSpeedStore = useDisplaySettingsStore((state) => state.setDanmakuSpeed);
  const { saving, saved, run: runSave } = useSaveState();
  const { saving: savingWriting, saved: savedWriting, run: runSaveWriting } = useSaveState();

  const applyPromptSettings = useCallback((settings) => {
    setGlobalSystemPrompt(settings.globalSystemPrompt);
    setGlobalPostPrompt(settings.globalPostPrompt);
    setContextRounds(settings.contextRounds);
    setWritingSystemPrompt(settings.writingSystemPrompt);
    setWritingPostPrompt(settings.writingPostPrompt);
    setWritingContextRounds(settings.writingContextRounds);
  }, []);

  const applyMemorySettings = useCallback((settings) => {
    setMemoryExpansionEnabled(settings.memoryExpansionEnabled);
    setSuggestionEnabled(settings.suggestionEnabled);
    setWritingSuggestionEnabled(settings.writingSuggestionEnabled);
    setWritingMemoryExpansionEnabled(settings.writingMemoryExpansionEnabled);
    setLongTermMemoryEnabled(settings.longTermMemoryEnabled);
    setWritingLongTermMemoryEnabled(settings.writingLongTermMemoryEnabled);
    setTableMemoryEnabled(settings.tableMemoryEnabled);
    setWritingTableMemoryEnabled(settings.writingTableMemoryEnabled);
    setTableMemoryRowLimits(settings.tableMemoryRowLimits);
    setMemoryRecallMaxSessions(settings.memoryRecallMaxSessions);
  }, []);

  const applyDanmakuSettings = useCallback((settings) => {
    setDanmakuEnabled(settings.danmakuEnabled);
    setDanmakuCount(settings.danmakuCount);
    setDanmakuSpeedLocal(settings.danmakuSpeed);
    setDanmakuSpeedStore(settings.danmakuSpeed);
  }, [setDanmakuSpeedStore]);

  const applyTurnSizeSettings = useCallback((settings) => {
    setChapterTurnSize(settings.chapterTurnSize);
    setWritingChapterTurnSize(settings.writingChapterTurnSize);
    setPageTurnSize(settings.pageTurnSize);
    setWritingPageTurnSize(settings.writingPageTurnSize);
  }, []);

  const applyConfig = useCallback((config) => {
    applyPromptSettings(readPromptSettings(config));
    applyMemorySettings(readMemorySettings(config));
    applyDanmakuSettings(readDanmakuSettings(config));
    applyTurnSizeSettings(readTurnSizeSettings(config));
  }, [applyDanmakuSettings, applyMemorySettings, applyPromptSettings, applyTurnSizeSettings]);

  async function updateEnabledSetting(setEnabled, enabled, key, isWriting = false) {
    setEnabled(enabled);
    await patchConfig(isWriting
      ? { writing: { [key]: enabled } }
      : { [key]: enabled });
  }

  async function handleSaveGeneral() {
    await runSave(() => patchConfig({
      global_system_prompt: globalSystemPrompt,
      global_post_prompt: globalPostPrompt,
    }, { announceSaved: false }));
  }

  async function handleSaveWritingGeneral() {
    await runSaveWriting(() => patchConfig({
      writing: {
        global_system_prompt: writingSystemPrompt,
        global_post_prompt: writingPostPrompt,
      },
    }, { announceSaved: false }));
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

  async function handleToggleMemoryExpansion(enabled) {
    await updateEnabledSetting(setMemoryExpansionEnabled, enabled, 'memory_expansion_enabled');
  }

  async function handleToggleSuggestion(enabled) {
    await updateEnabledSetting(setSuggestionEnabled, enabled, 'suggestion_enabled');
  }

  async function handleToggleWritingSuggestion(enabled) {
    await updateEnabledSetting(setWritingSuggestionEnabled, enabled, 'suggestion_enabled', true);
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
    await updateEnabledSetting(setWritingMemoryExpansionEnabled, enabled, 'memory_expansion_enabled', true);
  }

  async function handleToggleLongTermMemory(enabled) {
    await updateEnabledSetting(setLongTermMemoryEnabled, enabled, 'long_term_memory_enabled');
  }

  async function handleToggleWritingLongTermMemory(enabled) {
    await updateEnabledSetting(setWritingLongTermMemoryEnabled, enabled, 'long_term_memory_enabled', true);
  }

  async function handleToggleTableMemory(enabled) {
    await updateEnabledSetting(setTableMemoryEnabled, enabled, 'table_memory_enabled');
  }

  async function handleToggleWritingTableMemory(enabled) {
    await updateEnabledSetting(setWritingTableMemoryEnabled, enabled, 'table_memory_enabled', true);
  }

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

  const applyImportedPromptSettings = useCallback((importedConfig) => {
    applyPromptSettings(readPromptSettings(importedConfig));
    applyMemorySettings(readMemorySettings(importedConfig));
    applyTurnSizeSettings(readTurnSizeSettings(importedConfig));
  }, [applyMemorySettings, applyPromptSettings, applyTurnSizeSettings]);

  return {
    promptProps: {
      globalSystemPrompt,
      setGlobalSystemPrompt,
      globalPostPrompt,
      setGlobalPostPrompt,
      contextRounds,
      setContextRounds,
      onSaveContextRounds: handleSaveContextRounds,
      memoryExpansionEnabled,
      onToggleMemoryExpansion: handleToggleMemoryExpansion,
      suggestionEnabled,
      onToggleSuggestion: handleToggleSuggestion,
      writingSuggestionEnabled,
      onToggleWritingSuggestion: handleToggleWritingSuggestion,
      danmakuEnabled,
      onToggleDanmaku: handleToggleDanmaku,
      danmakuCount,
      setDanmakuCount,
      onSaveDanmakuCount: handleSaveDanmakuCount,
      danmakuSpeed,
      onChangeDanmakuSpeed: handleChangeDanmakuSpeed,
      writingMemoryExpansionEnabled,
      onToggleWritingMemoryExpansion: handleToggleWritingMemoryExpansion,
      longTermMemoryEnabled,
      onToggleLongTermMemory: handleToggleLongTermMemory,
      writingLongTermMemoryEnabled,
      onToggleWritingLongTermMemory: handleToggleWritingLongTermMemory,
      tableMemoryEnabled,
      onToggleTableMemory: handleToggleTableMemory,
      writingTableMemoryEnabled,
      onToggleWritingTableMemory: handleToggleWritingTableMemory,
      tableMemoryRowLimits,
      setTableMemoryRowLimits,
      onSaveTableMemoryRowLimit: handleSaveTableMemoryRowLimit,
      memoryRecallMaxSessions,
      setMemoryRecallMaxSessions,
      onSaveMemoryRecallMaxSessions: handleSaveMemoryRecallMaxSessions,
      onSave: handleSaveGeneral,
      saving,
      saved,
      savingWriting,
      savedWriting,
      writingSystemPrompt,
      setWritingSystemPrompt,
      writingPostPrompt,
      setWritingPostPrompt,
      writingContextRounds,
      setWritingContextRounds,
      onSaveWriting: handleSaveWritingGeneral,
      onSaveWritingContextRounds: handleSaveWritingContextRounds,
      chapterTurnSize,
      setChapterTurnSize,
      onSaveChapterTurnSize: handleSaveChapterTurnSize,
      writingChapterTurnSize,
      setWritingChapterTurnSize,
      onSaveWritingChapterTurnSize: handleSaveWritingChapterTurnSize,
      pageTurnSize,
      setPageTurnSize,
      onSavePageTurnSize: handleSavePageTurnSize,
      writingPageTurnSize,
      setWritingPageTurnSize,
      onSaveWritingPageTurnSize: handleSaveWritingPageTurnSize,
    },
    onImportSuccess: applyImportedPromptSettings,
    applyConfig,
  };
}
