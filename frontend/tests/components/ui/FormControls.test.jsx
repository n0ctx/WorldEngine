import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import Badge from '../../../src/components/ui/Badge.jsx';
import Checkbox from '../../../src/components/ui/Checkbox.jsx';
import SegmentedControl from '../../../src/components/ui/SegmentedControl.jsx';
import TagInput from '../../../src/components/ui/TagInput.jsx';
import ToggleSwitch from '../../../src/components/ui/ToggleSwitch.jsx';

const OPTIONS = [{ value: 'a', label: '甲' }, { value: 'b', label: '乙' }, { value: 'c', label: '丙' }];

function Segmented() {
  const [value, setValue] = useState('a');
  return <SegmentedControl label="模式" options={OPTIONS} value={value} onChange={setValue} />;
}

function Tags({ max, initial = ['雨夜'] }) {
  const [values, setValues] = useState(initial);
  return (
    <TagInput
      label="关键词"
      max={max}
      values={values}
      onAdd={(v) => setValues([...values, v])}
      onRemove={(v) => setValues(values.filter((x) => x !== v))}
    />
  );
}

describe('表单控件', () => {
  it('Badge 按色调挂类名', () => {
    render(<Badge tone="success">新增</Badge>);
    expect(screen.getByText('新增')).toHaveClass('we-badge', 'we-badge--success');
  });

  it('SegmentedControl 是单选组：点选、方向键换选项，Tab 只停在选中项', () => {
    render(<Segmented />);
    const group = screen.getByRole('radiogroup', { name: '模式' });
    const [a, b, c] = within(group).getAllByRole('radio');
    expect(a).toHaveAttribute('aria-checked', 'true');
    expect(b).toHaveAttribute('tabindex', '-1');

    fireEvent.click(b);
    expect(b).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(b, { key: 'ArrowRight' });
    expect(c).toHaveAttribute('aria-checked', 'true');
    expect(document.activeElement).toBe(c);
    fireEvent.keyDown(c, { key: 'ArrowRight' });
    expect(a).toHaveAttribute('aria-checked', 'true');
  });

  it('Checkbox 把勾选状态以布尔值交出，没有可见文字时用 label 作名称', () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} onChange={onChange} label="启用" />);
    fireEvent.click(screen.getByRole('checkbox', { name: '启用' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('ToggleSwitch 是带名称的开关按钮', () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked label="启用规则" onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: '启用规则' });
    expect(toggle).toHaveAttribute('type', 'button');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('TagInput：回车添加并去空白去重，空输入退格删最后一个，失焦提交', () => {
    render(<Tags />);
    const input = screen.getByRole('textbox', { name: '关键词' });
    fireEvent.change(input, { target: { value: '  拳场 ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('拳场')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '雨夜' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getAllByText('雨夜')).toHaveLength(1);

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(screen.queryByText('拳场')).toBeNull();

    fireEvent.change(input, { target: { value: '灯塔' } });
    fireEvent.blur(input);
    expect(screen.getByText('灯塔')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '删除 雨夜' }));
    expect(screen.queryByText('雨夜')).toBeNull();
  });

  it('TagInput 输入法组字时回车不添加，到上限后不能再输入', () => {
    render(<Tags max={1} initial={[]} />);
    const input = screen.getByRole('textbox', { name: '关键词' });
    fireEvent.change(input, { target: { value: '拼音' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(screen.queryByText('拼音', { selector: '.we-badge' })).toBeNull();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('placeholder', '最多 1 项');
  });
});
