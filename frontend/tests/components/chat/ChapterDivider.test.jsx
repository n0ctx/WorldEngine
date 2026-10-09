import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ChapterDivider from '../../../src/components/chat/ChapterDivider.jsx';

describe('ChapterDivider', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} unobserve() {} });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('章节标题带阿拉伯数字章号的 data-chapter，供主题皮肤把章号印进编号格', () => {
    const { container } = render(<ChapterDivider chapterIndex={3} title="雨夜里的拳场" />);
    expect(screen.getByRole('heading', { name: '雨夜里的拳场' })).toBeInTheDocument();
    expect(container.querySelector('.we-chapter-header')).toHaveAttribute('data-chapter', '3');
  });
});
