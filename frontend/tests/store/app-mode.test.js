import { afterEach, describe, expect, it } from 'vitest';

import { SETTINGS_MODE } from '../../src/components/settings/SettingsConstants.js';
import { useAppModeStore } from '../../src/store/appMode.js';

describe('app mode store', () => {
  afterEach(() => {
    useAppModeStore.setState({ appMode: SETTINGS_MODE.CHAT });
  });

  it('默认为 chat，并可切换到 writing', () => {
    expect(useAppModeStore.getState().appMode).toBe(SETTINGS_MODE.CHAT);
    useAppModeStore.getState().setAppMode(SETTINGS_MODE.WRITING);
    expect(useAppModeStore.getState().appMode).toBe(SETTINGS_MODE.WRITING);
  });
});
