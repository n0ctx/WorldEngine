import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BackButton from '../../../src/components/blocks/BackButton.jsx';

describe('BackButton', () => {
  it('默认 label "返回" 快照', () => {
    const { container } = render(<BackButton onClick={vi.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('自定义 label 快照', () => {
    const { container } = render(<BackButton onClick={vi.fn()} label="所有世界" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('渲染默认 label 文本', () => {
    render(<BackButton onClick={vi.fn()} />);
    expect(screen.getByText(/返回/)).toBeInTheDocument();
  });

  it('渲染自定义 label 文本', () => {
    render(<BackButton onClick={vi.fn()} label="所有世界" />);
    expect(screen.getByText(/所有世界/)).toBeInTheDocument();
  });

  it('点击调用 onClick', () => {
    const onClick = vi.fn();
    render(<BackButton onClick={onClick} label="返回" />);
    fireEvent.click(screen.getByText(/返回/));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
