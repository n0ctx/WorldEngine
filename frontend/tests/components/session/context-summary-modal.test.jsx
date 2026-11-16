import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const block = (patch = {}) => ({
  id: 'b1', no: 1, tier: 1, topic: '码头夜袭', summary: '林岚在码头截下了走私船。', fromRound: 1, toRound: 6, ...patch,
});
const stats = (patch = {}) => ({
  latestRound: 20, coveredRounds: 6, activeBlocks: 1, rawRounds: 14, compressionRatio: 4.2, usage: 0.31, lastOutcome: 'compressed', lastError: null, ...patch,
});

vi.mock('../../../src/core/api/context-blocks.js', () => ({
  getContextOverview: vi.fn(),
  getContextBlockSource: vi.fn(),
  updateContextBlock: vi.fn(),
  restoreContextBlock: vi.fn(),
  searchContext: vi.fn(),
}));

import * as api from '../../../src/core/api/context-blocks.js';
import ContextSummaryModal from '../../../src/components/session/ContextSummaryModal.jsx';
import { statsHint } from '../../../src/components/session/context-summary-format.js';

describe('ContextSummaryModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getContextOverview.mockResolvedValue({ blocks: [block()], stats: stats() });
  });

  it('列出在用的摘要块与统计；未修改时直接关闭，有修改时先确认', async () => {
    const onClose = vi.fn();
    render(<ContextSummaryModal sessionId="s1" onClose={onClose} />);
    const textarea = await screen.findByDisplayValue('林岚在码头截下了走私船。');

    expect(screen.getByText('剧情摘要')).toBeInTheDocument();
    expect(screen.getByText('第 1–6 轮 · 码头夜袭')).toBeInTheDocument();
    expect(screen.getByText(/共 20 轮，6 轮已整理成 1 段摘要，约为原文的 1\/4，14 轮保留原文/)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.change(textarea, { target: { value: '改过的摘要' } });
    fireEvent.click(screen.getByText('关闭'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText('放弃未保存的修改？')).toBeInTheDocument();
    fireEvent.click(screen.getByText('放弃'));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));
  });

  it('保存单段摘要；后端报错时显示错误', async () => {
    api.updateContextBlock
      .mockRejectedValueOnce(new Error('摘要不能超过 4000 字'))
      .mockResolvedValueOnce({ block: block({ summary: '改过的摘要' }) });
    render(<ContextSummaryModal sessionId="s1" onClose={vi.fn()} />);
    fireEvent.change(await screen.findByDisplayValue('林岚在码头截下了走私船。'), { target: { value: '改过的摘要' } });

    fireEvent.click(screen.getByText('保存这段'));
    expect(await screen.findByText('摘要不能超过 4000 字')).toBeInTheDocument();

    fireEvent.click(screen.getByText('保存这段'));
    await vi.waitFor(() => expect(screen.queryByText('保存这段')).not.toBeInTheDocument());
    expect(api.updateContextBlock).toHaveBeenLastCalledWith('s1', 'b1', { summary: '改过的摘要', topic: '码头夜袭' });
  });

  it('查看原文展开子块与原文轮次', async () => {
    api.getContextBlockSource.mockResolvedValue({
      block: block({ tier: 2 }),
      children: [block({ id: 'b0', tier: 1, fromRound: 1, toRound: 3, summary: '子块摘要' })],
      rounds: [{ round: 4, messages: [{ id: 'm1', role: 'user', content: '去码头' }, { id: 'm2', role: 'assistant', content: '夜色很浓。' }] }],
    });
    api.getContextOverview.mockResolvedValue({ blocks: [block({ tier: 2 })], stats: stats() });
    render(<ContextSummaryModal sessionId="s1" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('查看原文'));

    expect(await screen.findByText('子块摘要')).toBeInTheDocument();
    expect(screen.getByText('第 1–3 轮 · 摘要')).toBeInTheDocument();
    expect(screen.getByText('玩家：去码头')).toBeInTheDocument();
    expect(screen.getByText('回复：夜色很浓。')).toBeInTheDocument();
    expect(api.getContextBlockSource).toHaveBeenCalledWith('s1', 'b1');
  });

  it('恢复原文先确认，再用恢复后的列表刷新', async () => {
    api.restoreContextBlock.mockResolvedValue({ blocks: [], stats: stats({ coveredRounds: 0, activeBlocks: 0, rawRounds: 20 }) });
    render(<ContextSummaryModal sessionId="s1" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '恢复原文' }));
    expect(screen.getByText('恢复这段原文？')).toBeInTheDocument();

    const buttons = screen.getAllByRole('button', { name: '恢复原文' });
    fireEvent.click(buttons.at(-1));
    expect(await screen.findByText('还没有整理过的剧情')).toBeInTheDocument();
    expect(api.restoreContextBlock).toHaveBeenCalledWith('s1', 'b1');
  });

  it('检索摘要与原文，并标出原文是否还在正文里', async () => {
    api.searchContext.mockResolvedValue({
      hits: [
        { kind: 'block', blockId: 'b1', fromRound: 1, toRound: 6, snippet: '走私船' },
        { kind: 'round', fromRound: 3, toRound: 3, inView: false, snippet: '铜钥匙' },
        { kind: 'round', fromRound: 15, toRound: 15, inView: true, snippet: '灯塔' },
      ],
    });
    render(<ContextSummaryModal sessionId="s1" onClose={vi.fn()} />);
    await screen.findByDisplayValue('林岚在码头截下了走私船。');
    fireEvent.change(screen.getByPlaceholderText(/查找人物/), { target: { value: '钥匙' } });
    fireEvent.click(screen.getByText('查找'));

    expect(await screen.findByText('第 1–6 轮（摘要）：走私船')).toBeInTheDocument();
    expect(screen.getByText('第 3 轮（原文 · 已整理进摘要）：铜钥匙')).toBeInTheDocument();
    expect(screen.getByText('第 15 轮（原文）：灯塔')).toBeInTheDocument();
    expect(api.searchContext).toHaveBeenCalledWith('s1', '钥匙');
  });

  it('统计文案：无剧情、未压缩、上次失败', () => {
    expect(statsHint({ latestRound: 0 })).toBe('还没有剧情');
    expect(statsHint(stats({ coveredRounds: 0, activeBlocks: 0, rawRounds: 20, usage: null, lastOutcome: null }))).toBe('共 20 轮，20 轮保留原文。');
    expect(statsHint(stats({ lastOutcome: 'failed', lastError: '超时' }))).toMatch(/上次整理失败：超时。$/);
  });
});
