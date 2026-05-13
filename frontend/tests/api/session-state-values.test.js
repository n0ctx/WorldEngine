import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchSessionCharacterStateValues,
  fetchSessionStateValues,
  patchSessionStateValue,
  resetSessionCharacterStateValues,
  resetSessionCharacterStateValuesByChar,
  resetSessionPersonaStateValues,
  resetSessionWorldStateValues,
} from '../../src/core/api/session-state-values.js';

describe('session state values api', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('会按正确 method/path 请求会话状态与重置接口', async () => {
    fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ world: [], persona: [], character: [] }) })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ world: ['w'] }) })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ persona: ['p'] }) })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ character: ['c'] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ hp: 10 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    await fetchSessionStateValues('session-1');
    await resetSessionWorldStateValues('session-1');
    await resetSessionPersonaStateValues('session-1');
    await resetSessionCharacterStateValues('session-1');
    await fetchSessionCharacterStateValues('session-1', 'char-1');
    await resetSessionCharacterStateValuesByChar('session-1', 'char-1');

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/sessions/session-1/state-values');
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/sessions/session-1/world-state-values', { method: 'DELETE' });
    expect(fetch).toHaveBeenNthCalledWith(4, '/api/sessions/session-1/persona-state-values', { method: 'DELETE' });
    expect(fetch).toHaveBeenNthCalledWith(6, '/api/sessions/session-1/character-state-values', { method: 'DELETE' });
    expect(fetch).toHaveBeenNthCalledWith(8, '/api/sessions/session-1/characters/char-1/state-values');
    expect(fetch).toHaveBeenNthCalledWith(9, '/api/sessions/session-1/characters/char-1/state-values', { method: 'DELETE' });
  });

  it('失败时会抛出明确的重置错误', async () => {
    fetch.mockResolvedValueOnce({ ok: false });
    await expect(resetSessionWorldStateValues('session-1')).rejects.toThrow('重置世界状态失败');
  });

  it('fetchSessionStateValues 失败时抛出统一错误', async () => {
    fetch.mockResolvedValueOnce({ ok: false });
    await expect(fetchSessionStateValues('s1')).rejects.toThrow('获取状态值失败');
  });

  it('其余两类重置失败时也抛出对应错误', async () => {
    fetch.mockResolvedValueOnce({ ok: false });
    await expect(resetSessionPersonaStateValues('s1')).rejects.toThrow('重置玩家状态失败');
    fetch.mockResolvedValueOnce({ ok: false });
    await expect(resetSessionCharacterStateValues('s1')).rejects.toThrow('重置角色状态失败');
    fetch.mockResolvedValueOnce({ ok: false });
    await expect(fetchSessionCharacterStateValues('s1', 'c1')).rejects.toThrow('获取角色状态失败');
    fetch.mockResolvedValueOnce({ ok: false });
    await expect(resetSessionCharacterStateValuesByChar('s1', 'c1')).rejects.toThrow('重置角色状态失败');
  });

  it('patchSessionStateValue 三个 category 走不同 URL', async () => {
    fetch.mockResolvedValue({ ok: true });
    await patchSessionStateValue('s1', 'world', 'weather', '"雨"');
    await patchSessionStateValue('s1', 'persona', 'mood', '"平静"');
    await patchSessionStateValue('s1', 'character', 'hp', '10', 'c1');

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/sessions/s1/world-state-values/weather', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ value_json: '"雨"' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/sessions/s1/persona-state-values/mood', expect.objectContaining({ method: 'PATCH' }));
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/sessions/s1/character-state-values/c1/hp', expect.objectContaining({ method: 'PATCH' }));
  });

  it('patchSessionStateValue 失败时抛 "更新状态值失败"', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false });
    await expect(patchSessionStateValue('s1', 'world', 'k', 'v')).rejects.toThrow('更新状态值失败');
  });
});
