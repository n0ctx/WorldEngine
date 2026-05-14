import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import StatusSection from '../../../src/components/state/StatusSection.jsx';

describe('StatusSection', () => {
  it('llm_auto 字段也允许在右栏手动编辑', () => {
    const onSave = vi.fn();
    render(
      <StatusSection
        headerless
        rows={[{
          field_key: 'weather',
          label: '天气',
          type: 'text',
          update_mode: 'llm_auto',
          effective_value_json: JSON.stringify('晴朗'),
        }]}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByText('晴朗'));
    const input = screen.getByDisplayValue('晴朗');
    fireEvent.change(input, { target: { value: '大雨' } });
    fireEvent.blur(input);

    expect(onSave).toHaveBeenCalledWith('weather', JSON.stringify('大雨'), undefined);
  });

  it('system_rule 字段保持不可编辑', () => {
    const onSave = vi.fn();
    render(
      <StatusSection
        headerless
        rows={[{
          field_key: 'diary_time',
          label: '时间',
          type: 'datetime',
          update_mode: 'system_rule',
          effective_value_json: JSON.stringify('2026-05-14T10:00'),
        }]}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByText(/2026年5月14日10时0分/));

    expect(screen.queryByPlaceholderText('YYYY')).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('列表字段改为回车逐项添加并立即保存', () => {
    const onSave = vi.fn();
    render(
      <StatusSection
        headerless
        rows={[{
          field_key: 'inventory',
          label: '背包',
          type: 'list',
          update_mode: 'manual',
          effective_value_json: JSON.stringify(['药草']),
        }]}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByText('药草'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '绷带' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSave).toHaveBeenCalledWith('inventory', JSON.stringify(['药草', '绷带']), undefined);
  });

  it('列表字段点击编辑区外会取消编辑且不保存未提交输入', () => {
    const onSave = vi.fn();
    render(
      <StatusSection
        headerless
        rows={[{
          field_key: 'inventory',
          label: '背包',
          type: 'list',
          update_mode: 'manual',
          effective_value_json: JSON.stringify(['药草']),
        }]}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByText('药草'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '绷带' } });
    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('枚举字段点击编辑区外会取消编辑', () => {
    const onSave = vi.fn();
    render(
      <StatusSection
        headerless
        rows={[{
          field_key: 'weather',
          label: '天气',
          type: 'enum',
          update_mode: 'llm_auto',
          enum_options: JSON.stringify(['晴朗', '大雨']),
          effective_value_json: JSON.stringify('晴朗'),
        }]}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByText('晴朗'));
    expect(screen.getByRole('button', { name: '晴朗' })).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole('button', { name: '晴朗' })).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });
});
