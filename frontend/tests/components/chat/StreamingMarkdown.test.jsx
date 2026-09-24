import React from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ reduced: false }));

vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal()),
  useReducedMotion: () => mocks.reduced,
}));

import MessageItem from '../../../src/components/chat/MessageItem.jsx';
import WritingMessageItem from '../../../src/components/writing/WritingMessageItem.jsx';
import { STREAM } from '../../../src/core/utils/motion.js';

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

function streamItem(text, { isStreaming = true, showCaret = true } = {}) {
  return (
    <MessageItem
      message={{ id: 'stream-1', role: 'assistant', content: text, created_at: 0 }}
      character={{ name: '艾拉' }}
      worldId="world-1"
      isStreaming={isStreaming}
      streamingText={isStreaming ? text : undefined}
      showCaret={showCaret}
      onEdit={() => {}}
      onRegenerate={() => {}}
      onEditAssistant={() => {}}
    />
  );
}

const chars = (container) => [...container.querySelectorAll('.we-stream-char')];
const delays = (container) => chars(container).map((el) => parseInt(el.style.getPropertyValue('--we-stream-char-delay'), 10));

beforeEach(() => {
  global.ResizeObserver = ResizeObserverMock;
  mocks.reduced = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('流式书写', () => {
  it('还没有文字时只有一道书写光标，没有跳动圆点', () => {
    const { container } = render(streamItem(''));
    expect(container.querySelectorAll('.we-stream-caret')).toHaveLength(1);
    expect(container.querySelector('.typing-dot')).toBeNull();
  });

  it('新到的文字逐字出现：每个字单独一层，出现时刻依次后移', () => {
    const { container } = render(streamItem('风从北方'));
    expect(chars(container).map((el) => el.textContent)).toEqual(['风', '从', '北', '方']);
    const d = delays(container);
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThan(d[i - 1]);
    // 打字进行中由跟着字走的光标领路，常驻光标先不出现
    expect(container.querySelectorAll('.we-stream-char--caret')).toHaveLength(4);
    expect(container.querySelector('.we-stream-caret')).toBeNull();
  });

  it('后到的字排在前一段之后打出，已出现的字保持同一个元素', () => {
    const { container, rerender } = render(streamItem('风从北方'));
    const first = chars(container)[0];
    const lastOfFirst = delays(container)[3];

    rerender(streamItem('风从北方吹来，'));
    expect(chars(container).map((el) => el.textContent).join('')).toBe('风从北方吹来，');
    expect(chars(container)[0]).toBe(first);
    expect(delays(container)[4]).toBeGreaterThan(lastOfFirst);
  });

  it('打字进度最多落后真实到达 lag：一次到很多字时压缩间隔', () => {
    const long = '春'.repeat(200);
    const { container } = render(streamItem(long));
    const d = delays(container);
    expect(d[d.length - 1]).toBeLessThanOrEqual(STREAM.typing.lag * 1000);
  });

  it('打完后常驻光标停在最后一个字后面', () => {
    vi.useFakeTimers();
    const { container } = render(streamItem('夜色'));
    act(() => { vi.advanceTimersByTime(STREAM.typing.lag * 1000); });
    const caret = container.querySelector('.we-stream-caret');
    expect(caret.previousElementSibling.textContent).toBe('色');
    expect(container.querySelectorAll('.we-stream-caret')).toHaveLength(1);
  });

  it('打字追上真实到达后，已打完的字还原成普通文字，后到的字照常逐字出现', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(streamItem('夜色'));
    act(() => { vi.advanceTimersByTime((STREAM.typing.lag + STREAM.char.duration) * 1000); });
    expect(container.querySelector('.we-stream-char')).toBeNull();
    expect(container.querySelectorAll('.we-stream-caret')).toHaveLength(1);

    rerender(streamItem('夜色很深。'));
    expect(chars(container).map((el) => el.textContent)).toEqual(['很', '深', '。']);
  });

  it('生成持续进行时，早已显形的字去掉动画但保持同一个元素，结构变化时不会重打', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const { container, rerender } = render(streamItem('风从北方'));
    const first = chars(container)[0];
    // 持续有新字到达，打字一直没有完全追上
    for (const next of ['风从北方吹', '风从北方吹来', '风从北方吹来，']) {
      act(() => { vi.advanceTimersByTime(400); });
      rerender(streamItem(next));
    }
    // 只有刚到的字还在动画里
    expect(chars(container).map((el) => el.textContent).join('')).toBe('来，');
    const firstNow = container.querySelector('.we-message-content p span');
    expect(firstNow).toBe(first);
    expect(firstNow.className).toBe('');
  });

  it('生成结束时光标先暗下去，随后移除，正文不再逐字包裹', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(streamItem('夜色'));
    rerender(streamItem('夜色很深。'));
    act(() => { vi.advanceTimersByTime(STREAM.typing.lag * 1000); });
    rerender(streamItem('夜色很深。', { isStreaming: false }));

    expect(container.querySelector('.we-stream-caret--fading')).not.toBeNull();
    act(() => { vi.advanceTimersByTime((STREAM.char.duration + STREAM.caretOut.duration) * 1000); });
    expect(container.querySelector('.we-stream-caret')).toBeNull();
    expect(container.querySelector('.we-stream-char')).toBeNull();
    expect(container.querySelector('.we-message-content').textContent).toBe('夜色很深。');
  });

  it('在思考阶段中断后，思考块上不再留光标', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(streamItem('<think>先想一想'));
    act(() => { vi.advanceTimersByTime(STREAM.typing.lag * 1000); });
    expect(container.querySelectorAll('.we-stream-caret')).toHaveLength(1);

    rerender(streamItem('<think>先想一想\n\n[已中断]', { isStreaming: false }));
    act(() => { vi.advanceTimersByTime((STREAM.typing.lag + STREAM.char.duration + STREAM.caretOut.duration) * 1000); });
    expect(container.querySelector('.we-stream-caret')).toBeNull();
  });

  it('选项仍在流式更新时正文不挂光标', () => {
    const { container, rerender } = render(streamItem('', { showCaret: false }));
    expect(container.querySelector('.we-stream-caret')).toBeNull();
    rerender(streamItem('她点了点头。', { showCaret: false }));
    expect(container.querySelector('.we-stream-caret')).toBeNull();
    expect(container.querySelector('.we-stream-char--caret')).toBeNull();
  });

  it('减少动效时新文字直接显示，光标静止，结束直接移除', () => {
    mocks.reduced = true;
    const { container, rerender } = render(streamItem('雪'));
    rerender(streamItem('雪停了。'));
    expect(container.querySelector('.we-stream-char')).toBeNull();
    expect(container.querySelector('.we-stream-caret').getAttribute('style')).toBeNull();

    rerender(streamItem('雪停了。', { isStreaming: false }));
    expect(container.querySelector('.we-stream-caret')).toBeNull();
  });

  it('写作页复用同一套渲染：空文本时显示书写光标', () => {
    const { container } = render(
      <WritingMessageItem message={{ id: 'w-1', role: 'assistant', content: '' }} isStreaming />,
    );
    expect(container.querySelectorAll('.we-stream-caret')).toHaveLength(1);
  });
});
