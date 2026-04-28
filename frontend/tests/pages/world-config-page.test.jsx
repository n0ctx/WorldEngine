import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useParams: vi.fn(),
  navigate: vi.fn(),
  listWorldEntries: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useParams: () => mocks.useParams(),
  useNavigate: () => mocks.navigate,
}));
vi.mock('../../src/api/prompt-entries', () => ({
  listWorldEntries: (...args) => mocks.listWorldEntries(...args),
}));
vi.mock('../../src/components', () => ({
  BackButton: ({ label }) => <button>{label}</button>,
}));
vi.mock('../../src/components/state/EntrySection', () => ({
  default: ({ title, entries, triggerType }) => (
    <div data-testid={`config-section-${triggerType}`}>{title}:{entries.length}</div>
  ),
}));

import WorldConfigPage from '../../src/pages/WorldConfigPage.jsx';

describe('WorldConfigPage', () => {
  beforeEach(() => {
    mocks.useParams.mockReturnValue({ worldId: 'world-1' });
    mocks.listWorldEntries.mockResolvedValue([
      { id: 'a', trigger_type: 'always' },
      { id: 'a2', trigger_type: 'always' },
      { id: 's', trigger_type: 'state' },
    ]);
  });

  it('在四列配置视图中分组渲染条目', async () => {
    render(<WorldConfigPage />);

    await waitFor(() => expect(mocks.listWorldEntries).toHaveBeenCalledWith('world-1'));
    expect(screen.getByTestId('config-section-always')).toHaveTextContent('常驻条目:2');
    expect(screen.getByTestId('config-section-keyword')).toHaveTextContent('关键词条目:0');
    expect(screen.getByTestId('config-section-llm')).toHaveTextContent('AI 召回条目:0');
    expect(screen.getByTestId('config-section-state')).toHaveTextContent('状态条件条目:1');
  });
});
