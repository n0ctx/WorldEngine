import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import Icon from '../../../src/components/ui/Icon';

test('renders with size 16', () => {
  const { container } = render(
    <Icon size={16}><path d="M5 12h14" /></Icon>
  );
  const svg = container.querySelector('svg');
  expect(svg).toHaveAttribute('width', '16');
  expect(svg).toHaveAttribute('height', '16');
});

test('renders with size 20', () => {
  const { container } = render(
    <Icon size={20}><path d="M5 12h14" /></Icon>
  );
  const svg = container.querySelector('svg');
  expect(svg).toHaveAttribute('width', '20');
  expect(svg).toHaveAttribute('height', '20');
});

test('sets aria-hidden when no aria-label', () => {
  const { container } = render(
    <Icon size={16}><path d="M5 12h14" /></Icon>
  );
  const svg = container.querySelector('svg');
  expect(svg).toHaveAttribute('aria-hidden', 'true');
});

test('sets role=img when aria-label provided', () => {
  const { container } = render(
    <Icon size={16} aria-label="复制"><path d="M5 12h14" /></Icon>
  );
  const svg = container.querySelector('svg');
  expect(svg).toHaveAttribute('role', 'img');
  expect(svg).toHaveAttribute('aria-label', '复制');
});

test('Icon has no axe violations with aria-label', async () => {
  const { container } = render(
    <Icon size={16} aria-label="复制"><path d="M9 9h13v13H9z" /></Icon>
  );
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
