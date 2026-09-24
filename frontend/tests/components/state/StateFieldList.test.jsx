import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock('../../../src/core/utils/logger.js', () => ({
  log: { error: (...args) => mocks.logError(...args) },
}));

import StateFieldList from '../../../src/components/state/StateFieldList.jsx';

describe('StateFieldList', () => {
  it('删除失败时提示错误，确认框恢复可操作', async () => {
    const deleteFn = vi.fn(async () => { throw new Error('服务器错误'); });
    render(
      <StateFieldList
        scope="world"
        worldId="w1"
        listFn={vi.fn(async () => [{ id: 'f1', field_key: 'hp', label: '生命', type: 'number', update_mode: 'manual' }])}
        createFn={vi.fn()}
        updateFn={vi.fn()}
        deleteFn={deleteFn}
        reorderFn={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByTitle('删除'));
    fireEvent.click(screen.getByText('确认删除'));

    await waitFor(() => expect(mocks.logError).toHaveBeenCalledWith(
      'state_field.delete_failed',
      expect.any(Error),
      { toast: '服务器错误' },
    ));
    expect(screen.getByText('确认删除')).not.toBeDisabled();
    fireEvent.click(screen.getByText('取消'));
    expect(screen.queryByText('确认删除字段')).not.toBeInTheDocument();
  });
});
