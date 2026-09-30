import React from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ reduced: false, running: [] }));

// animate 由测试手动推进：记下每段动画，finishAnimations() 把它们一次走完
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal()),
  useReducedMotion: () => mocks.reduced,
  animate: (from, to, options) => {
    mocks.running.push({ to, options });
    return { stop() {} };
  },
}));

function finishAnimations() {
  const running = mocks.running.splice(0);
  for (const { to, options } of running) {
    options?.onUpdate?.(to);
    options?.onComplete?.();
  }
}

import ChangeText from '../../../src/components/motion/ChangeText.jsx';
import { useChangeBurst } from '../../../src/components/motion/useChangeBurst.js';
import StatusSection from '../../../src/components/state/StatusSection.jsx';
import ToastCard from '../../../src/components/ui/ToastCard.jsx';
import { DEFAULT_MOTION_PACK_ID, setMotionPack } from '../../../src/core/motion/motionPack.js';

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  global.ResizeObserver = ResizeObserverMock;
  mocks.reduced = false;
  mocks.running = [];
});

describe('ChangeText 信号故障文字', () => {
  it('没有 playKey 时只输出纯文字，不加故障层', () => {
    const { container } = render(<p><ChangeText text="贫民区" /></p>);
    expect(container.querySelector('p')).toHaveTextContent('贫民区');
    expect(container.querySelector('.we-fx-burst')).toBeNull();
  });

  it('切片成字：真字一直在 DOM 里，三层横带由同一段文字画出', () => {
    const { container } = render(<ChangeText text="地下拳场" playKey={1} decode />);
    const slice = container.querySelector('.we-fx-glyph');
    expect(slice).toHaveTextContent('地下拳场');
    expect(slice).toHaveAttribute('data-ch', '地下拳场');
    expect(slice.querySelector('.we-fx-glyph__face')).toHaveAttribute('data-ch', '地下拳场');
    expect(slice).toHaveAttribute('style', expect.stringContaining('--we-fx-decode'));
  });

  it('playKey 变化时重新挂载故障层，重播一次', () => {
    const { container, rerender } = render(<ChangeText text="62" playKey={1} />);
    const first = container.querySelector('.we-fx-burst');
    rerender(<ChangeText text="62" playKey={2} />);
    expect(container.querySelector('.we-fx-burst')).not.toBe(first);
    expect(container.querySelector('.we-fx-burst')).toHaveAttribute('data-text', '62');
  });

  describe('墨流包', () => {
    beforeEach(() => setMotionPack('liquid'));
    afterEach(() => setMotionPack(DEFAULT_MOTION_PACK_ID));

    it('变化的文字经过一枚畸变滤镜，文字本身仍在 DOM 里', () => {
      const { container } = render(<ChangeText text="62" playKey={1} />);
      const warp = container.querySelector('.we-ink-warp');
      const filterId = warp.querySelector('filter').id;
      expect(warp).toHaveAttribute('style', expect.stringContaining(`url(#${filterId})`));
      expect(warp.querySelector('feDisplacementMap')).not.toBeNull();
      expect(warp.querySelector('.we-fx-burst')).toHaveTextContent('62');
    });

    it('畸变平静后撤掉滤镜，但文字不重新挂载（入场动画不会再播一遍）', () => {
      const { container } = render(<ChangeText text="62" playKey={1} />);
      const text = container.querySelector('.we-fx-burst');
      act(() => finishAnimations());
      expect(container.querySelector('filter')).toBeNull();
      expect(container.querySelector('.we-ink-warp').style.filter).toBe('');
      expect(container.querySelector('.we-fx-burst')).toBe(text);
    });

    it('减少动态效果时不加滤镜', () => {
      mocks.reduced = true;
      const { container } = render(<ChangeText text="62" playKey={1} />);
      expect(container.querySelector('.we-ink-warp')).toBeNull();
      expect(container).toHaveTextContent('62');
    });
  });

  it('信号包不加畸变滤镜', () => {
    setMotionPack('signal');
    try {
      const { container } = render(<ChangeText text="62" playKey={1} />);
      expect(container.querySelector('.we-ink-warp')).toBeNull();
    } finally {
      setMotionPack(DEFAULT_MOTION_PACK_ID);
    }
  });

  it('减少动态效果时直接显示最终文字，不播放', () => {
    mocks.reduced = true;
    const { container } = render(<ChangeText text="地下拳场" playKey={1} decode />);
    expect(container).toHaveTextContent('地下拳场');
    expect(container.querySelector('.we-fx-burst, .we-fx-glyph')).toBeNull();
  });
});

describe('useChangeBurst', () => {
  it('首次挂载返回 null，值变了才返回旧值与递增的 key', () => {
    const { result, rerender } = renderHook(({ value }) => useChangeBurst(value), { initialProps: { value: '87' } });
    expect(result.current).toBeNull();

    rerender({ value: '62' });
    expect(result.current).toEqual({ from: '87', key: 1 });

    rerender({ value: '62' });
    expect(result.current).toEqual({ from: '87', key: 1 });

    rerender({ value: '91' });
    expect(result.current).toEqual({ from: '62', key: 2 });
  });
});

describe('StatusSection 本轮变化标签', () => {
  const hpRow = (value) => [{
    field_key: 'hp',
    label: '生命',
    type: 'number',
    max_value: 100,
    effective_value_json: JSON.stringify(value),
  }];

  it('本轮 diff 认定变化时刷出方向与幅度，首次渲染没有标签', () => {
    const { container, rerender } = render(<StatusSection headerless rows={hpRow(87)} changedKeys={new Set()} />);
    expect(container.querySelector('.we-change-tag')).toBeNull();

    rerender(<StatusSection headerless rows={hpRow(62)} changedKeys={new Set(['hp'])} />);
    const tag = container.querySelector('.we-change-tag');
    expect(tag).toHaveTextContent('▼25');
    expect(tag).toHaveClass('we-change-tag--down', 'we-change-tag--play');
  });

  it('文本字段变化时标「更新」', () => {
    const placeRow = (value) => [{ field_key: 'place', label: '位置', type: 'text', effective_value_json: JSON.stringify(value) }];
    const { container, rerender } = render(<StatusSection headerless rows={placeRow('贫民区')} changedKeys={new Set()} />);
    rerender(<StatusSection headerless rows={placeRow('地下拳场')} changedKeys={new Set(['place'])} />);
    expect(container.querySelector('.we-change-tag')).toHaveTextContent('更新');
    expect(container.querySelector('.we-change-tag')).toHaveClass('we-change-tag--neutral');
  });

  it('值变了但 diff 未认定（如切换会话）时不播放、不出标签', () => {
    const { container, rerender } = render(<StatusSection headerless rows={hpRow(87)} changedKeys={new Set()} />);
    rerender(<StatusSection headerless rows={hpRow(40)} changedKeys={new Set()} />);
    expect(container.querySelector('.we-change-tag')).toBeNull();
    expect(container.querySelector('.we-fx-burst')).toBeNull();
  });

  it('减少动态效果时标签静态显示，不带播放类', () => {
    mocks.reduced = true;
    const { container, rerender } = render(<StatusSection headerless rows={hpRow(40)} changedKeys={new Set()} />);
    rerender(<StatusSection headerless rows={hpRow(52)} changedKeys={new Set(['hp'])} />);
    const tag = container.querySelector('.we-change-tag');
    expect(tag).toHaveTextContent('▲12');
    expect(tag).not.toHaveClass('we-change-tag--play');
  });
});

describe('ToastCard 提示条', () => {
  it('所有类型都走信号故障，类型标签给出错误 / 警告 / 提示 / 完成', () => {
    const { container, rerender } = render(
      <ToastCard toast={{ id: 'a', type: 'success', message: '设置已保存' }} onClose={() => {}} />,
    );
    expect(container.querySelector('.we-toast-card')).toHaveClass('we-toast-card--fx');
    expect(screen.getByRole('status')).toHaveTextContent('完成');
    expect(screen.getByRole('status')).toHaveTextContent('设置已保存');

    rerender(<ToastCard toast={{ id: 'b', type: 'error', message: '保存失败' }} onClose={() => {}} />);
    expect(container.querySelector('.we-toast-card')).toHaveClass('we-toast-card--fx');
    expect(screen.getByRole('alert')).toHaveTextContent('错误');
  });

  it('减少动态效果时不播放故障，标签与正文直接显示', () => {
    mocks.reduced = true;
    const { container } = render(<ToastCard toast={{ id: 'c', type: 'info', message: '标题生成中…' }} onClose={() => {}} />);
    expect(container.querySelector('.we-toast-card')).not.toHaveClass('we-toast-card--fx');
    expect(container.querySelector('.we-fx-burst, .we-fx-glyph')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('提示标题生成中…');
  });
});
