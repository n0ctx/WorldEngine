import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchSessionCharacterStateValues,
  fetchSessionStateValues,
  resetSessionCharacterStateValues,
  resetSessionCharacterStateValuesByChar,
  resetSessionPersonaStateValues,
  resetSessionWorldStateValues,
} from '../../src/api/session-state-values.js';

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
});
