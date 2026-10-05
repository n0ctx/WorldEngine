import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import MessageItem from '../../../src/components/chat/MessageItem.jsx';
import SpeakerStage from '../../../src/components/chat/SpeakerStage.jsx';
import useStageCompact from '../../../src/components/chat/useStageCompact.js';
import TurnChangeStrip from '../../../src/components/chat/TurnChangeStrip.jsx';
import WritingMessageItem from '../../../src/components/writing/WritingMessageItem.jsx';
import useSidePanelsStore from '../../../src/core/state/sidePanels.js';

beforeAll(() => {
  global.ResizeObserver = class { observe() {} disconnect() {} };
});

afterEach(() => {
  useSidePanelsStore.setState({ rightOpen: false, stateFocus: null });
});

const live = { id: 'stream-1', role: 'assistant', content: '', created_at: 0 };
const props = { character: { name: '艾拉' }, persona: null, worldId: 'w-1', onEdit: () => {}, onRegenerate: () => {} };

describe('回复的开始与收尾', () => {
  it('等首字时标记为开始，流式转为定稿时标记为收尾；历史消息不标记', () => {
    const { container, rerender } = render(<MessageItem {...props} message={live} isStreaming streamingText="" />);
    expect(container.querySelector('.we-message-assistant').dataset.moment).toBe('start');

    rerender(<MessageItem {...props} message={live} isStreaming streamingText="雨" />);
    expect(container.querySelector('.we-message-assistant').dataset.moment).toBeUndefined();

    rerender(<MessageItem {...props} message={{ ...live, content: '雨夜' }} isStreaming={false} streamingText={undefined} />);
    expect(container.querySelector('.we-message-assistant').dataset.moment).toBe('end');

    const history = render(<MessageItem {...props} message={{ ...live, id: 'old', content: '旧回复' }} isStreaming={false} />);
    expect(history.container.querySelector('.we-message-assistant').dataset.moment).toBeUndefined();
  });

  it('写作页的整段叙事同样标记开始与收尾', () => {
    const message = { id: 'w-stream', role: 'assistant', content: '', created_at: 0 };
    const { container, rerender } = render(<WritingMessageItem message={message} isStreaming worldId="w-1" />);
    expect(container.querySelector('.we-writing-prose').dataset.moment).toBe('start');
    rerender(<WritingMessageItem message={{ ...message, content: '天亮了。' }} isStreaming={false} worldId="w-1" />);
    expect(container.querySelector('.we-writing-prose').dataset.moment).toBe('end');
  });
});

describe('本轮变化条', () => {
  const changes = [
    { id: 'gold', label: '资产', text: '▼2000', tone: 'down', target: { tab: 'player', fieldKeys: ['gold', 'extra:gold'] } },
    { id: 'place', label: '地点', text: '更新', tone: 'neutral', target: { tab: null, fieldKeys: ['place'] } },
  ];

  it('挂在回复下方，点一枚就展开状态面板并请求定位到那个字段', () => {
    render(<MessageItem {...props} message={{ id: 'm-1', role: 'assistant', content: '雨夜', created_at: 0 }} isStreaming={false} turnChanges={changes} />);
    fireEvent.click(screen.getByRole('button', { name: /资产 ▼2000/ }));
    const { rightOpen, stateFocus } = useSidePanelsStore.getState();
    expect(rightOpen).toBe(true);
    expect(stateFocus).toEqual(expect.objectContaining({ tab: 'player', fieldKeys: ['gold', 'extra:gold'] }));
  });

  it('超过六项时其余收进「另有 N 项」', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...changes[1], id: `f${i}`, label: `字段${i}` }));
    render(<TurnChangeStrip changes={many} />);
    expect(screen.getAllByRole('button', { name: /在状态面板中查看/ })).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: '另有 2 项' }));
    expect(useSidePanelsStore.getState().stateFocus).toEqual(expect.objectContaining({ tab: null, fieldKeys: [] }));
  });
});

describe('台前', () => {
  const world = { id: 'w-1', name: '无限轮回', description: '雨夜与拳场', cover_path: null };

  it('对话页：展开时是大台前（世界名、角色名、简介），收起后只留一行台前', () => {
    const character = { id: 'c-1', name: '艾拉', description: '拳场的老板娘' };
    const { container, rerender } = render(<SpeakerStage character={character} world={world} />);
    const stage = container.querySelector('.we-speaker-stage');
    expect(stage.dataset.compact).toBeUndefined();
    expect(container.querySelector('.we-speaker-stage__headline').textContent).toBe('艾拉');
    expect(container.querySelector('.we-speaker-stage__world').textContent).toBe('无限轮回');
    expect(container.querySelector('.we-speaker-stage__hero-slot').getAttribute('aria-hidden')).toBe('false');

    rerender(<SpeakerStage character={character} world={world} compact />);
    expect(stage.dataset.compact).toBe('true');
    expect(container.querySelector('.we-speaker-stage__hero-slot').getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.we-speaker-stage__bar').getAttribute('aria-hidden')).toBe('false');
  });

  it('写作页：没有角色时大标题是世界名，收起后不留一行', () => {
    const { container } = render(<SpeakerStage world={world} />);
    expect(container.querySelector('.we-speaker-stage__headline').textContent).toBe('无限轮回');
    expect(container.querySelector('.we-speaker-stage__intro').textContent).toBe('雨夜与拳场');
    expect(container.querySelector('.we-speaker-stage').dataset.bare).toBe('true');
    expect(container.querySelector('.we-speaker-stage__cast')).toBeNull();
  });

  it('正文没定位好时只占位不露面，大台前等定下来再上台', () => {
    const { container, rerender } = render(<SpeakerStage world={world} pending />);
    const stage = container.querySelector('.we-speaker-stage');
    expect(stage.dataset.pending).toBe('true');
    expect(container.querySelector('.we-speaker-stage__hero')).toBeNull();

    rerender(<SpeakerStage world={world} compact instant />);
    expect(stage.dataset.pending).toBeUndefined();
    expect(stage.dataset.compact).toBe('true');
    expect(stage.dataset.instant).toBe('true');
    expect(container.querySelector('.we-speaker-stage__hero')).not.toBeNull();
  });

  it('长会话贴底后直接收起不走过渡，短会话直接展开；之后的滚动照常带过渡', () => {
    const { result } = renderHook(() => useStageCompact());
    expect(result.current).toMatchObject({ compact: false, settled: false });

    act(() => result.current.onSettled({ scrollTop: 800 }));
    expect(result.current).toMatchObject({ compact: true, settled: true, instant: true });

    act(() => result.current.onScroll({ currentTarget: { scrollTop: 0, scrollHeight: 1200, clientHeight: 400 } }));
    expect(result.current).toMatchObject({ compact: false, instant: false });

    act(() => result.current.onSettled({ scrollTop: 0 }));
    expect(result.current).toMatchObject({ compact: false, instant: true });
    act(() => result.current.onSettled(null));
    expect(result.current).toMatchObject({ compact: false, settled: true });
  });

  it('角色和世界都没到时只占位不露面，到了按已定的收放直接露面', () => {
    const character = { id: 'c-1', name: '艾拉', description: '拳场的老板娘' };
    const { container, rerender } = render(<SpeakerStage compact />);
    const stage = container.querySelector('.we-speaker-stage');
    expect(stage.dataset.pending).toBe('true');
    // 对话页角色没到时也不当作写作页，收起时仍占一行台前的高度
    expect(stage.dataset.bare).toBeUndefined();
    expect(container.querySelector('.we-speaker-stage__hero')).toBeNull();

    rerender(<SpeakerStage character={character} compact />);
    expect(stage.dataset.pending).toBeUndefined();
    expect(stage.dataset.compact).toBe('true');
    expect(container.querySelector('.we-speaker-stage__name').textContent).toBe('艾拉');
  });
});
