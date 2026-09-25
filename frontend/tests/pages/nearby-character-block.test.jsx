import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  patchNearbyPersona: vi.fn(),
  patchNearbyState: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../../src/core/api/session-nearby.js', () => ({
  patchNearbyPersona: (...args) => mocks.patchNearbyPersona(...args),
  patchNearbyState: (...args) => mocks.patchNearbyState(...args),
}));
vi.mock('../../src/core/utils/logger.js', () => ({
  log: { error: (...args) => mocks.logError(...args) },
}));

import NearbyCharacterBlock from '../../src/pages/WritingSpacePage/components/NearbyCharacterBlock.jsx';

describe('NearbyCharacterBlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('保存状态失败时保留编辑器并允许重试', async () => {
    mocks.patchNearbyState
      .mockRejectedValueOnce(new Error('写入失败'))
      .mockResolvedValueOnce({});
    const onChange = vi.fn();

    render(
      <NearbyCharacterBlock
        worldId="world-1"
        sessionId="session-1"
        nearby={{
          id: 'nearby-1',
          name: '林',
          state: [{
            field_key: 'mood',
            label: '心情',
            type: 'text',
            update_mode: 'manual',
            runtime_value_json: JSON.stringify('平静'),
          }],
        }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByText('平静'));
    const editor = screen.getByDisplayValue('平静');
    fireEvent.change(editor, { target: { value: '焦虑' } });
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true });

    expect(await screen.findByText('写入失败')).toBeInTheDocument();
    expect(screen.getByDisplayValue('焦虑')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByDisplayValue('焦虑'), { key: 'Enter', ctrlKey: true });

    await waitFor(() => expect(mocks.patchNearbyState).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByDisplayValue('焦虑')).not.toBeInTheDocument());
    expect(mocks.patchNearbyState).toHaveBeenNthCalledWith(
      1,
      'world-1',
      'session-1',
      'nearby-1',
      'mood',
      JSON.stringify('焦虑'),
    );
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
