import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { motion } from 'framer-motion';
import SideDrawer from '../../src/shells/book-spread/layout/SideDrawer.jsx';

// 模拟故事线：当前条目上挂着带 layoutId 的选中亮片，切换条目时亮片换宿主
function Timeline({ activeId }) {
  return ['a', 'b'].map((id) => (
    <div key={id}>
      {id === activeId && <motion.span layoutId="highlight" />}
      {id}
    </div>
  ));
}

function Harness() {
  const [open, setOpen] = useState(true);
  const [activeId, setActiveId] = useState('a');
  return (
    <>
      <button type="button" onClick={() => setActiveId('b')}>切换条目</button>
      <SideDrawer side="left" open={open} onToggle={() => setOpen((v) => !v)} label="故事线列表">
        <Timeline activeId={activeId} />
      </SideDrawer>
    </>
  );
}

const drawer = () => document.querySelector('.we-side-drawer--left');

describe('SideDrawer', () => {
  it('内容里的选中亮片换过宿主后，收起仍会卸载内容并收回宽度', async () => {
    render(<Harness />);
    expect(drawer()).toHaveClass('we-side-drawer--open');

    fireEvent.click(screen.getByRole('button', { name: '切换条目' }));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    fireEvent.click(screen.getByRole('button', { name: '收起故事线列表' }));

    await waitFor(() => expect(drawer()).not.toHaveClass('we-side-drawer--open'), { timeout: 2000 });
    expect(drawer().querySelector('.we-side-drawer-content')).toBeNull();
    expect(screen.getByRole('button', { name: '展开故事线列表' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('收起途中再次展开，内容保留并回到展开态', async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: '收起故事线列表' }));
    fireEvent.click(screen.getByRole('button', { name: '展开故事线列表' }));

    await waitFor(() => expect(drawer().querySelector('.we-side-drawer-content')).toHaveStyle({ opacity: '1' }), { timeout: 2000 });
    expect(drawer()).toHaveClass('we-side-drawer--open');
    expect(screen.getByText('a')).toBeInTheDocument();
  });

  it('滑入的内容由不动的裁切层包住：裁切框不能挂在正在位移的元素上，否则内容会滑出抽屉边框', () => {
    render(<Harness />);
    const content = drawer().querySelector('.we-side-drawer-content');
    expect(content.parentElement).toHaveClass('we-side-drawer-clip');
    expect(content.parentElement.parentElement).toBe(drawer());
  });
});
