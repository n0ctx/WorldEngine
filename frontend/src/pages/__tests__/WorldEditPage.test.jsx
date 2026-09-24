import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../components/ui/SectionTabs.jsx', () => ({
  default: ({ sections }) => <div>{sections.map((section) => <span key={section.key}>{section.label}</span>)}</div>,
}));
vi.mock('../layout/EditPageShell', () => ({ default: ({ children }) => <div>{children}</div> }));

const WorldEditPage = (await import('../WorldEditPage.jsx')).default;

afterEach(cleanup);

it('新建世界前不提供需要世界 ID 的状态模板入口', () => {
  render(
    <MemoryRouter initialEntries={['/worlds/new']}>
      <Routes>
        <Route path="/worlds/new" element={<WorldEditPage />} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText('基础设定')).toBeInTheDocument();
  expect(screen.queryByText('状态模板')).not.toBeInTheDocument();
});
