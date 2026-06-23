import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StateValueField from '../../../src/components/state/StateValueField.jsx';

describe('StateValueField', () => {
  it('优先使用 value_json 作为角色状态初始值', () => {
    render(
      <StateValueField
        field={{
          field_key: 'age_char',
          type: 'number',
          value_json: JSON.stringify(22),
          default_value_json: null,
        }}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue('22')).toBeInTheDocument();
  });

  it('文本输入会防抖自动保存', async () => {
    const onSave = vi.fn();
    render(
      <StateValueField
        field={{
          field_key: 'identity_char',
          type: 'text',
          value_json: JSON.stringify('拾荒者'),
        }}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByDisplayValue('拾荒者'), { target: { value: '医生' } });

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('identity_char', JSON.stringify('医生'));
    });
  });
});
