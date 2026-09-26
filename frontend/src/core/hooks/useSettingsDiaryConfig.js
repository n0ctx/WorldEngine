import { useCallback, useState } from 'react';
import { DIARY_DATE_MODE } from '../constants/settings.js';
import { readDiarySettings } from './settingsConfigState.js';

export function useSettingsDiaryConfig(patchConfig) {
  const [diaryChatEnabled, setDiaryChatEnabled] = useState(false);
  const [diaryChatDateMode, setDiaryChatDateMode] = useState(DIARY_DATE_MODE.VIRTUAL);
  const [diaryWritingEnabled, setDiaryWritingEnabled] = useState(false);
  const [diaryWritingDateMode, setDiaryWritingDateMode] = useState(DIARY_DATE_MODE.VIRTUAL);

  const applyConfig = useCallback((config) => {
    const settings = readDiarySettings(config);
    setDiaryChatEnabled(settings.diaryChatEnabled);
    setDiaryChatDateMode(settings.diaryChatDateMode);
    setDiaryWritingEnabled(settings.diaryWritingEnabled);
    setDiaryWritingDateMode(settings.diaryWritingDateMode);
  }, []);

  async function updateDiarySetting(section, key, value, setValue) {
    setValue(value);
    await patchConfig({ diary: { [section]: { [key]: value } } });
  }

  async function handleToggleDiaryChatEnabled(enabled) {
    await updateDiarySetting('chat', 'enabled', enabled, setDiaryChatEnabled);
  }

  async function handleChangeDiaryChatDateMode(mode) {
    await updateDiarySetting('chat', 'date_mode', mode, setDiaryChatDateMode);
  }

  async function handleToggleDiaryWritingEnabled(enabled) {
    await updateDiarySetting('writing', 'enabled', enabled, setDiaryWritingEnabled);
  }

  async function handleChangeDiaryWritingDateMode(mode) {
    await updateDiarySetting('writing', 'date_mode', mode, setDiaryWritingDateMode);
  }

  return {
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
    applyConfig,
  };
}
