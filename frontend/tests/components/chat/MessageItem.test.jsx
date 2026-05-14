import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, beforeAll, vi } from 'vitest';

import MessageItem from '../../../src/components/chat/MessageItem.jsx';

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

beforeAll(() => {
  global.ResizeObserver = ResizeObserverMock;
});

describe('MessageItem', () => {
  it('用户消息进入编辑态时保留镜像层并切换到无缝编辑 surface', () => {
    const onEdit = vi.fn();
    const { container } = render(
      <MessageItem
        message={{
          id: 'msg-1',
          role: 'user',
          content: '第一行\n第二行',
          created_at: '2026-05-14T09:30:00.000Z',
          attachments: [],
        }}
        persona={{ name: '玩家' }}
        character={null}
        worldId="world-1"
        isStreaming={false}
        streamingText=""
        onEdit={onEdit}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '编辑消息' }));

    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue('第一行\n第二行');
    expect(textarea.className).toContain('we-seamless-edit__textarea');
    expect(container.querySelector('.we-message-bubble--editing')).not.toBeNull();
    expect(container.querySelector('.we-seamless-edit__anchor[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByText('取消')).toBeInTheDocument();
    expect(screen.getByText('确认')).toBeInTheDocument();
  });
});
