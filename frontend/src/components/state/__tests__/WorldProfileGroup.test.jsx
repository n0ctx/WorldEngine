import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../../core/api/state-memory.js', () => ({
  updateStateEntity: vi.fn(),
  updateStateWorld: vi.fn(),
}));

const { default: WorldProfileGroup } = await import('../WorldProfileGroup.jsx');

function renderGroup(time) {
  render(
    <WorldProfileGroup
      sessionId="session-1"
      world={{ time, location: null, location_entity_id: null }}
      entities={[]}
      reload={vi.fn()}
    />,
  );
}

afterEach(cleanup);

it('当前时间为 ISO 值时按年月日时分显示', () => {
  renderGroup('1-10-16T05:30');
  expect(screen.getByText('1年10月16日5时30分')).toBeTruthy();
});

it('当前时间为自由文字时原样显示，为空时显示未设定', () => {
  renderGroup('第三天傍晚');
  expect(screen.getByText('第三天傍晚')).toBeTruthy();
  cleanup();
  renderGroup(null);
  expect(screen.getAllByText('未设定').length).toBeGreaterThan(0);
});
