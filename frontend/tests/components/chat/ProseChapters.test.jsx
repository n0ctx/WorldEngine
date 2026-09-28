import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// 用轻量替身盯住「onEditAssistant 是否被传入」，不绑死在 WritingMessageItem 内部实现上
vi.mock('../../../src/components/writing/WritingMessageItem.jsx', () => ({
  default: ({ message, onEditAssistant }) => (
    <div data-testid="prose" data-id={message.id} data-editable={String(!!onEditAssistant)}>
      {message.content}
    </div>
  ),
}));
// ChapterDivider 用 IntersectionObserver 做刻度联动，与本测试无关，替身避免环境缺失该 API
vi.mock('../../../src/components/chat/ChapterDivider.jsx', () => ({
  default: ({ title }) => <div data-testid="chapter">{title}</div>,
}));

import ProseChapters from '../../../src/components/chat/ProseChapters.jsx';

function makeChapters() {
  return [
    {
      chapterIndex: 1,
      messages: [
        { id: 'u1', role: 'user', content: '第一问', created_at: 1 },
        { id: 'a1', role: 'assistant', content: '第一答', created_at: 2 },
        { id: 'u2', role: 'user', content: '第二问', created_at: 3 },
        { id: 'a2', role: 'assistant', content: '第二答', created_at: 4 },
      ],
    },
  ];
}

describe('ProseChapters 的编辑入口', () => {
  it('只把 onEditAssistant 传给最后一条 assistant 消息，其余置空', () => {
    const onEditAssistantMessage = vi.fn();
    render(
      <ProseChapters
        chapters={makeChapters()}
        chapterTitles={{}}
        onEditAssistantMessage={onEditAssistantMessage}
        lastAssistantId="a2"
        options={[]}
      />
    );

    const items = screen.getAllByTestId('prose');
    const byId = Object.fromEntries(items.map((el) => [el.dataset.id, el.dataset.editable]));
    expect(byId.a1).toBe('false');
    expect(byId.a2).toBe('true');
    expect(byId.u1).toBe('false');
    expect(byId.u2).toBe('false');
  });

  it('流式占位消息不传 onEditAssistant，即使命中 lastAssistantId', () => {
    const onEditAssistantMessage = vi.fn();
    render(
      <ProseChapters
        chapters={[
          {
            chapterIndex: 1,
            messages: [
              { id: 'a2', role: 'assistant', content: '正在写', created_at: 4, _isStream: true },
            ],
          },
        ]}
        chapterTitles={{}}
        onEditAssistantMessage={onEditAssistantMessage}
        lastAssistantId="a2"
        options={[]}
      />
    );

    expect(screen.getByTestId('prose').dataset.editable).toBe('false');
  });
});
