import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, beforeAll, vi } from 'vitest';

import MessageItem from '../../../src/components/chat/MessageItem.jsx';
import { useDisplaySettingsStore } from '../../../src/core/state/displaySettings.js';

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

  it('祖先缩放或页面缩放时，编辑框宽度按布局尺寸锁定，不随测量放大', () => {
    let notifyResize;
    const PrevResizeObserver = global.ResizeObserver;
    global.ResizeObserver = class {
      constructor(callback) { notifyResize = callback; }
      observe() {}
      disconnect() {}
    };
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 375, height: 50, top: 0, left: 0, right: 375, bottom: 50 });

    try {
      const { container } = render(
        <MessageItem
          message={{ id: 'msg-1', role: 'user', content: '一句话', created_at: '2026-05-14T09:30:00.000Z' }}
          persona={{ name: '玩家' }}
          character={null}
          worldId="world-1"
          isStreaming={false}
          streamingText=""
          onEdit={vi.fn()}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: '编辑消息' }));
      container.querySelector('.we-seamless-edit__anchor').style.width = '300px';
      act(() => notifyResize());
      act(() => notifyResize());

      expect(container.querySelector('.we-seamless-edit__surface').style.width).toBe('300px');
    } finally {
      rectSpy.mockRestore();
      global.ResizeObserver = PrevResizeObserver;
    }
  });

  it('用户消息保留 HTML 清洗、附件预览、复制和删除确认', () => {
    const onDelete = vi.fn();
    const writeText = vi.fn();
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    try {
      const { container } = render(
        <MessageItem
          message={{
            id: 'msg-user-actions',
            role: 'user',
            content: '<strong>安全文本</strong><img src="x" onerror="alert(1)">',
            created_at: '2026-05-14T09:30:00.000Z',
            attachments: ['upload-1.png'],
          }}
          persona={{ name: '玩家' }}
          character={null}
          worldId="world-1"
          isStreaming={false}
          streamingText=""
          onDelete={onDelete}
        />
      );

      expect(container.querySelector('strong')?.textContent).toBe('安全文本');
      expect(container.querySelector('img[onerror]')).toBeNull();
      expect(container.querySelector('.we-message-attachments img')?.getAttribute('src'))
        .toBe('/api/uploads/upload-1.png');

      fireEvent.click(screen.getByRole('button', { name: '复制消息内容' }));
      expect(writeText).toHaveBeenCalledWith('<strong>安全文本</strong><img src="x" onerror="alert(1)">');

      fireEvent.click(screen.getByRole('button', { name: '删除消息' }));
      fireEvent.click(screen.getByRole('button', { name: '确认删除消息' }));
      expect(onDelete).toHaveBeenCalledWith('msg-user-actions');
    } finally {
      if (originalClipboard) {
        Object.defineProperty(navigator, 'clipboard', originalClipboard);
      } else {
        delete navigator.clipboard;
      }
    }
  });

  it('AI 消息保留思考块、token 费用、激活条目和无缝编辑', () => {
    const onEditAssistant = vi.fn();
    const previousSettings = useDisplaySettingsStore.getState();
    act(() => {
      useDisplaySettingsStore.setState({
        showThinking: true,
        autoCollapseThinking: false,
        showTokenUsage: true,
        currentModelPricing: { inputPrice: 1, outputPrice: 2 },
      });
    });

    try {
      const { container } = render(
        <MessageItem
          message={{
            id: 'msg-assistant-actions',
            role: 'assistant',
            content: '<think>先分析</think><p>回答正文</p><img src="x" onerror="alert(1)">',
            created_at: '2026-05-14T09:30:00.000Z',
            token_usage: { prompt_tokens: 1000, completion_tokens: 2000 },
            activated_entries: [{ id: 'entry-1', title: '角色规则', trigger_type: 'keyword' }],
            attachments: ['upload-2.png'],
          }}
          persona={null}
          character={{ name: '艾拉' }}
          worldId="world-1"
          isStreaming={false}
          streamingText=""
          onRegenerate={vi.fn()}
          onEditAssistant={onEditAssistant}
        />
      );

      expect(container.querySelector('.we-think-block')).not.toBeNull();
      expect(screen.getByText('先分析')).toBeInTheDocument();
      expect(screen.getByText('回答正文')).toBeInTheDocument();
      expect(container.querySelector('img[onerror]')).toBeNull();
      expect(container.querySelector('.we-token-usage')?.textContent).toContain('↑1K');
      expect(container.querySelector('.we-token-usage')?.textContent).toContain('↓2K');
      expect(container.querySelector('.we-token-usage-cost')?.textContent).toBe('$0.0050');
      expect(screen.getByText('角色规则')).toBeInTheDocument();
      expect(container.querySelector('.we-message-attachments img')?.getAttribute('src'))
        .toBe('/api/uploads/upload-2.png');

      fireEvent.click(screen.getByRole('button', { name: '编辑 AI 回复' }));
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '调整后的回答' } });
      fireEvent.click(screen.getByText('保存'));
      expect(onEditAssistant).toHaveBeenCalledWith('msg-assistant-actions', '调整后的回答');
    } finally {
      act(() => {
        useDisplaySettingsStore.setState({
          showThinking: previousSettings.showThinking,
          autoCollapseThinking: previousSettings.autoCollapseThinking,
          showTokenUsage: previousSettings.showTokenUsage,
          currentModelPricing: previousSettings.currentModelPricing,
        });
      });
    }
  });

  it('没有 onEditAssistant 的 AI 消息不显示编辑入口', () => {
    render(
      <MessageItem
        message={{ id: 'msg-assistant-readonly', role: 'assistant', content: '较早的回答', created_at: 1 }}
        onRegenerate={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '重新生成 AI 回复' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑 AI 回复' })).toBeNull();
  });
});
