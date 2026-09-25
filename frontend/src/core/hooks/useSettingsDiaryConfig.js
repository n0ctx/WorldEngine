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
