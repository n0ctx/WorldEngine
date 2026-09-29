import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MOTION_PACKS, setMotionPack } from '../../../core/motion/motionPack.js';
import MotionTab from '../MotionTab.jsx';

// 分类 → 该分类下带出样对照的动效位数量
const SKETCHED = [
  { category: '出现与消失', count: 2 },
  { category: '按压与悬停', count: 1 },
  { category: '输入控件', count: 2 },
  { category: '列表与排序', count: 1 },
];

describe('动效出样', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} unobserve() {} });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    cleanup();
    setMotionPack('liquid');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  for (const packId of Object.keys(MOTION_PACKS)) {
    it(`${packId} 包下 6 个未接入动效包的动效位都是「现在 / 出样 · 未落地」对照`, () => {
      setMotionPack(packId);
      render(<MemoryRouter><MotionTab /></MemoryRouter>);
      for (const { category, count } of SKETCHED) {
        fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${category}`) }));
        expect(screen.getAllByText('出样 · 未落地')).toHaveLength(count);
        expect(screen.getAllByText('现在')).toHaveLength(count);
      }
    });
  }

  it('剧情选项卡出样可点选，点选后其余选项被锁定', () => {
    render(<MemoryRouter><MotionTab /></MemoryRouter>);
    const sketch = screen.getAllByText('出样 · 未落地')[0].parentElement;
    const options = sketch.querySelectorAll('.we-option-btn');
    expect(options).toHaveLength(3);
    fireEvent.click(options[1]);
    expect(options[1]).toHaveClass('we-option-btn--selected');
    expect(options[0]).toHaveClass('we-option-btn--disabled');
  });
});
