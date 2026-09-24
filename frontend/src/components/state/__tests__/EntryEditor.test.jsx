import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  updateWorldEntry: vi.fn(),
  listWorldEntries: vi.fn(),
}));

vi.mock('../../../core/api/prompt-entries', () => ({
  createWorldEntry: vi.fn(),
  updateWorldEntry: api.updateWorldEntry,
  getEntryConditions: vi.fn(),
  replaceEntryConditions: vi.fn(),
  listWorldEntries: api.listWorldEntries,
}));
vi.mock('../../../core/api/world-state-fields', () => ({ listWorldStateFields: vi.fn().mockResolvedValue([]) }));
vi.mock('../../../core/api/character-state-fields', () => ({ listCharacterStateFields: vi.fn().mockResolvedValue([]) }));
vi.mock('../../../core/api/persona-state-fields', () => ({ listPersonaStateFields: vi.fn().mockResolvedValue([]) }));
vi.mock('../../../core/api/characters', () => ({ getCharactersByWorld: vi.fn().mockResolvedValue([]) }));
vi.mock('../../../core/api/personas', () => ({ listPersonas: vi.fn().mockResolvedValue([]) }));
vi.mock('../../ui/MarkdownEditor', () => ({ default: () => <div /> }));

const EntryEditor = (await import('../EntryEditor.jsx')).default;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('更新条目成功后保存按钮恢复可用', async () => {
  api.updateWorldEntry.mockResolvedValue({ id: 'entry-1' });
  api.listWorldEntries.mockResolvedValue([]);
  const onSave = vi.fn();
  render(
    <EntryEditor
      inline
      worldId="world-1"
      entry={{ id: 'entry-1', title: '旧标题', trigger_type: 'always' }}
      onSave={onSave}
      onClose={() => {}}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(() => expect(api.updateWorldEntry).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByRole('button', { name: '保存' })).toBeEnabled());
  expect(onSave).toHaveBeenCalledTimes(1);
});
