import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// 用轻量替身盯住「onEditAssistant 是否被传入」，不绑死在 MessageItem 内部实现上
vi.mock('../../../src/components/chat/MessageItem.jsx', () => ({
  default: ({ message, onEditAssistant }) => (
    <div data-testid="bubble" data-id={message.id} data-editable={String(!!onEditAssistant)}>
      {message.content}
    </div>
  ),
}));

import MessageBubbles from '../../../src/components/chat/MessageBubbles.jsx';

function makeMessages() {
  return [
    { id: 'u1', role: 'user', content: '第一问', created_at: 1 },
    { id: 'a1', role: 'assistant', content: '第一答', created_at: 2 },
    { id: 'u2', role: 'user', content: '第二问', created_at: 3 },
    { id: 'a2', role: 'assistant', content: '第二答', created_at: 4 },
  ];
}

describe('MessageBubbles 的编辑入口', () => {
  it('只把 onEditAssistant 传给最后一条 assistant 消息，其余置空', () => {
    const onEditAssistantMessage = vi.fn();
    render(
      <MessageBubbles
        messagesForDisplay={makeMessages()}
        onEditAssistantMessage={onEditAssistantMessage}
        lastAssistantId="a2"
        options={[]}
      />
    );

    const bubbles = screen.getAllByTestId('bubble');
    const byId = Object.fromEntries(bubbles.map((el) => [el.dataset.id, el.dataset.editable]));
    expect(byId.a1).toBe('false');
    expect(byId.a2).toBe('true');
    expect(byId.u1).toBe('false');
    expect(byId.u2).toBe('false');
  });
});
