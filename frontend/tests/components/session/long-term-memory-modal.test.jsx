import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/core/api/long-term-memory.js', () => ({
  getLongTermMemory: vi.fn(async () => ({ content: '旧记忆' })),
  updateLongTermMemory: vi.fn(),
}));

import LongTermMemoryModal from '../../../src/components/session/LongTermMemoryModal.jsx';

describe('LongTermMemoryModal', () => {
  it('未修改时直接关闭；有修改时先确认', async () => {
    const onClose = vi.fn();
    render(<LongTermMemoryModal sessionId="s1" onClose={onClose} />);
    const textarea = await screen.findByDisplayValue('旧记忆');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.change(textarea, { target: { value: '新记忆' } });
    fireEvent.click(screen.getByText('取消'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText('放弃未保存的修改？')).toBeInTheDocument();

    fireEvent.click(screen.getByText('放弃'));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(2));
  });
});
