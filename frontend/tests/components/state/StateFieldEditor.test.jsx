import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/components/ui/Select', () => ({
  default: ({ value, onChange, options, disabled }) => (
    <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  ),
}));

vi.mock('../../../src/components/ui/MarkdownEditor', () => ({
  default: ({ value, onChange, placeholder }) => (
    <textarea aria-label={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));

import StateFieldEditor from '../../../src/components/state/StateFieldEditor.jsx';

describe('StateFieldEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates required identity fields before saving', () => {
    const onSave = vi.fn();
    render(<StateFieldEditor field={null} onSave={onSave} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('保存'));

    expect(screen.getByText('field_key 为必填项')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('edits an enum field and clears a removed default option from the saved payload', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <StateFieldEditor
        field={{
          id: 'field-1', field_key: 'status', label: '状态', type: 'enum',
          enum_options: ['todo', 'done'], default_value: 'todo', update_mode: 'manual',
        }}
        onSave={onSave}
        onClose={onClose}
      />,
    );

    const enumGroup = screen.getByRole('group', { name: '枚举选项标签输入区' });
    const enumInput = within(enumGroup).getByRole('textbox');
    fireEvent.click(enumGroup.querySelector('.we-tag button'));
    fireEvent.change(enumInput, { target: { value: 'blocked' } });
    fireEvent.keyDown(enumInput, { key: 'Enter' });
    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      enum_options: ['done', 'blocked'],
      default_value: null,
    })));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps stored table keys locked and serializes table bounds and defaults on edit', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <StateFieldEditor
        field={{
          id: 'field-2', field_key: 'stats', label: '属性', type: 'table',
          table_columns: [{ key: 'hp', label: 'HP', min: 0, max: 100 }],
          default_value: '{"hp":12}', update_mode: 'manual',
        }}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('列 key')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('列表头'), { target: { value: '生命值' } });
    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      table_columns: [{ key: 'hp', label: '生命值', min: 0, max: 100 }],
      default_value: '{"hp":12}',
    })));
  });

  it('rejects duplicate table column keys', () => {
    const onSave = vi.fn();
    render(<StateFieldEditor field={null} onSave={onSave} onClose={vi.fn()} />);

    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'table' } });
    fireEvent.click(screen.getByText('+ 添加列'));
    fireEvent.click(screen.getByText('+ 添加列'));
    screen.getAllByLabelText('列 key').forEach((input) => {
      fireEvent.change(input, { target: { value: 'hp' } });
    });
    screen.getAllByLabelText('列表头').forEach((input, index) => {
      fireEvent.change(input, { target: { value: `列 ${index + 1}` } });
    });
    fireEvent.change(screen.getByPlaceholderText('唯一标识符'), { target: { value: 'stats' } });
    fireEvent.change(screen.getByPlaceholderText('显示名称'), { target: { value: '属性' } });
    fireEvent.click(screen.getByText('保存'));

    expect(screen.getByText('列 key "hp" 重复')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('rejects malformed datetime values and locks the system diary time controls', () => {
    const onSave = vi.fn();
    const { unmount } = render(
      <StateFieldEditor
        field={{ field_key: 'when', label: '时间', type: 'datetime', default_value: '2024-1-01T09:00' }}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('保存'));
    expect(screen.getByText(/默认值格式必须为 YYYY-MM-DDTHH:mm/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    unmount();
    render(
      <StateFieldEditor
        field={{ field_key: 'diary_time', label: '日记时间', type: 'datetime', default_value: '2024-01-01T09:00' }}
        diaryDateMode="real"
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText('YYYY')).toBeDisabled();
  });

  it('restores the save button and shows the parent error when saving fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('保存失败'));
    render(
      <StateFieldEditor
        field={null}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('唯一标识符'), { target: { value: 'mood' } });
    fireEvent.change(screen.getByPlaceholderText('显示名称'), { target: { value: '心情' } });
    fireEvent.click(screen.getByText('保存'));

    expect(screen.getByText('保存中…')).toBeDisabled();
    await waitFor(() => expect(screen.getByText('保存')).toBeEnabled());
    expect(screen.getByText('保存失败')).toBeInTheDocument();
  });
});
