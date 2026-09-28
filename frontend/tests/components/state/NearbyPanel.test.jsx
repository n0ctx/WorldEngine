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
vi.mock('../../../src/components/state/WorldProfileGroup.jsx', () => ({
  default: () => <div />,
}));
// 面板自身的 NPC 页签装配是被测对象，SectionTabs 换成把每个 tab 的 label/actions/content
// 都摊平渲染的轻量替身，方便按 tab 分区查询
vi.mock('../../../src/components/ui/SectionTabs.jsx', () => ({
  default: ({ sections, globalActions }) => (
    <div>
      <div data-testid="global-actions">{globalActions}</div>
      {sections.map((s) => (
        <div key={s.key} data-testid="tab" data-key={s.key} data-label={s.label}>
          <div data-testid="tab-actions">{s.actions}</div>
          <div data-testid="tab-content">{s.content}</div>
        </div>
      ))}
    </div>
  ),
}));

import NearbyPanel from '../../../src/pages/WritingSpacePage/components/NearbyPanel.jsx';

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

function stateMemory({ entities = [], presentIds = [] } = {}) {
  return { entities, relations: [], facts: [], world: {}, presentIds };
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
    await screen.findByText('删除该角色？');
    const confirmLayer = document.querySelector('.we-tm-confirm-layer');
    fireEvent.click(within(confirmLayer).getByRole('button', { name: '删除' }));

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
