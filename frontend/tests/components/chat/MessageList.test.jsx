import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { createRef } from 'react';

const mocks = vi.hoisted(() => ({ getMessages: vi.fn() }));

vi.mock('../../../src/core/api/sessions.js', () => ({
  getMessages: (...args) => mocks.getMessages(...args),
}));

// 用轻量替身盯住「渲染形态选择」，避免把断言绑死在两个 item 组件的内部实现上
vi.mock('../../../src/components/chat/MessageItem.jsx', () => ({
  default: ({ message }) => <div data-testid="bubble" data-id={message.id}>{message.content}</div>,
}));
vi.mock('../../../src/components/writing/WritingMessageItem.jsx', () => ({
  default: ({ message, isStreaming }) => (
    <div data-testid="prose" data-id={message.id} data-streaming={String(!!isStreaming)}>
      {message.content}
    </div>
  ),
}));
vi.mock('../../../src/components/chat/ChapterDivider.jsx', () => ({
  default: ({ chapterIndex, title }) => <div data-testid="chapter" data-index={chapterIndex}>{title}</div>,
}));
vi.mock('../../../src/components/chat/OptionCard.jsx', () => ({
  default: ({ options }) => <div data-testid="active-options">{options.join('|')}</div>,
}));

import MessageList from '../../../src/components/chat/MessageList.jsx';

function makeMessages(count, startAt = 1) {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${startAt + i}`,
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `内容${startAt + i}`,
    created_at: startAt + i,
  }));
}

async function renderList(props = {}, ref = createRef()) {
  const view = render(<MessageList ref={ref} sessionId="s1" {...props} />);
  await waitFor(() => expect(mocks.getMessages).toHaveBeenCalled());
  return { view, ref };
}

beforeEach(() => {
  mocks.getMessages.mockReset();
  mocks.getMessages.mockResolvedValue(makeMessages(4));
});

describe('MessageList 的渲染形态', () => {
  it('prose=false 走气泡形态，不渲染章节', async () => {
    await renderList({ prose: false });
    await waitFor(() => expect(screen.getAllByTestId('bubble')).toHaveLength(4));
    expect(screen.queryByTestId('prose')).toBeNull();
    expect(screen.queryByTestId('chapter')).toBeNull();
  });

  it('prose=true 走散文形态并按章节分组', async () => {
    await renderList({ prose: true, chapterTurnSize: 1 });
    await waitFor(() => expect(screen.getAllByTestId('prose')).toHaveLength(4));
    expect(screen.queryByTestId('bubble')).toBeNull();
    expect(screen.getAllByTestId('chapter').length).toBeGreaterThan(0);
  });

  it('prose=true 时章节标题取 chapterTitles，缺省回落序章/续章', async () => {
    await renderList({
      prose: true,
      chapterTurnSize: 1,
      chapterTitles: { 1: { title: '自定义首章', is_default: false } },
    });
    await waitFor(() => expect(screen.getAllByTestId('chapter').length).toBeGreaterThan(0));
    const titles = screen.getAllByTestId('chapter').map((el) => el.textContent);
    expect(titles[0]).toBe('自定义首章');
    if (titles.length > 1) expect(titles[1]).toBe('续章');
  });

  it('章节投影按 m.id 建集合：_key 与 id 不同的消息仍会渲染', async () => {
    // 回归护栏：投影若改用 _key 会与 ch.messages 的 m.id 错位，整条消息被过滤掉
    mocks.getMessages.mockResolvedValue([
      { id: 'real-1', _key: 'temp-1', role: 'user', content: '带临时键的用户消息', created_at: 1 },
      { id: 'real-2', _key: 'stream-2', role: 'assistant', content: '带流式键的助手消息', created_at: 2 },
    ]);
    await renderList({ prose: true, chapterTurnSize: 10 });
    await waitFor(() => expect(screen.getAllByTestId('prose')).toHaveLength(2));
    expect(screen.getByText('带临时键的用户消息')).toBeTruthy();
    expect(screen.getByText('带流式键的助手消息')).toBeTruthy();
  });

  it('prose=true 且正在生成时，末页追加一条流式 stub 并并入末章', async () => {
    await renderList({
      prose: true,
      chapterTurnSize: 10,
      generating: true,
      streamingText: '正在写…',
      streamingKey: 'sk-1',
    });
    await waitFor(() => expect(screen.getAllByTestId('prose')).toHaveLength(5));
    const stub = screen.getByText('正在写…');
    expect(stub.getAttribute('data-streaming')).toBe('true');
    expect(screen.getAllByTestId('chapter')).toHaveLength(1);
  });
});

describe('MessageList 的命令式接口', () => {
  it('freezeOptions 冻结到最后一条 assistant，collapsed=false 时直接展开', async () => {
    const { ref } = await renderList({ prose: false });
    await waitFor(() => expect(screen.getAllByTestId('bubble')).toHaveLength(4));

    act(() => ref.current.freezeOptions(['甲', '乙'], 1, false));
    await waitFor(() => expect(screen.getByText('甲')).toBeTruthy());
    expect(screen.getByText('乙')).toBeTruthy();
    expect(screen.getByText('折叠')).toBeTruthy();
  });

  it('freezeOptions 的 collapsed=true 生成折叠态的历史选项卡', async () => {
    // 折叠态是 FrozenOptionCard 的「初始值」语义：同一实例不会因入参变化被重置，
    // 因此必须在新一次渲染里验证，不能沿用上一条用例的实例
    const { ref } = await renderList({ prose: false });
    await waitFor(() => expect(screen.getAllByTestId('bubble')).toHaveLength(4));

    act(() => ref.current.freezeOptions(['丙', '丁'], 0, true));
    await waitFor(() => expect(screen.getByText('展开')).toBeTruthy());
    expect(screen.queryByText('丙')).toBeNull();
  });

  it('freezeOptions 在没有 assistant 消息时安全返回', async () => {
    mocks.getMessages.mockResolvedValue([
      { id: 'u1', role: 'user', content: '只有用户消息', created_at: 1 },
    ]);
    const { ref } = await renderList({ prose: false });
    await waitFor(() => expect(screen.getAllByTestId('bubble')).toHaveLength(1));
    expect(() => act(() => ref.current.freezeOptions(['x'], 0, false))).not.toThrow();
    expect(screen.queryByText('x')).toBeNull();
  });

  it('appendMessage 会追加到列表末尾', async () => {
    const { ref } = await renderList({ prose: false });
    await waitFor(() => expect(screen.getAllByTestId('bubble')).toHaveLength(4));
    act(() => ref.current.appendMessage({ id: 'm99', role: 'assistant', content: '新追加', created_at: 99 }));
    await waitFor(() => expect(screen.getAllByTestId('bubble')).toHaveLength(5));
    expect(screen.getByText('新追加')).toBeTruthy();
  });
});

describe('MessageList 的分页', () => {
  it('按 pageTurnSize*2 切页，默认停在末页并上报页信息', async () => {
    mocks.getMessages.mockResolvedValue(makeMessages(10));
    const onPageInfoChange = vi.fn();
    await renderList({ prose: false, pageTurnSize: 2, onPageInfoChange });

    // 10 条 / 每页 4 条 = 3 页，followLast 默认停在第 3 页（index 2），该页 2 条
    await waitFor(() => expect(screen.getAllByTestId('bubble')).toHaveLength(2));
    await waitFor(() => expect(onPageInfoChange).toHaveBeenLastCalledWith({ totalPages: 3, currentPage: 2 }));
    expect(screen.getByText('内容9')).toBeTruthy();
  });

  it('多页会话初次加载直接贴底，不先跳到页顶', async () => {
    let resolveMessages;
    mocks.getMessages.mockReturnValue(new Promise((resolve) => { resolveMessages = resolve; }));
    const frames = [];
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb));
    const writes = [];
    const scrollTopDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    const scrollHeightDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight');
    Object.defineProperty(Element.prototype, 'scrollTop', { configurable: true, get: () => 0, set: (v) => { writes.push(v); } });
    Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, get: () => 999 });
    try {
      await renderList({ prose: false, pageTurnSize: 2 });
      // 空列表阶段的贴顶与本用例无关，先清掉
      while (frames.length) frames.shift()();
      writes.length = 0;

      await act(async () => { resolveMessages(makeMessages(10)); });
      await waitFor(() => expect(screen.getAllByTestId('bubble')).toHaveLength(2));
      while (frames.length) frames.shift()();
      expect(writes).toEqual([999]);
    } finally {
      rafSpy.mockRestore();
      Object.defineProperty(Element.prototype, 'scrollTop', scrollTopDesc);
      Object.defineProperty(Element.prototype, 'scrollHeight', scrollHeightDesc);
    }
  });

  it('setPage 切到指定页后不再跟随末页', async () => {
    mocks.getMessages.mockResolvedValue(makeMessages(10));
    const onPageInfoChange = vi.fn();
    const { ref } = await renderList({ prose: false, pageTurnSize: 2, onPageInfoChange });
    await waitFor(() => expect(screen.getAllByTestId('bubble')).toHaveLength(2));

    act(() => ref.current.setPage(0));
    await waitFor(() => expect(screen.getAllByTestId('bubble')).toHaveLength(4));
    expect(screen.getByText('内容1')).toBeTruthy();
    expect(screen.queryByText('内容9')).toBeNull();
    expect(onPageInfoChange).toHaveBeenLastCalledWith({ totalPages: 3, currentPage: 0 });
  });

  it('非末页时不渲染活跃选项卡', async () => {
    mocks.getMessages.mockResolvedValue(makeMessages(10));
    const { ref } = await renderList({ prose: true, pageTurnSize: 2, options: ['甲', '乙'], chapterTurnSize: 10 });
    await waitFor(() => expect(screen.getByTestId('active-options')).toBeTruthy());

    act(() => ref.current.setPage(0));
    await waitFor(() => expect(screen.queryByTestId('active-options')).toBeNull());
  });
});

describe('MessageList 的加载与错误态', () => {
  it('无 sessionId 时展示空提示', async () => {
    render(<MessageList sessionId={null} />);
    await waitFor(() => expect(screen.getByText('请选择或创建一个对话')).toBeTruthy());
  });

  it('加载失败时展示重试按钮，点击后重新拉取', async () => {
    mocks.getMessages.mockRejectedValueOnce(new Error('网络炸了'));
    render(<MessageList sessionId="s1" />);
    const retry = await screen.findByText('重试');

    mocks.getMessages.mockResolvedValue(makeMessages(2));
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getAllByTestId('bubble')).toHaveLength(2));
  });
});
