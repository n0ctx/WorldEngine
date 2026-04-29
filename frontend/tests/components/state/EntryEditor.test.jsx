import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createWorldEntry: vi.fn(),
  updateWorldEntry: vi.fn(),
  getEntryConditions: vi.fn(),
  replaceEntryConditions: vi.fn(),
  listWorldStateFields: vi.fn(),
  listCharacterStateFields: vi.fn(),
  listPersonaStateFields: vi.fn(),
  pushErrorToast: vi.fn(),
}));

vi.mock('../../../src/api/prompt-entries', () => ({
  createWorldEntry: (...args) => mocks.createWorldEntry(...args),
  updateWorldEntry: (...args) => mocks.updateWorldEntry(...args),
  getEntryConditions: (...args) => mocks.getEntryConditions(...args),
  replaceEntryConditions: (...args) => mocks.replaceEntryConditions(...args),
}));
vi.mock('../../../src/api/world-state-fields', () => ({
  listWorldStateFields: (...args) => mocks.listWorldStateFields(...args),
}));
vi.mock('../../../src/api/character-state-fields', () => ({
  listCharacterStateFields: (...args) => mocks.listCharacterStateFields(...args),
}));
vi.mock('../../../src/api/persona-state-fields', () => ({
  listPersonaStateFields: (...args) => mocks.listPersonaStateFields(...args),
}));
vi.mock('../../../src/utils/toast', () => ({
  pushErrorToast: (...args) => mocks.pushErrorToast(...args),
}));
vi.mock('../../../src/components/ui/MarkdownEditor', () => ({
  default: ({ value, onChange, placeholder }) => (
    <textarea aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock('../../../src/components/ui/Select', () => ({
  default: ({ value, onChange, options, disabled }) => (
    <select aria-label="select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">请选择</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  ),
}));

import EntryEditor from '../../../src/components/state/EntryEditor.jsx';

describe('EntryEditor', () => {
  function fillBasicForm() {
    const textboxes = screen.getAllByRole('textbox');
    fireEvent.change(textboxes[0], { target: { value: '世界规则' } });
    fireEvent.change(screen.getByLabelText('条目内容…'), { target: { value: '正文内容' } });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createWorldEntry.mockResolvedValue({ id: 'entry-1' });
    mocks.updateWorldEntry.mockResolvedValue({ id: 'entry-1' });
    mocks.getEntryConditions.mockResolvedValue([]);
    mocks.replaceEntryConditions.mockResolvedValue({});
    mocks.listWorldStateFields.mockResolvedValue([{ label: '温度', type: 'number' }]);
    mocks.listCharacterStateFields.mockResolvedValue([{ label: '心情', type: 'text' }]);
    mocks.listPersonaStateFields.mockResolvedValue([{ label: '体力', type: 'number' }]);
  });

  it('always 条目允许 token=0，并显示 cached 提示', async () => {
    render(<EntryEditor worldId="world-1" defaultTriggerType="always" onClose={vi.fn()} onSave={vi.fn()} />);

    fillBasicForm();
    const tokenInput = screen.getByRole('spinbutton');
    fireEvent.change(tokenInput, { target: { value: '0' } });

    expect(tokenInput).toHaveAttribute('min', '0');
    expect(screen.getByText(/prompt cache 的一部分/)).toBeInTheDocument();
  });

  it('非 always 条目保存时 token 最小钳到 1', async () => {
    const onSave = vi.fn();
    render(<EntryEditor worldId="world-1" defaultTriggerType="keyword" onClose={vi.fn()} onSave={onSave} />);

    fillBasicForm();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } });
    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => expect(mocks.createWorldEntry).toHaveBeenCalledWith('world-1', expect.objectContaining({
      trigger_type: 'keyword',
      token: 1,
    })));
    expect(onSave).toHaveBeenCalled();
  });

  it('state 条目会加载字段并保存过滤后的条件', async () => {
    const onSave = vi.fn();
    render(<EntryEditor worldId="world-1" defaultTriggerType="state" onClose={vi.fn()} onSave={onSave} />);

    fillBasicForm();

    await waitFor(() => expect(mocks.listWorldStateFields).toHaveBeenCalledWith('world-1'));
    await waitFor(() => expect(screen.getAllByRole('option').some((option) => option.textContent === '世界.温度')).toBe(true));
    const selects = screen.getAllByLabelText('select');
    fireEvent.change(selects[0], { target: { value: '世界.温度' } });
    const valueInput = screen.getByPlaceholderText('值');
    fireEvent.change(valueInput, { target: { value: '10' } });

    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => expect(mocks.replaceEntryConditions).toHaveBeenCalledWith('entry-1', [
      expect.objectContaining({ target_field: '世界.温度', value: '10' }),
    ]));
    expect(onSave).toHaveBeenCalled();
  });

  it('保存失败时显示错误 toast', async () => {
    mocks.createWorldEntry.mockRejectedValue(new Error('boom'));
    render(<EntryEditor worldId="world-1" defaultTriggerType="always" onClose={vi.fn()} onSave={vi.fn()} />);

    fillBasicForm();
    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => expect(mocks.pushErrorToast).toHaveBeenCalledWith('保存失败：boom'));
  });
});
