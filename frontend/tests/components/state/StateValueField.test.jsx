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

  it('布尔字段切换后立即保存布尔值', () => {
    const onSave = vi.fn();
    render(
      <StateValueField
        field={{ field_key: 'alive', type: 'boolean', value_json: 'true' }}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox'));

    expect(onSave).toHaveBeenCalledWith('alive', 'false');
  });

  it('数字字段失焦时把空值保存为 null', () => {
    const onSave = vi.fn();
    render(
      <StateValueField
        field={{ field_key: 'age', type: 'number', value_json: '22' }}
        onSave={onSave}
      />,
    );

    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    expect(onSave).toHaveBeenCalledWith('age', 'null');
  });

  it('枚举字段将占位选项保存为 null', () => {
    const onSave = vi.fn();
    render(
      <StateValueField
        field={{
          field_key: 'weather',
          type: 'enum',
          value_json: JSON.stringify('晴朗'),
          enum_options: JSON.stringify(['晴朗', '大雨']),
        }}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole('button'));
    fireEvent.mouseDown(screen.getByText('—'));

    expect(onSave).toHaveBeenCalledWith('weather', 'null');
  });

  it('日期时间字段仅在完整日期有效时保存', () => {
    const onSave = vi.fn();
    render(
      <StateValueField
        field={{ field_key: 'when', type: 'datetime', value_json: '2000-01-01T12:00' }}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('MM'), { target: { value: '02' } });

    expect(onSave).toHaveBeenCalledWith('when', JSON.stringify('2000-02-01T12:00'));
  });

  it('清空日期时间字段后在失焦时保存 null', () => {
    const onSave = vi.fn();
    render(
      <StateValueField
        field={{ field_key: 'when', type: 'datetime', value_json: '2000-01-01T12:00' }}
        onSave={onSave}
      />,
    );

    ['YYYY', 'MM', 'DD', 'HH', 'mm'].forEach((placeholder) => {
      fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value: '' } });
    });
    fireEvent.blur(screen.getByPlaceholderText('YYYY'));

    expect(onSave).toHaveBeenCalledWith('when', 'null');
  });

  it('列表字段支持回车添加和退格删除，并保留可访问分组', () => {
    const onSave = vi.fn();
    render(
      <StateValueField
        field={{ field_key: 'tags', type: 'list', value_json: JSON.stringify(['旧项']) }}
        onSave={onSave}
      />,
    );

    const group = screen.getByRole('group', { name: '列表项标签输入区' });
    fireEvent.keyDown(group, { key: 'Enter' });
    const input = screen.getByPlaceholderText('');
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: ' 新项 ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).toHaveBeenLastCalledWith('tags', JSON.stringify(['旧项', '新项']));

    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onSave).toHaveBeenLastCalledWith('tags', JSON.stringify(['旧项']));

    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onSave).toHaveBeenLastCalledWith('tags', JSON.stringify([]));
  });

  it('表格字段失焦时将数字保存，并从对象中移除空单元格', () => {
    const onSave = vi.fn();
    render(
      <StateValueField
        field={{
          field_key: 'stats',
          type: 'table',
          value_json: JSON.stringify({ hp: 10, mp: 4 }),
          table_columns: JSON.stringify([
            { key: 'hp', label: '生命' },
            { key: 'mp', label: '法力' },
          ]),
        }}
        onSave={onSave}
      />,
    );

    const hp = screen.getByRole('spinbutton', { name: '生命' });
    fireEvent.change(hp, { target: { value: '12' } });
    fireEvent.blur(hp);
    expect(onSave).toHaveBeenLastCalledWith('stats', JSON.stringify({ hp: 12, mp: 4 }));

    fireEvent.change(hp, { target: { value: '' } });
    fireEvent.blur(hp);
    expect(onSave).toHaveBeenLastCalledWith('stats', JSON.stringify({ mp: 4 }));

    const mp = screen.getByRole('spinbutton', { name: '法力' });
    fireEvent.change(mp, { target: { value: '' } });
    fireEvent.blur(mp);
    expect(onSave).toHaveBeenLastCalledWith('stats', JSON.stringify({}));
  });
});
