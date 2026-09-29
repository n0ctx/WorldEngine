import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ reduced: false }));

vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal()),
  useReducedMotion: () => mocks.reduced,
}));

import Button from '../../../src/components/ui/Button.jsx';
import Input from '../../../src/components/ui/Input.jsx';
import ToggleSwitch from '../../../src/components/ui/ToggleSwitch.jsx';

afterEach(() => {
  cleanup();
  mocks.reduced = false;
});

describe('触点反馈 useTouchFx', () => {
  it('同一批次里连按两次都放出涟漪，不会因事件对象被回收而报错', () => {
    const onPointerDown = vi.fn();
    const { getByRole } = render(<Button onPointerDown={onPointerDown}>继续写</Button>);
    const button = getByRole('button', { name: '继续写' });
    // 第二次的更新函数会延后到事件结束后才执行，那时 event.currentTarget 已被清空
    act(() => {
      fireEvent.pointerDown(button, { clientX: 4, clientY: 4 });
      fireEvent.pointerDown(button, { clientX: 8, clientY: 8 });
    });
    expect(button.querySelectorAll('.we-touch-fx__ripple')).toHaveLength(2);
    expect(onPointerDown).toHaveBeenCalledTimes(2);
  });

  it('减少动态效果时只记位置，不放涟漪', () => {
    mocks.reduced = true;
    const { getByRole } = render(<Button>继续写</Button>);
    const button = getByRole('button', { name: '继续写' });
    fireEvent.pointerDown(button, { clientX: 4, clientY: 4 });
    expect(button.querySelectorAll('.we-touch-fx__ripple')).toHaveLength(0);
    expect(button.style.getPropertyValue('--mx')).toBe('4px');
  });

  it('输入框按下时记下触点、失焦清掉，调用方自己的回调照常触发', () => {
    const onBlur = vi.fn();
    const { getByRole } = render(<Input aria-label="名字" onBlur={onBlur} />);
    const input = getByRole('textbox', { name: '名字' });
    fireEvent.pointerDown(input, { clientX: 6, clientY: 3 });
    expect(input.style.getPropertyValue('--mx')).toBe('6px');
    fireEvent.blur(input);
    expect(input.style.getPropertyValue('--mx')).toBe('');
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});

describe('ToggleSwitch', () => {
  it('用户拨过之后才打上 data-touched，页面刚加载时圆钮不播动画', () => {
    const { getByRole } = render(<ToggleSwitch checked onChange={() => {}} />);
    const toggle = getByRole('switch');
    expect(toggle).not.toHaveAttribute('data-touched');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('data-touched');
  });
});
