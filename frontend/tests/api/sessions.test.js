import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSession,
  deleteMessage,
  deleteSession,
  editMessage,
  getLatestChatSession,
  getMessages,
  getSession,
  getSessions,
  renameSession,
} from '../../src/api/sessions.js';

describe('sessions api', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('发送会话相关请求', async () => {
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });

    await getSessions('char-1', 5, 10);
    await getSession('session-1');
    await getLatestChatSession('world-1');
    await createSession('char-1');
    await renameSession('session-1', '新标题');
    await getMessages('session-1', 3, 6);
    await editMessage('msg-1', '新内容');
    await deleteMessage('session-1', 'msg-1');
    await deleteSession('session-1');

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/characters/char-1/sessions?limit=5&offset=10');
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/sessions/session-1');
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/worlds/world-1/latest-chat-session');
    expect(fetch).toHaveBeenNthCalledWith(4, '/api/characters/char-1/sessions', expect.objectContaining({ method: 'POST' }));
    expect(fetch).toHaveBeenNthCalledWith(5, '/api/sessions/session-1/title', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ title: '新标题' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(6, '/api/sessions/session-1/messages?limit=3&offset=6');
    expect(fetch).toHaveBeenNthCalledWith(7, '/api/messages/msg-1', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ content: '新内容' }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(8, '/api/sessions/session-1/messages/msg-1', expect.objectContaining({ method: 'DELETE' }));
    expect(fetch).toHaveBeenNthCalledWith(9, '/api/sessions/session-1', expect.objectContaining({ method: 'DELETE' }));
  });

  it('在 4xx/5xx 时抛出带状态码的错误', async () => {
    fetch
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 400 });

    await expect(getSession('missing')).rejects.toThrow('getSession failed: 404');
    await expect(renameSession('bad', 'x')).rejects.toThrow('renameSession failed: 500');
    await expect(deleteSession('bad')).rejects.toThrow('deleteSession failed: 400');
  });
});
