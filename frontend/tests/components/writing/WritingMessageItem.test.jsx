import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, beforeAll, vi } from 'vitest';

import WritingMessageItem from '../../../src/components/writing/WritingMessageItem.jsx';

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

beforeAll(() => {
  global.ResizeObserver = ResizeObserverMock;
});

const assistant = { id: 'w-asst', role: 'assistant', content: '正文段落', created_at: 1 };

describe('WritingMessageItem 的 AI 回复编辑入口', () => {
  it('传入 onEditAssistant 时显示编辑按钮', () => {
    render(<WritingMessageItem message={assistant} onRegenerate={vi.fn()} onEditAssistant={vi.fn()} />);
    expect(screen.getByRole('button', { name: /编辑/ })).toBeInTheDocument();
  });

  it('没有 onEditAssistant 时不显示编辑按钮', () => {
    render(<WritingMessageItem message={assistant} onRegenerate={vi.fn()} />);
    expect(screen.getByRole('button', { name: /重新生成/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /编辑/ })).toBeNull();
  });
});
