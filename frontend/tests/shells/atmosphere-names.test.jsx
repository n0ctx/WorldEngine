import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  worldId: null,
  getWorlds: vi.fn(),
  getWorld: vi.fn(),
  getCharactersByWorld: vi.fn(),
  getPersona: vi.fn(),
}));

vi.mock('../../src/core/features/worldAccent/useWorldAccentVars.js', () => ({ useScopedWorldId: () => mocks.worldId }));
vi.mock('../../src/core/api/worlds.js', () => ({ getWorlds: mocks.getWorlds, getWorld: mocks.getWorld }));
vi.mock('../../src/core/api/characters.js', () => ({ getCharactersByWorld: mocks.getCharactersByWorld }));
vi.mock('../../src/core/api/personas.js', () => ({ getPersona: mocks.getPersona }));

import { useAtmosphereNames } from '../../src/shells/book-spread/atmosphere/useAtmosphereNames.js';

describe('背景氛围的名字', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorlds.mockResolvedValue([{ name: '雾都' }, { name: '长安' }]);
    mocks.getWorld.mockResolvedValue({ name: '雾都' });
    mocks.getCharactersByWorld.mockResolvedValue([{ name: '林青雨' }, { name: '' }]);
    mocks.getPersona.mockResolvedValue({ name: '旅人' });
  });

  it('书架层取全部世界名', async () => {
    mocks.worldId = null;
    const { result } = renderHook(() => useAtmosphereNames());
    await waitFor(() => expect(result.current).toEqual(['雾都', '长安']));
    expect(mocks.getWorld).not.toHaveBeenCalled();
  });

  it('世界内取世界名、角色名和当前玩家名，空名不取；没有玩家时只少这一项', async () => {
    mocks.worldId = 'w1';
    const { result } = renderHook(() => useAtmosphereNames());
    await waitFor(() => expect(result.current).toEqual(['雾都', '林青雨', '旅人']));

    mocks.getPersona.mockRejectedValue(new Error('404'));
    mocks.worldId = 'w2';
    const next = renderHook(() => useAtmosphereNames());
    await waitFor(() => expect(next.result.current).toEqual(['雾都', '林青雨']));
  });

  it('换了世界、新名字还没回来时不沿用上一个世界的名字', async () => {
    mocks.worldId = 'w1';
    const { result, rerender } = renderHook(() => useAtmosphereNames());
    await waitFor(() => expect(result.current).toHaveLength(3));
    mocks.getWorld.mockReturnValue(new Promise(() => {}));
    mocks.worldId = 'w2';
    rerender();
    expect(result.current).toEqual([]);
  });
});
