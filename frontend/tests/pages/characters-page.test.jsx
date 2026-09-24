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
  getWorld: vi.fn(),
  updateWorld: vi.fn(),
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
vi.mock('../../src/core/api/worlds', () => ({
  getWorld: (...args) => mocks.getWorld(...args),
  updateWorld: (...args) => mocks.updateWorld(...args),
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
    // 默认给一个「已完成三步」的成熟世界，避免每条既有用例都被引导页接管；
    // 引导本身的行为单独在下面的 describe 块里覆盖。
    mocks.getWorld.mockResolvedValue({
      id: 'world-1',
      description: '一个已经写好设定的世界',
      onboarding_dismissed: 0,
    });
    mocks.updateWorld.mockResolvedValue({});
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

    expect(await screen.findAllByText('阿塔')).toHaveLength(1);
    expect(screen.getAllByText('旅者')).toHaveLength(1);
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

  it('角色卡可聚焦，Enter 键进入对话', async () => {
    render(<CharactersPage />);
    await screen.findAllByText('阿塔');

    const card = document.querySelector('.we-character-card');
    expect(card).toHaveAttribute('role', 'button');
    expect(card).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(card, { key: 'Enter' });

    expect(mocks.setCurrentCharacterId).toHaveBeenCalledWith('char-1');
    expect(mocks.navigate).toHaveBeenCalledWith('/characters/char-1/chat');
  });

  it('角色卡上 Space 键进入对话，内部按钮的按键不冒泡触发卡片', async () => {
    render(<CharactersPage />);
    await screen.findAllByText('阿塔');

    const card = document.querySelector('.we-character-card');
    fireEvent.keyDown(card, { key: ' ' });
    expect(mocks.navigate).toHaveBeenCalledWith('/characters/char-1/chat');

    mocks.navigate.mockClear();
    fireEvent.keyDown(screen.getByLabelText('编辑角色'), { key: 'Enter', bubbles: true });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('激活的玩家卡可聚焦，Enter 键进入写作页', async () => {
    render(<CharactersPage />);
    await screen.findAllByText('旅者');
    // 「我扮演」默认是收起的切换器，玩家卡要展开后才挂载
    fireEvent.click(screen.getByRole('button', { name: '切换' }));

    const card = document.querySelector('.we-persona-card');
    expect(card).toHaveAttribute('role', 'button');
    expect(card).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(card, { key: 'Enter' });

    expect(mocks.setCurrentWritingSessionId).toHaveBeenCalledWith(null);
    expect(mocks.navigate).toHaveBeenCalledWith('/worlds/world-1/writing');
  });

  it('未激活的玩家卡不可聚焦，按键不触发跳转', async () => {
    mocks.listPersonas.mockResolvedValue([
      { id: 'persona-1', name: '旅者', description: '主角', is_active: 1 },
      { id: 'persona-2', name: '影子', description: '备用', is_active: 0 },
    ]);
    render(<CharactersPage />);
    await screen.findAllByText('旅者');
    fireEvent.click(screen.getByRole('button', { name: '切换' }));
    await screen.findAllByText('影子');

    const cards = document.querySelectorAll('.we-persona-card');
    const inactive = cards[1];
    expect(inactive).not.toHaveAttribute('role');
    expect(inactive).not.toHaveAttribute('tabindex');

    fireEvent.keyDown(inactive, { key: 'Enter' });
    expect(mocks.navigate).not.toHaveBeenCalled();
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

  it('世界规则入口卡点击后跳转到规则页', async () => {
    render(<CharactersPage />);
    await screen.findByText('1 条设定 · 2 个状态字段');

    fireEvent.click(screen.getByText('规则与状态'));
    expect(mocks.navigate).toHaveBeenCalledWith('/worlds/world-1/rules');
  });

  describe('新世界搭建引导', () => {
    beforeEach(() => {
      // 全空世界：三步全部未完成
      mocks.getWorld.mockResolvedValue({ id: 'world-1', description: '', onboarding_dismissed: 0 });
      mocks.getCharactersByWorld.mockResolvedValue([]);
      mocks.listWorldEntries.mockResolvedValue([]);
      mocks.listWorldStateFields.mockResolvedValue([]);
    });

    it('三步全未完成时展示引导，且三步都标记为未完成', async () => {
      render(<CharactersPage />);

      expect(await screen.findByText('先做这三件事，这个世界就活了')).toBeInTheDocument();
      expect(screen.getByText('写一写这个世界观')).toBeInTheDocument();
      expect(screen.getByText('加一个角色')).toBeInTheDocument();
      expect(screen.getByText('定一条这里的规则')).toBeInTheDocument();
      // 未完成的步骤显示序号而非勾选态 class
      expect(document.querySelectorAll('.we-onboarding-step--done')).toHaveLength(0);
      // 引导接管页面时，右栏的正常空态不应该再渲染
      expect(screen.queryByText('世界规则')).not.toBeInTheDocument();
    });

    it('只有世界观写完时，只有第一步打勾，引导仍然展示', async () => {
      mocks.getWorld.mockResolvedValue({ id: 'world-1', description: '这里没有魔法', onboarding_dismissed: 0 });
      render(<CharactersPage />);

      await screen.findByText('先做这三件事，这个世界就活了');
      const steps = document.querySelectorAll('.we-onboarding-step');
      expect(steps).toHaveLength(3);
      expect(steps[0]).toHaveClass('we-onboarding-step--done');
      expect(steps[1]).not.toHaveClass('we-onboarding-step--done');
      expect(steps[2]).not.toHaveClass('we-onboarding-step--done');
    });

    it('点击「写一写这个世界观」跳转到世界编辑页', async () => {
      render(<CharactersPage />);
      fireEvent.click(await screen.findByText('写一写这个世界观'));
      expect(mocks.navigate).toHaveBeenCalledWith(
        '/worlds/world-1/edit',
        { state: { backgroundLocation: { pathname: '/worlds/world-1', state: null } } },
      );
    });

    it('点击「加一个角色」跳转到角色创建页', async () => {
      render(<CharactersPage />);
      fireEvent.click(await screen.findByText('加一个角色'));
      expect(mocks.navigate).toHaveBeenCalledWith(
        '/worlds/world-1/characters/new',
        { state: { backgroundLocation: { pathname: '/worlds/world-1', state: null } } },
      );
    });

    it('点击「定一条这里的规则」跳转到规则空间', async () => {
      render(<CharactersPage />);
      fireEvent.click(await screen.findByText('定一条这里的规则'));
      expect(mocks.navigate).toHaveBeenCalledWith('/worlds/world-1/rules');
    });

    it('三步都完成后引导不再出现，恢复正常世界层布局', async () => {
      mocks.getWorld.mockResolvedValue({ id: 'world-1', description: '写好了', onboarding_dismissed: 0 });
      mocks.getCharactersByWorld.mockResolvedValue([{ id: 'char-1', name: '阿塔', description: '守夜人' }]);
      mocks.listWorldEntries.mockResolvedValue([{ id: 'entry-1', title: '规则', trigger_type: 'always', token: 0, sort_order: 0 }]);

      render(<CharactersPage />);

      await screen.findByText('世界规则');
      expect(screen.queryByText('先做这三件事，这个世界就活了')).not.toBeInTheDocument();
    });

    it('点击「跳过引导」持久化关闭状态，并立即隐藏引导', async () => {
      render(<CharactersPage />);
      fireEvent.click(await screen.findByText('跳过引导'));

      await waitFor(() => expect(mocks.updateWorld).toHaveBeenCalledWith('world-1', { onboarding_dismissed: 1 }));
      expect(screen.queryByText('先做这三件事，这个世界就活了')).not.toBeInTheDocument();
      // 关闭后恢复正常布局，能看到世界规则入口
      expect(await screen.findByText('世界规则')).toBeInTheDocument();
    });

    it('已被关闭过的世界即使三步未完成也不再展示引导', async () => {
      mocks.getWorld.mockResolvedValue({ id: 'world-1', description: '', onboarding_dismissed: 1 });
      render(<CharactersPage />);

      await screen.findByText('世界规则');
      expect(screen.queryByText('先做这三件事，这个世界就活了')).not.toBeInTheDocument();
    });
  });
});
