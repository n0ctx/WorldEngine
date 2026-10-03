import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchSessionStateValues: vi.fn(),
  fetchStateMemory: vi.fn(),
  fetchStateMemorySchema: vi.fn(),
}));

vi.mock('../../src/core/api/session-state-values.js', () => ({
  fetchSessionStateValues: (...args) => mocks.fetchSessionStateValues(...args),
}));
vi.mock('../../src/core/api/state-memory.js', () => ({
  fetchStateMemory: (...args) => mocks.fetchStateMemory(...args),
  fetchStateMemorySchema: (...args) => mocks.fetchStateMemorySchema(...args),
}));

import { useTurnChanges } from '../../src/core/hooks/useTurnChanges.js';

const row = (fieldKey, label, type, value) => ({
  field_key: fieldKey, label, type, effective_value_json: JSON.stringify(value),
});

function stateValues({ gold, place }) {
  return {
    world: [row('place', '地点', 'text', place)],
    persona: [row('gold', '资产', 'number', gold)],
    character: [],
  };
}

function memory({ mood, npcMood }) {
  return {
    entities: [
      { entity_id: 'e-main', type: 'character', card_id: 'char-1', name: '艾拉', dynamic: { 心情: mood }, profile: {}, fields: [] },
      { entity_id: 'e-npc', type: 'character', card_id: null, name: '老K', dynamic: { 心情: npcMood }, profile: {}, fields: [] },
    ],
  };
}

describe('useTurnChanges', () => {
  beforeEach(() => {
    mocks.fetchSessionStateValues.mockReset();
    mocks.fetchStateMemory.mockReset();
    mocks.fetchStateMemorySchema.mockReset().mockResolvedValue({ profileFields: {} });
  });

  it('首次加载不算变化；整理完一轮后列出变了的字段，带方向幅度与面板定位', async () => {
    mocks.fetchSessionStateValues.mockResolvedValueOnce(stateValues({ gold: 5000, place: '拳场' }));
    mocks.fetchStateMemory.mockResolvedValueOnce(memory({ mood: '平静', npcMood: '烦躁' }));
    const { result, rerender } = renderHook(({ round }) => useTurnChanges('s-1', round, 'char-1'), {
      initialProps: { round: 0 },
    });
    await waitFor(() => expect(mocks.fetchStateMemory).toHaveBeenCalledTimes(1));
    expect(result.current.changes).toEqual([]);

    mocks.fetchSessionStateValues.mockResolvedValueOnce(stateValues({ gold: 3000, place: '拳场' }));
    mocks.fetchStateMemory.mockResolvedValueOnce(memory({ mood: '紧张', npcMood: '烦躁' }));
    rerender({ round: 1 });

    await waitFor(() => expect(result.current.changes).toHaveLength(2));
    expect(result.current.round).toBe(1);
    expect(result.current.changes).toEqual([
      expect.objectContaining({ label: '资产', text: '▼2000', tone: 'down', target: { tab: 'player', fieldKeys: ['gold', 'extra:gold'] } }),
      expect.objectContaining({ label: '心情', text: '更新', tone: 'neutral', target: { tab: 'character', fieldKeys: ['state:心情'] } }),
    ]);
  });

  it('非主角色的 NPC 变化带上名字，定位到它自己的页签', async () => {
    mocks.fetchSessionStateValues.mockResolvedValue(stateValues({ gold: 5000, place: '拳场' }));
    mocks.fetchStateMemory.mockResolvedValueOnce(memory({ mood: '平静', npcMood: '烦躁' }));
    const { result, rerender } = renderHook(({ round }) => useTurnChanges('s-1', round, 'char-1'), {
      initialProps: { round: 0 },
    });
    await waitFor(() => expect(mocks.fetchStateMemory).toHaveBeenCalledTimes(1));

    mocks.fetchStateMemory.mockResolvedValueOnce(memory({ mood: '平静', npcMood: '高兴' }));
    rerender({ round: 1 });

    await waitFor(() => expect(result.current.changes).toHaveLength(1));
    expect(result.current.changes[0]).toEqual(expect.objectContaining({
      label: '老K·心情',
      target: { tab: 'e-npc', fieldKeys: ['state:心情'] },
    }));
  });
});
