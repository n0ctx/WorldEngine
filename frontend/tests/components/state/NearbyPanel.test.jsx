import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  fetchStateMemory: vi.fn(),
  fetchStateMemorySchema: vi.fn(),
  updateStateEntity: vi.fn(),
  deleteStateEntity: vi.fn(),
  createEntityFromCard: vi.fn(),
  analyzeEntityForCard: vi.fn(),
  createCharacterFromEntity: vi.fn(),
  createPersonaFromEntity: vi.fn(),
  getCharactersByWorld: vi.fn(),
  getWorld: vi.fn(),
  getConfig: vi.fn(),
}));

vi.mock('../../../src/core/api/state-memory.js', () => ({
  fetchStateMemory: (...a) => mocks.fetchStateMemory(...a),
  fetchStateMemorySchema: (...a) => mocks.fetchStateMemorySchema(...a),
  updateStateEntity: (...a) => mocks.updateStateEntity(...a),
  deleteStateEntity: (...a) => mocks.deleteStateEntity(...a),
  createEntityFromCard: (...a) => mocks.createEntityFromCard(...a),
  analyzeEntityForCard: (...a) => mocks.analyzeEntityForCard(...a),
  createCharacterFromEntity: (...a) => mocks.createCharacterFromEntity(...a),
  createPersonaFromEntity: (...a) => mocks.createPersonaFromEntity(...a),
}));
vi.mock('../../../src/core/api/characters.js', () => ({
  getCharactersByWorld: (...a) => mocks.getCharactersByWorld(...a),
}));
vi.mock('../../../src/core/api/worlds.js', () => ({ getWorld: (...a) => mocks.getWorld(...a) }));
vi.mock('../../../src/core/api/config.js', () => ({ getConfig: (...a) => mocks.getConfig(...a) }));
vi.mock('../../../src/core/api/daily-entries.js', () => ({ fetchDiaryContent: vi.fn() }));
vi.mock('../../../src/core/api/session-state-values.js', () => ({
  resetSessionWorldStateValues: vi.fn(),
  resetSessionPersonaStateValues: vi.fn(),
  patchSessionStateValue: vi.fn(),
}));
vi.mock('../../../src/core/utils/logger.js', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));
// stateData 的引用必须稳定：真实 hook 只在数据变化时换对象，每次渲染换新对象会让
// useStateDiff 的 layout effect 无限自触发
vi.mock('../../../src/core/hooks/useSessionState.js', () => {
  const sessionState = {
    stateData: { world: [], persona: [], character: [] },
    setStateData: vi.fn(),
    diaryEntries: [],
    stateError: null,
    diaryError: null,
    stateJustChanged: false,
    isUpdating: false,
    retryStateLoad: vi.fn(),
  };
  return { useSessionState: () => sessionState };
});
vi.mock('../../../src/components/state/ScenePlaceCard.jsx', () => ({
  default: ({ world }) => (world ? <section aria-label="当前地点">{world.location ?? '未设定'}</section> : null),
}));
// 面板自身的 NPC 页签装配是被测对象，SectionTabs 换成把每个 tab 的 label/actions/content
// 都摊平渲染的轻量替身，方便按 tab 分区查询
vi.mock('../../../src/components/ui/SectionTabs.jsx', () => ({
  default: ({ sections, globalActions }) => (
    <div>
      <div data-testid="global-actions">{globalActions}</div>
      {sections.map((s) => (
        <div key={s.key} data-testid="tab" data-key={s.key} data-label={s.label}>
          <div data-testid="tab-icon">{s.icon}</div>
          <div data-testid="tab-actions">{s.actions}</div>
          <div data-testid="tab-content">{s.content}</div>
        </div>
      ))}
    </div>
  ),
}));

vi.mock('../../../src/components/session/MiddleSummaryModal.jsx', () => ({
  default: ({ sessionId }) => <div data-testid="summary-modal">{sessionId}</div>,
}));
vi.mock('../../../src/components/session/StateMemoryModal.jsx', () => ({
  default: ({ sessionId }) => <div data-testid="state-memory-modal">{sessionId}</div>,
}));

import NearbyPanel from '../../../src/pages/WritingSpacePage/components/NearbyPanel.jsx';
import SessionTools from '../../../src/components/state/SessionTools.jsx';

function entity(overrides = {}) {
  return {
    entity_id: 'e1',
    type: 'character',
    status: 'active',
    name: '未命名',
    card_id: null,
    pinned: false,
    profile: {},
    dynamic: {},
    fields: [],
    activeProfileFields: [],
    aliases: [],
    ...overrides,
  };
}

function stateMemory({ entities = [], presentIds = [], world = {} } = {}) {
  return { entities, relations: [], world, presentIds };
}

async function renderPanel(props = {}) {
  const view = render(
    <NearbyPanel worldId="w1" sessionId="s1" persona={{ name: '玩家甲' }} {...props} />,
  );
  await waitFor(() => expect(mocks.fetchStateMemory).toHaveBeenCalled());
  return view;
}

/** 「玩家」和「日记」两个固定 tab 与被测的 NPC 页签装配无关，排除掉再比较 */
function tabLabels() {
  return screen.getAllByTestId('tab')
    .filter((el) => !['player', 'diary'].includes(el.getAttribute('data-key')))
    .map((el) => el.getAttribute('data-label'));
}

function tabByKey(key) {
  return screen.getAllByTestId('tab').find((el) => el.getAttribute('data-key') === key);
}

beforeEach(() => {
  mocks.fetchStateMemory.mockReset();
  mocks.fetchStateMemorySchema.mockReset().mockResolvedValue({ profileFields: { player: [], character: [] } });
  mocks.updateStateEntity.mockReset().mockResolvedValue({});
  mocks.deleteStateEntity.mockReset().mockResolvedValue({});
  mocks.createEntityFromCard.mockReset();
  mocks.getCharactersByWorld.mockReset().mockResolvedValue([]);
  mocks.getWorld.mockReset().mockResolvedValue({ name: '测试世界' });
  mocks.getConfig.mockReset().mockResolvedValue({ diary: { writing: { enabled: false } } });
});

describe('NearbyPanel 的在场 + 置顶实体页签', () => {
  it('在场的排在前面，其余（仅置顶）按原有顺序排在后面', async () => {
    mocks.fetchStateMemory.mockResolvedValue(stateMemory({
      entities: [
        entity({ entity_id: 'e-pinned', name: '仅置顶', pinned: true }),
        entity({ entity_id: 'e-present', name: '仅在场' }),
      ],
      presentIds: ['e-present'],
    }));

    await renderPanel();

    await waitFor(() => expect(tabLabels()).toEqual(['仅在场', '仅置顶']));
  });

  it('页签带头像：关联了角色卡的取卡上的头像，没有关联的是首字占位', async () => {
    mocks.getCharactersByWorld.mockResolvedValue([{ id: 'card-1', name: '艾拉', avatar_path: 'avatars/aila.png' }]);
    mocks.fetchStateMemory.mockResolvedValue(stateMemory({
      entities: [
        entity({ entity_id: 'e-card', name: '艾拉', card_id: 'card-1' }),
        entity({ entity_id: 'e-free', name: '老K' }),
      ],
      presentIds: ['e-card', 'e-free'],
    }));
    await renderPanel();

    await waitFor(() => expect(within(tabByKey('e-card')).getByTestId('tab-icon').querySelector('img')).not.toBeNull());
    expect(within(tabByKey('e-card')).getByTestId('tab-icon').querySelector('img').getAttribute('src')).toBe('/api/uploads/avatars/aila.png');
    expect(within(tabByKey('e-free')).getByTestId('tab-icon')).toHaveTextContent('老');
    expect(mocks.getCharactersByWorld).toHaveBeenCalledWith('w1');
  });

  it('侧栏顶部是「当前地点」卡，取状态记忆里的世界现状', async () => {
    mocks.fetchStateMemory.mockResolvedValue(stateMemory({ world: { location: '地下拳场', time: null } }));
    await renderPanel();
    expect(await screen.findByRole('region', { name: '当前地点' })).toHaveTextContent('地下拳场');
  });

  it('没有在场或置顶角色时回落到空态占位 tab', async () => {
    mocks.fetchStateMemory.mockResolvedValue(stateMemory());
    await renderPanel();

    await waitFor(() => expect(tabLabels()).toEqual(['附近']));
    expect(screen.getByText('AI 记录到的在场角色和你置顶的角色会显示在这里')).toBeInTheDocument();
  });

  it('置顶操作调用置顶接口并刷新', async () => {
    mocks.fetchStateMemory.mockResolvedValue(stateMemory({
      entities: [entity({ entity_id: 'e1', name: '甲' })],
      presentIds: ['e1'],
    }));
    await renderPanel();
    await waitFor(() => expect(tabLabels()).toEqual(['甲']));

    fireEvent.click(within(tabByKey('e1')).getByRole('button', { name: '置顶' }));

    await waitFor(() => expect(mocks.updateStateEntity).toHaveBeenCalledWith('s1', 'e1', { pinned: true }));
    await waitFor(() => expect(mocks.fetchStateMemory).toHaveBeenCalledTimes(2));
  });

  it('删除操作确认后调用删除接口并刷新', async () => {
    mocks.fetchStateMemory.mockResolvedValue(stateMemory({
      entities: [entity({ entity_id: 'e1', name: '甲' })],
      presentIds: ['e1'],
    }));
    await renderPanel();
    await waitFor(() => expect(tabLabels()).toEqual(['甲']));

    fireEvent.click(within(tabByKey('e1')).getByRole('button', { name: '删除' }));
    const confirm = await screen.findByRole('alertdialog', { name: '删除该角色？' });
    fireEvent.click(within(confirm).getByRole('button', { name: '删除' }));

    await waitFor(() => expect(mocks.deleteStateEntity).toHaveBeenCalledWith('s1', 'e1'));
    await waitFor(() => expect(mocks.fetchStateMemory).toHaveBeenCalledTimes(2));
  });

  it('从角色卡添加：成功后关闭弹窗并刷新', async () => {
    mocks.fetchStateMemory.mockResolvedValue(stateMemory());
    mocks.getCharactersByWorld.mockResolvedValue([{ id: 'char-1', name: '路人甲' }]);
    mocks.createEntityFromCard.mockResolvedValue({});
    await renderPanel();
    await waitFor(() => expect(tabLabels()).toEqual(['附近']));

    fireEvent.click(screen.getByRole('button', { name: '从角色卡添加' }));
    fireEvent.click(await screen.findByRole('button', { name: '添加' }));

    await waitFor(() => expect(mocks.createEntityFromCard).toHaveBeenCalledWith('s1', 'char-1'));
    await waitFor(() => expect(screen.queryByText('从角色卡添加')).not.toBeInTheDocument());
    await waitFor(() => expect(mocks.fetchStateMemory).toHaveBeenCalledTimes(2));
  });

  it('从角色卡添加：409 时提示已在状态记忆中', async () => {
    const { log } = await import('../../../src/core/utils/logger.js');
    mocks.fetchStateMemory.mockResolvedValue(stateMemory());
    mocks.getCharactersByWorld.mockResolvedValue([{ id: 'char-1', name: '路人甲' }]);
    mocks.createEntityFromCard.mockRejectedValue({ status: 409 });
    await renderPanel();
    await waitFor(() => expect(tabLabels()).toEqual(['附近']));

    fireEvent.click(screen.getByRole('button', { name: '从角色卡添加' }));
    fireEvent.click(await screen.findByRole('button', { name: '添加' }));

    await waitFor(() => expect(log.error).toHaveBeenCalledWith(
      'nearby.add.duplicate',
      expect.anything(),
      expect.objectContaining({ toast: '该角色已在状态记忆中' }),
    ));
  });

  it('一次挂载只发一次 GET state-memory', async () => {
    mocks.fetchStateMemory.mockResolvedValue(stateMemory());
    await renderPanel();
    await waitFor(() => expect(tabLabels()).toEqual(['附近']));

    expect(mocks.fetchStateMemory).toHaveBeenCalledTimes(1);
  });
});

describe('剧情摘要 / 状态记忆入口（侧栏顶行）', () => {
  it('点击入口打开对应会话的弹窗', async () => {
    render(<SessionTools sessionId="s1" worldId="w1" />);

    fireEvent.click(screen.getByRole('button', { name: '剧情摘要' }));
    expect(await screen.findByTestId('summary-modal')).toHaveTextContent('s1');

    fireEvent.click(screen.getByRole('button', { name: '状态记忆' }));
    expect(await screen.findByTestId('state-memory-modal')).toHaveTextContent('s1');
  });

  it('没有会话时不显示入口', () => {
    render(<SessionTools sessionId={null} worldId="w1" />);

    expect(screen.queryByRole('button', { name: '剧情摘要' })).toBeNull();
    expect(screen.queryByRole('button', { name: '状态记忆' })).toBeNull();
  });
});
