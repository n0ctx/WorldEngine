import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { StateUpdateRejections } from '../panel-parts.jsx';

afterEach(cleanup);

it('没有记录或没有被拒的改动时不显示', () => {
  const { container, rerender } = render(<StateUpdateRejections rejections={null} />);
  expect(container).toBeEmptyDOMElement();
  rerender(<StateUpdateRejections rejections={{ round_index: 2, items: [] }} />);
  expect(container).toBeEmptyDOMElement();
});

it('折叠成一行说明轮次与条数，展开逐条列出改动与原因', () => {
  render(
    <StateUpdateRejections
      rejections={{
        round_index: 7,
        items: [
          { summary: '设置世界档案 · 时间', reason: '时间不得回退' },
          { summary: '在场名单 · 路人甲', reason: '找不到这个实体' },
        ],
      }}
    />,
  );

  const summary = screen.getByText('第 7 轮状态整理有 2 条改动没写入');
  expect(summary.closest('details')).not.toHaveAttribute('open');
  const items = screen.getAllByRole('listitem');
  expect(items).toHaveLength(2);
  expect(items[0]).toHaveTextContent('设置世界档案 · 时间');
  expect(items[0]).toHaveTextContent('时间不得回退');
});
