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
    <div data-testid={`section-${triggerType}`}>{title}:{entries.length}</div>
  ),
}));

import WorldBuildPage from '../../src/pages/WorldBuildPage.jsx';

describe('WorldBuildPage', () => {
  beforeEach(() => {
    mocks.useParams.mockReturnValue({ worldId: 'world-1' });
    mocks.listWorldEntries.mockResolvedValue([
      { id: 'a', trigger_type: 'always' },
      { id: 'k', trigger_type: 'keyword' },
      { id: 'l', trigger_type: 'llm' },
      { id: 's', trigger_type: 'state' },
    ]);
  });

  it('按 trigger_type 分组渲染四个条目区块', async () => {
    render(<WorldBuildPage />);

    await waitFor(() => expect(mocks.listWorldEntries).toHaveBeenCalledWith('world-1'));
    expect(screen.getByTestId('section-always')).toHaveTextContent('常驻条目:1');
    expect(screen.getByTestId('section-keyword')).toHaveTextContent('关键词条目:1');
    expect(screen.getByTestId('section-llm')).toHaveTextContent('AI 召回条目:1');
    expect(screen.getByTestId('section-state')).toHaveTextContent('状态条件条目:1');
  });
});
