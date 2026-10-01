import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Card from '../../../src/components/ui/Card.jsx';
import { cardClassName } from '../../../src/components/ui/cardClassName.js';
import Divider from '../../../src/components/ui/Divider.jsx';
import EmptyState from '../../../src/components/ui/EmptyState.jsx';
import ListItem from '../../../src/components/ui/ListItem.jsx';
import SectionTitle from '../../../src/components/ui/SectionTitle.jsx';
import Skeleton from '../../../src/components/ui/Skeleton.jsx';

describe('卡片、列表项与占位', () => {
  it('Card 按表面、密度、可点与选中挂类名，as 换根元素', () => {
    render(<Card as="button" type="button" variant="outlined" density="compact" interactive selected>开场白</Card>);
    expect(screen.getByRole('button', { name: '开场白' })).toHaveClass(
      'we-card', 'we-card--outlined', 'we-card--compact', 'is-interactive', 'is-selected',
    );
    expect(cardClassName({ className: 'x' })).toBe('we-card we-card--raised x');
  });

  it('只有可点的浮起卡带触点反馈层', () => {
    const { container, rerender } = render(<Card interactive>卡</Card>);
    expect(container.querySelector('.we-card > .we-touch-fx')).toBeInTheDocument();
    rerender(<Card variant="sunken">卡</Card>);
    expect(container.querySelector('.we-touch-fx')).toBeNull();
  });

  it('ListItem 默认是 type=button 的按钮，选中挂 is-selected', () => {
    render(<ListItem selected aria-current="page">设定条目</ListItem>);
    const item = screen.getByRole('button', { name: '设定条目' });
    expect(item).toHaveAttribute('type', 'button');
    expect(item).toHaveClass('we-list-item', 'is-selected');
  });

  it('Skeleton 整组读作一次「加载中」，整块占位不读', () => {
    const { container } = render(<><Skeleton lines={[50, 80]} /><Skeleton block /></>);
    const status = screen.getByRole('status', { name: '加载中' });
    expect(status.querySelectorAll('.we-skel-line')).toHaveLength(2);
    expect(container.querySelector('.we-skel--block')).toHaveAttribute('aria-hidden', 'true');
  });

  it('SectionTitle 按级别给标题元素，操作按钮不放进标题里', () => {
    render(<SectionTitle level="group" actions={<button type="button">新建</button>}>思维链</SectionTitle>);
    const heading = screen.getByRole('heading', { level: 3, name: '思维链' });
    expect(within(heading).queryByRole('button')).toBeNull();
    expect(screen.getByRole('button', { name: '新建' })).toBeInTheDocument();
  });

  it('行内空状态不占用标题层级，整页空状态是标题', () => {
    const { rerender } = render(<EmptyState size="sm" title="暂无条目" hint="点击上方新建" />);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('点击上方新建')).toBeInTheDocument();
    rerender(<EmptyState title="还没有世界" />);
    expect(screen.getByRole('heading', { name: '还没有世界' })).toBeInTheDocument();
  });

  it('Divider 是分隔线', () => {
    render(<Divider size="lg" />);
    expect(screen.getByRole('separator')).toHaveClass('we-divider', 'we-divider--lg');
  });
});
