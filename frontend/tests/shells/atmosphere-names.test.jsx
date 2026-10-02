import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getWorlds: vi.fn(),
  getCharactersByWorld: vi.fn(),
  listPersonas: vi.fn(),
}));

vi.mock('../../src/core/api/worlds.js', () => ({ getWorlds: mocks.getWorlds }));
vi.mock('../../src/core/api/characters.js', () => ({ getCharactersByWorld: mocks.getCharactersByWorld }));
vi.mock('../../src/core/api/personas.js', () => ({ listPersonas: mocks.listPersonas }));

import { useAtmosphereNames } from '../../src/shells/book-spread/atmosphere/useAtmosphereNames.js';

describe('背景氛围的名字', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorlds.mockResolvedValue([{ id: 'w1', name: '雾都' }, { id: 'w2', name: '长安' }]);
    mocks.getCharactersByWorld.mockImplementation(async (id) => (id === 'w1' ? [{ name: '林青雨' }, { name: '' }] : [{ name: '李白' }]));
    mocks.listPersonas.mockImplementation(async (id) => (id === 'w1' ? [{ name: '旅人' }, { name: '过客' }] : []));
  });

  it('取全部世界的世界名、角色名和玩家名，空名不取', async () => {
    const { result } = renderHook(() => useAtmosphereNames());
    await waitFor(() => expect(result.current).toEqual(['雾都', '长安', '林青雨', '旅人', '过客', '李白']));
  });

  it('某个世界的角色或玩家取不到时只少那一份', async () => {
    mocks.listPersonas.mockRejectedValue(new Error('500'));
    const { result } = renderHook(() => useAtmosphereNames());
    await waitFor(() => expect(result.current).toEqual(['雾都', '长安', '林青雨', '李白']));
  });

  it('世界列表取不到时返回空数组，场景用默认词', async () => {
    mocks.getWorlds.mockRejectedValue(new Error('500'));
    const { result } = renderHook(() => useAtmosphereNames());
    await waitFor(() => expect(mocks.getWorlds).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });
});
