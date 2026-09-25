import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  createWorldEntry: vi.fn(),
  updateWorldEntry: vi.fn(),
  getEntryConditions: vi.fn(),
  replaceEntryConditions: vi.fn(),
  listWorldEntries: vi.fn(),
}));

vi.mock('../../../core/api/prompt-entries', () => ({
  createWorldEntry: api.createWorldEntry,
  updateWorldEntry: api.updateWorldEntry,
  getEntryConditions: api.getEntryConditions,
  replaceEntryConditions: api.replaceEntryConditions,
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

it('保存关键词触发设置和仍在输入框中的关键词', async () => {
  api.updateWorldEntry.mockResolvedValue({ id: 'entry-2' });
  api.listWorldEntries.mockResolvedValue([]);
  render(
    <EntryEditor
      inline
      worldId="world-1"
      entry={{
        id: 'entry-2', title: '地点', trigger_type: 'keyword', keywords: ['旧词'],
        keyword_scope: 'user,assistant', keyword_logic: 'OR',
      }}
      onSave={() => {}}
      onClose={() => {}}
    />,
  );

  fireEvent.click(screen.getByLabelText('assistant 消息'));
  fireEvent.click(screen.getByRole('button', { name: 'AND' }));
  const keywordInput = screen.getByRole('textbox', { name: '输入触发关键词' });
  fireEvent.change(keywordInput, { target: { value: '新词' } });
  fireEvent.keyDown(keywordInput, { key: 'Enter', code: 'Enter' });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));

  await waitFor(() => expect(api.updateWorldEntry).toHaveBeenCalledWith('entry-2', expect.objectContaining({
    keywords: ['旧词', '新词'],
    keyword_scope: 'user',
    keyword_logic: 'AND',
  })));
});

it('删除状态条件后保存空条件列表', async () => {
  api.updateWorldEntry.mockResolvedValue({ id: 'entry-3' });
  api.getEntryConditions.mockResolvedValue([
    { target_field: '世界.天气', operator: '等于', value: '晴' },
  ]);
  api.replaceEntryConditions.mockResolvedValue([]);
  api.listWorldEntries.mockResolvedValue([]);
  const onSave = vi.fn();
  render(
    <EntryEditor
      inline
      worldId="world-1"
      entry={{ id: 'entry-3', title: '晴天', trigger_type: 'state' }}
      onSave={onSave}
      onClose={() => {}}
    />,
  );

  fireEvent.click(await screen.findByRole('button', { name: '删除状态条件 1' }));
  fireEvent.click(screen.getByRole('button', { name: '保存' }));

  await waitFor(() => expect(api.replaceEntryConditions).toHaveBeenCalledWith('entry-3', []));
  expect(onSave).toHaveBeenCalledTimes(1);
});

it('保存失败时保留编辑界面并恢复保存按钮', async () => {
  api.updateWorldEntry.mockRejectedValue(new Error('服务不可用'));
  api.listWorldEntries.mockResolvedValue([]);
  const onSave = vi.fn();
  render(
    <EntryEditor
      inline
      worldId="world-1"
      entry={{ id: 'entry-4', title: '地点', trigger_type: 'always' }}
      onSave={onSave}
      onClose={() => {}}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: '保存' }));

  await waitFor(() => expect(screen.getByRole('button', { name: '保存' })).toBeEnabled());
  expect(onSave).not.toHaveBeenCalled();
});
