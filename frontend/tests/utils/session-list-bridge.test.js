import { describe, expect, it, vi } from 'vitest';

import { chatSessionListBridge, writingSessionListBridge } from '../../src/utils/session-list-bridge.js';

describe('session list bridge', () => {
  it('暴露可变桥接函数槽位', () => {
    const chat = vi.fn();
    const writing = vi.fn();

    chatSessionListBridge.updateTitle = chat;
    writingSessionListBridge.addSession = writing;

    chatSessionListBridge.updateTitle('s1', '标题');
    writingSessionListBridge.addSession({ id: 's2' });

    expect(chat).toHaveBeenCalledWith('s1', '标题');
    expect(writing).toHaveBeenCalledWith({ id: 's2' });

    chatSessionListBridge.updateTitle = null;
    writingSessionListBridge.addSession = null;
  });
});
