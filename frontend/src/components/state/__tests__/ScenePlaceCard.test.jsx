import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../../core/api/state-memory.js', () => ({
  updateStateEntity: vi.fn(),
  updateStateWorld: vi.fn(),
}));

const { default: ScenePlaceCard } = await import('../ScenePlaceCard.jsx');

function renderCard(world, sessionId = 'session-1') {
  return render(<ScenePlaceCard sessionId={sessionId} world={world} entities={[]} reload={vi.fn()} />);
}

afterEach(cleanup);

it('地点与时间都在卡里，时间为 ISO 值时按年月日时分显示', () => {
  renderCard({ time: '1-10-16T05:30', location: '地下拳场' });
  const card = screen.getByRole('region', { name: '当前地点' });
  expect(card).toHaveTextContent('地下拳场');
  expect(card).toHaveTextContent('1年10月16日5时30分');
  expect(card.querySelector('img')).toBeNull();
});

it('时间为自由文字时原样显示；地点、时间没设时显示未设定，可点开填写', () => {
  renderCard({ time: '第三天傍晚', location: null });
  expect(screen.getByText('第三天傍晚')).toBeTruthy();
  cleanup();
  renderCard({ time: null, location: null });
  expect(screen.getAllByText('未设定')).toHaveLength(2);
});

it('没有会话或状态记忆还没到时不显示', () => {
  const { container } = renderCard({ time: null, location: '地下拳场' }, null);
  expect(container).toBeEmptyDOMElement();
  cleanup();
  const { container: second } = renderCard(undefined);
  expect(second).toBeEmptyDOMElement();
});
