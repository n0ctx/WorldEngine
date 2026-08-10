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
  importPersona: vi.fn(),
  readJsonFile: vi.fn(),
  listCharacterStateFields: vi.fn(),
  listPersonas: vi.fn(),
  activatePersona: vi.fn(),
  deletePersona: vi.fn(),
  createPersona: vi.fn(),
  listWorldEntries: vi.fn(),
  listWorldStateFields: vi.fn(),
  getWorldTimeline: vi.fn(),
  createWritingSession: vi.fn(),
  setCurrentCharacterId: vi.fn(),
  setCurrentSessionId: vi.fn(),
  setCurrentWritingSessionId: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useParams: () => mocks.useParams(),
  useNavigate: () => mocks.navigate,
  useLocation: () => mocks.useLocation(),
}));
vi.mock('../../src/core/api/characters', () => ({
  getCharactersByWorld: (...args) => mocks.getCharactersByWorld(...args),
  deleteCharacter: (...args) => mocks.deleteCharacter(...args),
  reorderCharacters: (...args) => mocks.reorderCharacters(...args),
}));
vi.mock('../../src/core/api/import-export', () => ({
  importCharacter: (...args) => mocks.importCharacter(...args),
  importPersona: (...args) => mocks.importPersona(...args),
  readJsonFile: (...args) => mocks.readJsonFile(...args),
}));
vi.mock('../../src/core/api/character-state-fields', () => ({
  listCharacterStateFields: (...args) => mocks.listCharacterStateFields(...args),
}));
vi.mock('../../src/core/api/personas', () => ({
  listPersonas: (...args) => mocks.listPersonas(...args),
  activatePersona: (...args) => mocks.activatePersona(...args),
  deletePersona: (...args) => mocks.deletePersona(...args),
  createPersona: (...args) => mocks.createPersona(...args),
  reorderPersonas: vi.fn(),
}));
vi.mock('../../src/core/api/prompt-entries', () => ({
  listWorldEntries: (...args) => mocks.listWorldEntries(...args),
}));
vi.mock('../../src/core/api/world-state-fields', () => ({
  listWorldStateFields: (...args) => mocks.listWorldStateFields(...args),
}));
vi.mock('../../src/core/api/sessions', () => ({
  getWorldTimeline: (...args) => mocks.getWorldTimeline(...args),
}));
vi.mock('../../src/core/api/writing-sessions', () => ({
  createWritingSession: (...args) => mocks.createWritingSession(...args),
}));
vi.mock('../../src/core/state/index', () => ({
  default: (selector) => selector({
    setCurrentCharacterId: mocks.setCurrentCharacterId,
    setCurrentSessionId: mocks.setCurrentSessionId,
    setCurrentWritingSessionId: mocks.setCurrentWritingSessionId,
  }),
}));
vi.mock('../../src/core/utils/logger.js', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: (...args) => mocks.logError(...args),
  },
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
  default: ({ children, ...props }) => <svg {...props}>{children}</svg>,
}));

import CharactersPage from '../../src/pages/CharactersPage.jsx';

describe('CharactersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useParams.mockReturnValue({ worldId: 'world-1' });
    mocks.useLocation.mockReturnValue({ pathname: '/worlds/world-1', state: null });
    mocks.getCharactersByWorld.mockResolvedValue([{ id: 'char-1', name: '阿塔', description: '守夜人' }]);
    mocks.listPersonas.mockResolvedValue([{ id: 'persona-1', name: '旅者', description: '主角', is_active: 1 }]);
    mocks.listWorldEntries.mockResolvedValue([{ id: 'entry-1', title: '世界规则条目', trigger_type: 'always', token: 0, sort_order: 0 }]);
    mocks.listWorldStateFields.mockResolvedValue([{ field_key: 'hp' }, { field_key: 'mood' }]);
    mocks.getWorldTimeline.mockResolvedValue([]);
    mocks.deleteCharacter.mockResolvedValue({});
    mocks.listCharacterStateFields.mockResolvedValue([{ field_key: 'hp' }]);
    mocks.readJsonFile.mockResolvedValue({ character: { name: '新角色' }, character_state_values: [] });
    mocks.importCharacter.mockResolvedValue({});
  });

  it('渲染角色区、我扮演切换器与世界规则入口', async () => {
    render(<CharactersPage />);

    expect(await screen.findAllByText('阿塔')).toHaveLength(2);
    expect(screen.getAllByText('旅者')).toHaveLength(2);
    expect(screen.getByText('世界规则')).toBeInTheDocument();
    expect(screen.getByText('1 条设定 · 2 个状态字段')).toBeInTheDocument();
  });

  it('故事线为空时展示空态', async () => {
    render(<CharactersPage />);
    expect(await screen.findByText(/还没有故事线/)).toBeInTheDocument();
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

    const fileInput = document.querySelector('input[type="file"][accept=".json,.wechar.json"]');
    const file = new File(['{}'], 'char.wechar.json', { type: 'application/json' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(mocks.readJsonFile).toHaveBeenCalled());
    await waitFor(() => expect(mocks.importCharacter).toHaveBeenCalledWith('world-1', expect.any(Object)));
  });

  it('故事线：显示继续上次卡片，点击对话条目跳转到对应角色的会话', async () => {
    mocks.getWorldTimeline.mockResolvedValue([
      { id: 'sess-chat-1', mode: 'chat', title: null, updated_at: 2000, character_id: 'char-1', last_message: '你好' },
      { id: 'sess-write-1', mode: 'writing', title: '写作标题', updated_at: 1000, character_id: null, last_message: '片段' },
    ]);
    render(<CharactersPage />);

    expect(await screen.findByText('继续上次')).toBeInTheDocument();
    expect(screen.getByText('与 阿塔 的对话')).toBeInTheDocument();
    expect(screen.getByText('写作标题')).toBeInTheDocument();

    fireEvent.click(screen.getByText('与 阿塔 的对话'));

    expect(mocks.setCurrentCharacterId).toHaveBeenCalledWith('char-1');
    expect(mocks.setCurrentSessionId).toHaveBeenCalledWith('sess-chat-1');
    expect(mocks.navigate).toHaveBeenCalledWith('/characters/char-1/chat');
  });

  it('故事线：点击写作条目跳转到写作页并写入 session hint', async () => {
    mocks.getWorldTimeline.mockResolvedValue([
      { id: 'sess-write-1', mode: 'writing', title: '写作标题', updated_at: 1000, character_id: null, last_message: '片段' },
    ]);
    render(<CharactersPage />);

    fireEvent.click(await screen.findByText('写作标题'));

    expect(mocks.setCurrentWritingSessionId).toHaveBeenCalledWith('sess-write-1');
    expect(mocks.navigate).toHaveBeenCalledWith('/worlds/world-1/writing');
  });

  it('故事线：点击「+ 新建」创建写作会话并跳转', async () => {
    mocks.createWritingSession.mockResolvedValue({ id: 'sess-new' });
    render(<CharactersPage />);

    await screen.findByText(/还没有故事线/);
    fireEvent.click(screen.getByTitle('新建写作故事线'));

    await waitFor(() => expect(mocks.createWritingSession).toHaveBeenCalledWith('world-1'));
    expect(mocks.setCurrentWritingSessionId).toHaveBeenCalledWith('sess-new');
    expect(mocks.navigate).toHaveBeenCalledWith('/worlds/world-1/writing');
  });

  it('我扮演：点击「切换」展开玩家卡列表，可切回收起', async () => {
    render(<CharactersPage />);
    await screen.findAllByText('旅者');

    fireEvent.click(screen.getByText('切换'));
    expect(screen.getByText('收起')).toBeInTheDocument();

    fireEvent.click(screen.getByText('收起'));
    expect(screen.getByText('切换')).toBeInTheDocument();
  });

  it('我扮演：激活另一张玩家卡后重新拉取故事线（写作会话按 persona 过滤，切换后必须刷新）', async () => {
    mocks.listPersonas.mockResolvedValue([
      { id: 'persona-1', name: '旅者', description: '主角', is_active: 1 },
      { id: 'persona-2', name: '影子', description: '备用', is_active: 0 },
    ]);
    mocks.activatePersona.mockResolvedValue([
      { id: 'persona-1', name: '旅者', description: '主角', is_active: 0 },
      { id: 'persona-2', name: '影子', description: '备用', is_active: 1 },
    ]);

    render(<CharactersPage />);
    await screen.findAllByText('旅者');
    expect(mocks.getWorldTimeline).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('切换'));
    fireEvent.click(screen.getByLabelText('激活玩家卡'));

    await waitFor(() => expect(mocks.activatePersona).toHaveBeenCalledWith('world-1', 'persona-2'));
    await waitFor(() => expect(mocks.getWorldTimeline).toHaveBeenCalledTimes(2));
  });

  it('世界规则入口卡点击后跳转到世界配置页', async () => {
    render(<CharactersPage />);
    await screen.findByText('1 条设定 · 2 个状态字段');

    fireEvent.click(screen.getByText('规则与状态'));
    expect(mocks.navigate).toHaveBeenCalledWith('/worlds/world-1/config');
  });
});
