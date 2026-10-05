import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/core/api/middle-summary.js', () => ({
  getMiddleSummary: vi.fn(async () => ({ content: '旧摘要', coveredTo: 8, closedTo: 8 })),
  updateMiddleSummary: vi.fn(),
}));

import MiddleSummaryModal from '../../../src/components/session/MiddleSummaryModal.jsx';

describe('MiddleSummaryModal', () => {
  it('显示标题与整理到的轮数；未修改时直接关闭，有修改时先确认', async () => {
    const onClose = vi.fn();
    render(<MiddleSummaryModal sessionId="s1" onClose={onClose} />);
    const textarea = await screen.findByDisplayValue('旧摘要');

    expect(screen.getByText('剧情摘要')).toBeInTheDocument();
    expect(screen.getByText('已整理到第 8 轮')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.change(textarea, { target: { value: '新摘要' } });
    fireEvent.click(screen.getByText('取消'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText('放弃未保存的修改？')).toBeInTheDocument();

    fireEvent.click(screen.getByText('放弃'));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));
  });

  it('有进行中的事件时说明哪几轮还没整理', async () => {
    const { getMiddleSummary } = await import('../../../src/core/api/middle-summary.js');
    getMiddleSummary.mockResolvedValueOnce({ content: '旧摘要', coveredTo: 16, closedTo: 12 });
    render(<MiddleSummaryModal sessionId="s4" onClose={vi.fn()} />);
    expect(await screen.findByText('第 13–16 轮的事件还在进行中，结束后自动整理到这里')).toBeInTheDocument();
  });

  it('coveredTo 为 0 时显示尚未覆盖任何轮次', async () => {
    const { getMiddleSummary } = await import('../../../src/core/api/middle-summary.js');
    getMiddleSummary.mockResolvedValueOnce({ content: '', coveredTo: 0 });
    render(<MiddleSummaryModal sessionId="s2" onClose={vi.fn()} />);
    expect(await screen.findByText('尚未覆盖任何轮次')).toBeInTheDocument();
  });

  it('保存失败（会话尚无剧情记录，409）时显示错误提示', async () => {
    const { updateMiddleSummary } = await import('../../../src/core/api/middle-summary.js');
    updateMiddleSummary.mockRejectedValueOnce(new Error('updateMiddleSummary failed: 409'));
    render(<MiddleSummaryModal sessionId="s3" onClose={vi.fn()} />);
    await screen.findByDisplayValue('旧摘要');

    fireEvent.click(screen.getByText('保存'));
    expect(await screen.findByText('updateMiddleSummary failed: 409')).toBeInTheDocument();
  });
});
