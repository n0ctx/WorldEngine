import { beforeEach, describe, expect, it } from 'vitest';

import useStore from '../../src/store/index.js';

describe('frontend store', () => {
  beforeEach(() => {
    useStore.setState({
      currentWorldId: null,
      currentCharacterId: null,
      currentSessionId: null,
      memoryRefreshTick: 0,
    });
  });

  it('会更新当前 world/character/session 并累加 memoryRefreshTick', () => {
    useStore.getState().setCurrentWorldId('world-1');
    useStore.getState().setCurrentCharacterId('char-1');
    useStore.getState().setCurrentSessionId('session-1');
    useStore.getState().triggerMemoryRefresh();

    expect(useStore.getState().currentWorldId).toBe('world-1');
    expect(useStore.getState().currentCharacterId).toBe('char-1');
    expect(useStore.getState().currentSessionId).toBe('session-1');
    expect(useStore.getState().memoryRefreshTick).toBe(1);
  });
});
