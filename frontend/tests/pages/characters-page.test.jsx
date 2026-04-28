import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useParams: vi.fn(),
  useLocation: vi.fn(),
  navigate: vi.fn(),
  getCharactersByWorld: vi.fn(),
  deleteCharacter: vi.fn(),
  reorderCharacters: vi.fn(),
  importCharacter: vi.fn(),
  readJsonFile: vi.fn(),
  listCharacterStateFields: vi.fn(),
  listPersonas: vi.fn(),
  activatePersona: vi.fn(),
  deletePersona: vi.fn(),
  createPersona: vi.fn(),
  listWorldEntries: vi.fn(),
  updateWorldEntry: vi.fn(),
  setCurrentCharacterId: vi.fn(),
  setCurrentPersonaId: vi.fn(),
  pushErrorToast: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useParams: () => mocks.useParams(),
  useNavigate: () => mocks.navigate,
  useLocation: () => mocks.useLocation(),
}));
vi.mock('../../src/api/characters', () => ({
  getCharactersByWorld: (...args) => mocks.getCharactersByWorld(...args),
  deleteCharacter: (...args) => mocks.deleteCharacter(...args),
  reorderCharacters: (...args) => mocks.reorderCharacters(...args),
}));
vi.mock('../../src/api/import-export', () => ({
  importCharacter: (...args) => mocks.importCharacter(...args),
  readJsonFile: (...args) => mocks.readJsonFile(...args),
}));
vi.mock('../../src/api/character-state-fields', () => ({
  listCharacterStateFields: (...args) => mocks.listCharacterStateFields(...args),
}));
vi.mock('../../src/api/personas', () => ({
  listPersonas: (...args) => mocks.listPersonas(...args),
  activatePersona: (...args) => mocks.activatePersona(...args),
  deletePersona: (...args) => mocks.deletePersona(...args),
  createPersona: (...args) => mocks.createPersona(...args),
}));
vi.mock('../../src/api/prompt-entries', () => ({
  listWorldEntries: (...args) => mocks.listWorldEntries(...args),
  updateWorldEntry: (...args) => mocks.updateWorldEntry(...args),
}));
vi.mock('../../src/store/index', () => ({
  default: (selector) => selector({
    setCurrentCharacterId: mocks.setCurrentCharacterId,
    setCurrentPersonaId: mocks.setCurrentPersonaId,
  }),
}));
vi.mock('../../src/utils/toast', () => ({
  pushErrorToast: (...args) => mocks.pushErrorToast(...args),
}));
vi.mock('../../src/components', () => ({
  ConfirmModal: ({ title, confirmText, onConfirm, onClose, message }) => (
    <div>
      <div>{title}</div>
      <div>{message}</div>
      <button onClick={onConfirm}>{confirmText}</button>
      <button onClick={onClose}>取消</button>
    </div>
  ),
  BackButton: ({ onClick, label }) => <button onClick={onClick}>{label}</button>,
  AvatarCircle: ({ name }) => <div>{name}</div>,
  SortableList: ({ items, renderItem }) => <div>{items.map((item) => <div key={item.id}>{renderItem(item, {})}</div>)}</div>,
}));
vi.mock('../../src/components/ui/Icon.jsx', () => ({
  default: ({ children }) => <span>{children}</span>,
}));

import CharactersPage, { EntryOrderPanel } from '../../src/pages/CharactersPage.jsx';

describe('CharactersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useParams.mockReturnValue({ worldId: 'world-1' });
    mocks.useLocation.mockReturnValue({ pathname: '/worlds/world-1', state: null });
    mocks.getCharactersByWorld.mockResolvedValue([{ id: 'char-1', name: '阿塔', description: '守夜人' }]);
    mocks.listPersonas.mockResolvedValue([{ id: 'persona-1', name: '旅者', description: '主角', is_active: 1 }]);
    mocks.listWorldEntries.mockResolvedValue([{ id: 'entry-1', title: '世界规则', trigger_type: 'always', token: 0, sort_order: 0 }]);
    mocks.deleteCharacter.mockResolvedValue({});
    mocks.listCharacterStateFields.mockResolvedValue([{ field_key: 'hp' }]);
    mocks.readJsonFile.mockResolvedValue({ character: { name: '新角色' }, character_state_values: [] });
    mocks.importCharacter.mockResolvedValue({});
  });

  it('渲染列表、条目顺序和 cached 徽章', async () => {
    render(<CharactersPage />);

    expect(await screen.findAllByText('阿塔')).toHaveLength(2);
    expect(screen.getAllByText('旅者')).toHaveLength(2);
    expect(screen.getByText('世界规则')).toBeInTheDocument();
    expect(screen.getByText('CACHED')).toBeInTheDocument();
  });

  it('删除角色时弹确认框并调用删除', async () => {
    render(<CharactersPage />);

    await screen.findAllByText('阿塔');
    fireEvent.click(screen.getByLabelText('删除角色'));
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(mocks.deleteCharacter).toHaveBeenCalledWith('char-1'));
  });

  it('导入角色卡时读取文件并刷新列表', async () => {
    render(<CharactersPage />);
    await screen.findAllByText('阿塔');

    const fileInput = document.querySelectorAll('input[type="file"][accept=".json,.wechar.json"]')[1];
    const file = new File(['{}'], 'char.wechar.json', { type: 'application/json' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(mocks.readJsonFile).toHaveBeenCalled());
    await waitFor(() => expect(mocks.importCharacter).toHaveBeenCalledWith('world-1', expect.any(Object)));
  });
});

describe('EntryOrderPanel', () => {
  it('token=0 显示 CACHED，并在编辑后回调新 token', async () => {
    const onTokenChange = vi.fn();
    render(
      <EntryOrderPanel
        entries={[
          { id: 'e1', title: '世界规则', token: 0, sort_order: 0, trigger_type: 'always' },
        ]}
        onTokenChange={onTokenChange}
      />
    );

    expect(screen.getByText('CACHED')).toBeInTheDocument();
    fireEvent.click(screen.getByText('0'));
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.blur(input);

    await waitFor(() => expect(onTokenChange).toHaveBeenCalledWith('e1', 2));
  });
});
