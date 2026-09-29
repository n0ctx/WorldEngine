import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setMotionPack } from '../../../core/motion/motionPack.js';
import Compare from '../sketch/Compare.jsx';

describe('出样对照', () => {
  afterEach(() => {
    cleanup();
    setMotionPack('liquid');
  });

  it('左边是现在，右边是出样，只传 children 时两边渲染同一份并给出样一侧套上 sketchClass', () => {
    render(<Compare sketchClass="we-sketch-demo"><span>样本</span></Compare>);
    expect(screen.getByText('现在')).toBeInTheDocument();
    expect(screen.getByText('出样 · 未落地')).toBeInTheDocument();
    const samples = screen.getAllByText('样本');
    expect(samples).toHaveLength(2);
    expect(samples[1].parentElement).toHaveClass('we-sketch-demo');
  });

  it('当前动效包不在 packs 里时，出样一侧只说明沿用现在的动效', () => {
    setMotionPack('liquid');
    render(<Compare packs={['signal']} now={<span>现在的样本</span>} sketch={<span>出样的样本</span>} />);
    expect(screen.getByText('现在的样本')).toBeInTheDocument();
    expect(screen.queryByText('出样的样本')).not.toBeInTheDocument();
    expect(screen.getByText(/沿用现在的动效/)).toBeInTheDocument();
  });

  it('当前动效包在 packs 里时正常渲染出样', () => {
    setMotionPack('signal');
    render(<Compare packs={['signal']} now={<span>现在的样本</span>} sketch={<span>出样的样本</span>} />);
    expect(screen.getByText('出样的样本')).toBeInTheDocument();
  });
});
