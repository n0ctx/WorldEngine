import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ModelCombobox from '../../../src/components/ui/ModelCombobox.jsx';

afterEach(cleanup);

const options = [
  'gpt-4o',
  {
    id: 'claude-sonnet',
    inputPrice: 0.02,
    outputPrice: 1.5,
    cacheWritePrice: 2,
    cacheReadPrice: 0.5,
  },
];

describe('ModelCombobox', () => {
  it('opens the full list and renders model pricing', () => {
    render(<ModelCombobox value="gpt-4o" options={options} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '展开列表' }));

    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('claude-sonnet')).toBeInTheDocument();
    expect(screen.getByText(/↑0\.02 ↓1\.5 写2 读0\.5/)).toBeInTheDocument();
  });

  it('filters typed input and selects the first match with Enter', () => {
    const onChange = vi.fn();
    render(<ModelCombobox value="" options={options} onChange={onChange} />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: 'claude' } });
    expect(screen.getByText('claude-sonnet')).toBeInTheDocument();
    expect(screen.queryByText('gpt-4o')).not.toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('claude-sonnet');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('does not submit while the input method is composing', () => {
    const onChange = vi.fn();
    render(<ModelCombobox value="" options={options} onChange={onChange} />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: '拼音' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '收起列表' })).toBeInTheDocument();
  });
});
