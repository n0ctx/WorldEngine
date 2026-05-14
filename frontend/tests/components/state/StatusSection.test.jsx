import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import StatusSection from '../../../src/components/state/StatusSection.jsx';

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

beforeAll(() => {
  global.ResizeObserver = ResizeObserverMock;
});

describe('StatusSection', () => {
  it('llm_auto 字段也允许在右栏手动编辑', () => {
    const onSave = vi.fn();
    const { container } = render(
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
    expect(container.querySelector('.we-seamless-edit__anchor[aria-hidden="true"]')).not.toBeNull();
    fireEvent.change(input, { target: { value: '大雨' } });
    fireEvent.blur(input);

    expect(onSave).toHaveBeenCalledWith('weather', JSON.stringify('大雨'), undefined);
  });

  it('text 字段进入编辑时使用 textarea 以支持自动换行', () => {
    render(
      <StatusSection
        headerless
        rows={[{
          field_key: 'appearance',
          label: '外貌',
          type: 'text',
          update_mode: 'manual',
          effective_value_json: JSON.stringify('一段很长的外貌描述'),
        }]}
        onSave={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('一段很长的外貌描述'));

    const editor = screen.getByDisplayValue('一段很长的外貌描述');
    expect(editor.tagName).toBe('TEXTAREA');
  });

  it('text 字段阅读态也挂多行样式类，和编辑态保持同一套换行语义', () => {
    const { container } = render(
      <StatusSection
        headerless
        rows={[{
          field_key: 'appearance',
          label: '外貌',
          type: 'text',
          update_mode: 'manual',
          effective_value_json: JSON.stringify('第一行\n第二行'),
        }]}
        onSave={vi.fn()}
      />
    );

    expect(container.querySelector('.we-status-value--multiline')).not.toBeNull();
  });

  it('可编辑空值字段不再显示点击编辑文案', () => {
    const { container } = render(
      <StatusSection
        headerless
        rows={[
          {
            field_key: 'weather',
            label: '天气',
            type: 'text',
            update_mode: 'manual',
            effective_value_json: null,
          },
          {
            field_key: 'inventory',
            label: '背包',
            type: 'list',
            update_mode: 'manual',
            effective_value_json: JSON.stringify([]),
          },
        ]}
        onSave={vi.fn()}
      />
    );

    expect(screen.queryByText('点击编辑')).toBeNull();
    expect(container.querySelectorAll('.we-status-null')).toHaveLength(2);
    expect(screen.getAllByText('—')).toHaveLength(2);
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

  it('列表字段编辑态会把 tag 容器挂到共享 surface 的测量层', () => {
    const { container } = render(
      <StatusSection
        headerless
        rows={[{
          field_key: 'inventory',
          label: '背包',
          type: 'list',
          update_mode: 'manual',
          effective_value_json: JSON.stringify(['很长的药草名称', '第二个很长的物品名称']),
        }]}
        onSave={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('很长的药草名称'));

    expect(container.querySelector('.we-seamless-edit__overlay .we-tag-input')).not.toBeNull();
  });

  it('列表字段编辑态挂上专用 class，避免和通用 tag 样式混用', () => {
    const { container } = render(
      <StatusSection
        headerless
        rows={[{
          field_key: 'inventory',
          label: '背包',
          type: 'list',
          update_mode: 'manual',
          effective_value_json: JSON.stringify(['药草']),
        }]}
        onSave={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('药草'));

    expect(container.querySelector('.we-tag-input.we-status-inline-list')).not.toBeNull();
    expect(container.querySelector('.we-status-inline-list .we-tag')).not.toBeNull();
    expect(container.querySelector('.we-status-inline-list__input')).not.toBeNull();
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

  it('表格字段进入编辑时也保留共享 surface 的镜像层', () => {
    const onSave = vi.fn();
    const { container } = render(
      <StatusSection
        headerless
        rows={[{
          field_key: 'battle',
          label: '战斗',
          type: 'table',
          update_mode: 'manual',
          table_columns: JSON.stringify([{ key: 'hp', label: 'HP', min: 0, max: 100 }]),
          effective_value_json: JSON.stringify({ hp: 25 }),
        }]}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByText('25'));

    expect(screen.getByDisplayValue(25)).toBeInTheDocument();
    expect(container.querySelector('.we-status-table-surface .we-seamless-edit__anchor[aria-hidden="true"]')).not.toBeNull();
  });

  it('datetime 字段进入编辑时使用 compact 宽度 preset', () => {
    render(
      <StatusSection
        headerless
        rows={[{
          field_key: 'clock',
          label: '时间',
          type: 'datetime',
          update_mode: 'manual',
          effective_value_json: JSON.stringify('2026-05-14T10:00'),
        }]}
        onSave={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText(/2026年5月14日10时0分/));

    expect(screen.getByPlaceholderText('YYYY')).toHaveStyle({ width: '4.35em' });
  });
});
