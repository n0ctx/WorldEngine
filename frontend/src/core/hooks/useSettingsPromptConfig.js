import { useCallback, useState } from 'react';
import { useDisplaySettingsStore } from '../state/displaySettings.js';
import { useFormBaseline } from './useFormBaseline.js';
import { modePatch, modeValue } from './settingsModeValue.js';
import {
  readDanmakuSettings,
  readMemorySettings,
  readPromptSettings,
  readTurnSizeSettings,
} from './settingsConfigState.js';

export function useSettingsPromptConfig(patchConfig, settingsMode) {
  const isWriting = settingsMode === 'writing';
  const [globalSystemPrompt, setGlobalSystemPrompt] = useState('');
  const [globalPostPrompt, setGlobalPostPrompt] = useState('');
  const [shortTermTokenBudget, setShortTermTokenBudget] = useState(8000);
  const [writingSystemPrompt, setWritingSystemPrompt] = useState('');
  const [writingPostPrompt, setWritingPostPrompt] = useState('');
  const [writingShortTermTokenBudget, setWritingShortTermTokenBudget] = useState(null);
  const [memoryExpansionEnabled, setMemoryExpansionEnabled] = useState(true);
  const [suggestionEnabled, setSuggestionEnabled] = useState(false);
  const [writingSuggestionEnabled, setWritingSuggestionEnabled] = useState(false);
  const [writingMemoryExpansionEnabled, setWritingMemoryExpansionEnabled] = useState(true);
  const [longTermIndexBudget, setLongTermIndexBudget] = useState(20000);
  const [stateInjectionTokenBudget, setStateInjectionTokenBudget] = useState(3000);
  const [writingLongTermIndexBudget, setWritingLongTermIndexBudget] = useState(20000);
  const [danmakuEnabled, setDanmakuEnabled] = useState(false);
  const [writingDanmakuEnabled, setWritingDanmakuEnabled] = useState(false);
  const [danmakuCount, setDanmakuCount] = useState(5);
  const [writingDanmakuCount, setWritingDanmakuCount] = useState(5);
  const [danmakuSpeed, setDanmakuSpeedLocal] = useState('normal');
  const [writingDanmakuSpeed, setWritingDanmakuSpeedLocal] = useState('normal');
  const [chapterTurnSize, setChapterTurnSize] = useState(20);
  const [writingChapterTurnSize, setWritingChapterTurnSize] = useState(null);
  const [pageTurnSize, setPageTurnSize] = useState(50);
  const [writingPageTurnSize, setWritingPageTurnSize] = useState(null);
  const setDanmakuSpeedStore = useDisplaySettingsStore((state) => state.setDanmakuSpeed);
  const setWritingDanmakuSpeedStore = useDisplaySettingsStore((state) => state.setWritingDanmakuSpeed);
  const chatPromptSave = usePromptSave(patchConfig, { globalSystemPrompt, globalPostPrompt }, (values) => ({
    global_system_prompt: values.globalSystemPrompt,
    global_post_prompt: values.globalPostPrompt,
  }));
  const writingPromptSave = usePromptSave(patchConfig, { writingSystemPrompt, writingPostPrompt }, (values) => ({
    writing: {
      global_system_prompt: values.writingSystemPrompt,
      global_post_prompt: values.writingPostPrompt,
    },
  }));
  const setChatPromptBaseline = chatPromptSave.setBaseline;
  const setWritingPromptBaseline = writingPromptSave.setBaseline;

  const applyPromptSettings = useCallback((settings) => {
    setGlobalSystemPrompt(settings.globalSystemPrompt);
    setGlobalPostPrompt(settings.globalPostPrompt);
    setShortTermTokenBudget(settings.shortTermTokenBudget);
    setWritingSystemPrompt(settings.writingSystemPrompt);
    setWritingPostPrompt(settings.writingPostPrompt);
    setWritingShortTermTokenBudget(settings.writingShortTermTokenBudget);
    setChatPromptBaseline({ globalSystemPrompt: settings.globalSystemPrompt, globalPostPrompt: settings.globalPostPrompt });
    setWritingPromptBaseline({ writingSystemPrompt: settings.writingSystemPrompt, writingPostPrompt: settings.writingPostPrompt });
  }, [setChatPromptBaseline, setWritingPromptBaseline]);

  const applyMemorySettings = useCallback((settings) => {
    setMemoryExpansionEnabled(settings.memoryExpansionEnabled);
    setSuggestionEnabled(settings.suggestionEnabled);
    setWritingSuggestionEnabled(settings.writingSuggestionEnabled);
    setWritingMemoryExpansionEnabled(settings.writingMemoryExpansionEnabled);
    setLongTermIndexBudget(settings.longTermIndexBudget);
    setStateInjectionTokenBudget(settings.stateInjectionTokenBudget);
    setWritingLongTermIndexBudget(settings.writingLongTermIndexBudget);
  }, []);

  const applyDanmakuSettings = useCallback((settings) => {
    setDanmakuEnabled(settings.danmakuEnabled);
    setDanmakuCount(settings.danmakuCount);
    setDanmakuSpeedLocal(settings.danmakuSpeed);
    setWritingDanmakuEnabled(settings.writingDanmakuEnabled);
    setWritingDanmakuCount(settings.writingDanmakuCount);
    setWritingDanmakuSpeedLocal(settings.writingDanmakuSpeed);
    setDanmakuSpeedStore(settings.danmakuSpeed);
    setWritingDanmakuSpeedStore(settings.writingDanmakuSpeed);
  }, [setDanmakuSpeedStore, setWritingDanmakuSpeedStore]);

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

  async function handleSaveShortTermTokenBudget(value) {
    await patchConfig({ short_term_token_budget: Number(value) });
  }

  async function handleSaveWritingShortTermTokenBudget(value) {
    await patchConfig({
      writing: {
        short_term_token_budget: value !== '' && value !== null ? Number(value) : null,
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
    modeValue(isWriting, setDanmakuEnabled, setWritingDanmakuEnabled)(enabled);
    await patchConfig(modePatch(isWriting, 'enabled', enabled, 'danmaku'));
  }

  async function handleSaveDanmakuCount(value) {
    const n = Math.max(1, Math.min(20, Number(value) || 5));
    modeValue(isWriting, setDanmakuCount, setWritingDanmakuCount)(n);
    await patchConfig(modePatch(isWriting, 'count', n, 'danmaku'));
  }

  async function handleChangeDanmakuSpeed(speed) {
    modeValue(isWriting, setDanmakuSpeedLocal, setWritingDanmakuSpeedLocal)(speed);
    modeValue(isWriting, setDanmakuSpeedStore, setWritingDanmakuSpeedStore)(speed);
    await patchConfig(modePatch(isWriting, 'speed', speed, 'danmaku'));
  }

  async function handleToggleWritingMemoryExpansion(enabled) {
    await updateEnabledSetting(setWritingMemoryExpansionEnabled, enabled, 'memory_expansion_enabled', true);
  }

  async function handleSaveLongTermIndexBudget(value) {
    const isEmpty = value === '' || value === null || value === undefined;
    const n = isEmpty ? 20000 : Math.min(500000, Math.max(2000, Math.floor(Number(value) || 20000)));
    modeValue(isWriting, setLongTermIndexBudget, setWritingLongTermIndexBudget)(n);
    await patchConfig(modePatch(isWriting, 'long_term_index_budget', n));
  }

  async function handleSaveStateInjectionTokenBudget(value) {
    const isEmpty = value === '' || value === null || value === undefined;
    const n = isEmpty ? 3000 : Math.min(50000, Math.max(500, Math.floor(Number(value) || 3000)));
    setStateInjectionTokenBudget(n);
    await patchConfig({ state_injection_token_budget: n });
  }

  return {
    promptProps: {
      globalSystemPrompt,
      setGlobalSystemPrompt,
      globalPostPrompt,
      setGlobalPostPrompt,
      shortTermTokenBudget,
      setShortTermTokenBudget,
      onSaveShortTermTokenBudget: handleSaveShortTermTokenBudget,
      memoryExpansionEnabled,
      onToggleMemoryExpansion: handleToggleMemoryExpansion,
      suggestionEnabled,
      onToggleSuggestion: handleToggleSuggestion,
      writingSuggestionEnabled,
      onToggleWritingSuggestion: handleToggleWritingSuggestion,
      danmakuEnabled: modeValue(isWriting, danmakuEnabled, writingDanmakuEnabled),
      onToggleDanmaku: handleToggleDanmaku,
      danmakuCount: modeValue(isWriting, danmakuCount, writingDanmakuCount),
      setDanmakuCount: modeValue(isWriting, setDanmakuCount, setWritingDanmakuCount),
      onSaveDanmakuCount: handleSaveDanmakuCount,
      danmakuSpeed: modeValue(isWriting, danmakuSpeed, writingDanmakuSpeed),
      onChangeDanmakuSpeed: handleChangeDanmakuSpeed,
      writingMemoryExpansionEnabled,
      onToggleWritingMemoryExpansion: handleToggleWritingMemoryExpansion,
      longTermIndexBudget: modeValue(isWriting, longTermIndexBudget, writingLongTermIndexBudget),
      setLongTermIndexBudget: modeValue(isWriting, setLongTermIndexBudget, setWritingLongTermIndexBudget),
      onSaveLongTermIndexBudget: handleSaveLongTermIndexBudget,
      stateInjectionTokenBudget,
      setStateInjectionTokenBudget,
      onSaveStateInjectionTokenBudget: handleSaveStateInjectionTokenBudget,
      promptSave: isWriting ? writingPromptSave.save : chatPromptSave.save,
      writingSystemPrompt,
      setWritingSystemPrompt,
      writingPostPrompt,
      setWritingPostPrompt,
      writingShortTermTokenBudget,
      setWritingShortTermTokenBudget,
      onSaveWritingShortTermTokenBudget: handleSaveWritingShortTermTokenBudget,
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
    applyConfig,
  };
}

/**
 * 一组提示词的手动保存：values 与上次存进服务端的值不同即有未保存修改，交给保存栏显示。
 * toPatch 把这组值换成配置补丁；保存失败的原因留在保存栏里，不另弹提示。
 */
function usePromptSave(patchConfig, values, toPatch) {
  const { dirty, setBaseline } = useFormBaseline(values);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedKey, setSavedKey] = useState(0);

  async function onSave() {
    const sent = values;
    setSaving(true);
    setError('');
    try {
      await patchConfig(toPatch(sent), { announce: false });
      setBaseline(sent);
      setSavedKey((key) => key + 1);
    } catch (err) {
      setError(err.message || '未知错误');
    } finally {
      setSaving(false);
    }
  }

  return { setBaseline, save: { dirty, saving, error, savedKey, onSave } };
}
