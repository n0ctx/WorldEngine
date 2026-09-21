import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  fetchNearby: vi.fn(),
  setNearbySaved: vi.fn(),
  removeNearby: vi.fn(),
  getWorld: vi.fn(),
  getConfig: vi.fn(),
}));

vi.mock('../../../src/core/api/session-nearby.js', () => ({
  fetchNearby: (...a) => mocks.fetchNearby(...a),
  setNearbySaved: (...a) => mocks.setNearbySaved(...a),
  removeNearby: (...a) => mocks.removeNearby(...a),
}));
vi.mock('../../../src/core/api/worlds.js', () => ({ getWorld: (...a) => mocks.getWorld(...a) }));
vi.mock('../../../src/core/api/config.js', () => ({ getConfig: (...a) => mocks.getConfig(...a) }));
vi.mock('../../../src/core/api/daily-entries.js', () => ({ fetchDiaryContent: vi.fn() }));
vi.mock('../../../src/core/api/session-state-values.js', () => ({
  resetSessionWorldStateValues: vi.fn(),
  resetSessionPersonaStateValues: vi.fn(),
  patchSessionStateValue: vi.fn(),
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
vi.mock('../../../src/core/utils/logger.js', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

// 面板自身的状态机是被测对象，子组件一律换成轻量替身
vi.mock('../../../src/components/state/StatusSection.jsx', () => ({ default: () => <div /> }));
vi.mock('../../../src/components/ui/PanelCard.jsx', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../../../src/pages/WritingSpacePage/components/NearbyCharacterBlock.jsx', () => ({ default: () => <div /> }));
vi.mock('../../../src/pages/WritingSpacePage/components/AddSavedNearbyModal.jsx', () => ({ default: () => <div /> }));
vi.mock('../../../src/pages/WritingSpacePage/components/MakeCardModal.jsx', () => ({ default: () => <div /> }));
vi.mock('../../../src/components/ui/SectionTabs.jsx', () => ({
  default: ({ sections }) => (
    <div>
      {sections.map((s) => (
        <span key={s.key} data-testid="tab" data-key={s.key}>{s.label}</span>
      ))}
    </div>
  ),
}));

import NearbyPanel from '../../../src/pages/WritingSpacePage/components/NearbyPanel.jsx';

const saved = (id, name) => ({ id, name, persona: '', is_saved: 1 });
const transient = (id, name) => ({ id, name, persona: '', is_saved: 0 });

/** 顶部 tab 里出现的角色名（即「完整 state 展开」的角色） */
function expandedTabLabels() {
  return screen.getAllByTestId('tab')
    .filter((el) => !['player', 'diary', 'nearby'].includes(el.getAttribute('data-key')))
    .map((el) => el.textContent);
}

/** 底部「已保存角色」列表里处于收起态的角色名（收起态才有「展示」按钮） */
function collapsedNames() {
  return screen.getAllByRole('listitem')
    .filter((li) => li.querySelector('[aria-label="展示"]'))
    .map((li) => li.querySelector('.we-saved-nearby-name').textContent);
}

async function renderPanel(props = {}) {
  const view = render(
    <NearbyPanel worldId="w1" sessionId="s1" persona={{ name: '玩家甲' }} {...props} />,
  );
  await waitFor(() => expect(mocks.fetchNearby).toHaveBeenCalled());
  return view;
}

beforeEach(() => {
  mocks.fetchNearby.mockReset();
  mocks.getWorld.mockReset().mockResolvedValue({ name: '测试世界' });
  mocks.getConfig.mockReset().mockResolvedValue({ diary: { writing: { enabled: false } } });
});

describe('NearbyPanel 的 saved 角色收起状态机', () => {
  it('默认全部展开：saved 角色同时出现在顶部 tab 与底部列表，且无「展示」按钮', async () => {
    mocks.fetchNearby.mockResolvedValue([saved('s-1', '甲'), saved('s-2', '乙'), transient('t-1', '丙')]);
    await renderPanel();

    await waitFor(() => expect(expandedTabLabels()).toEqual(['甲', '乙', '丙']));
    expect(screen.getByText('已保存角色')).toBeTruthy();
    expect(collapsedNames()).toEqual([]);
  });

  it('savedRecallTick 推进时按 hits 重算：命中的展开，未命中的收起', async () => {
    mocks.fetchNearby.mockResolvedValue([saved('s-1', '甲'), saved('s-2', '乙'), saved('s-3', '丙')]);
    const { rerender } = await renderPanel({ savedRecallTick: 0, savedRecallHits: null });
    await waitFor(() => expect(expandedTabLabels()).toEqual(['甲', '乙', '丙']));

    rerender(
      <NearbyPanel
        worldId="w1" sessionId="s1" persona={{ name: '玩家甲' }}
        savedRecallTick={1} savedRecallHits={['s-2']}
      />,
    );

    await waitFor(() => expect(expandedTabLabels()).toEqual(['乙']));
    expect(collapsedNames()).toEqual(['甲', '丙']);
  });

  it('新一轮 hits 会把上一轮收起的角色重新展开', async () => {
    mocks.fetchNearby.mockResolvedValue([saved('s-1', '甲'), saved('s-2', '乙')]);
    const { rerender } = await renderPanel({ savedRecallTick: 0, savedRecallHits: null });
    await waitFor(() => expect(expandedTabLabels()).toEqual(['甲', '乙']));

    const draw = (tick, hits) => rerender(
      <NearbyPanel
        worldId="w1" sessionId="s1" persona={{ name: '玩家甲' }}
        savedRecallTick={tick} savedRecallHits={hits}
      />,
    );

    draw(1, ['s-1']);
    await waitFor(() => expect(expandedTabLabels()).toEqual(['甲']));

    draw(2, ['s-2']);
    await waitFor(() => expect(expandedTabLabels()).toEqual(['乙']));
    expect(collapsedNames()).toEqual(['甲']);
  });

  it('同一个 tick 不会被重复应用', async () => {
    mocks.fetchNearby.mockResolvedValue([saved('s-1', '甲'), saved('s-2', '乙')]);
    const { rerender } = await renderPanel({ savedRecallTick: 0, savedRecallHits: null });
    const draw = (tick, hits) => rerender(
      <NearbyPanel
        worldId="w1" sessionId="s1" persona={{ name: '玩家甲' }}
        savedRecallTick={tick} savedRecallHits={hits}
      />,
    );

    draw(1, ['s-1']);
    await waitFor(() => expect(expandedTabLabels()).toEqual(['甲']));

    // 手动展开「乙」后，重复推送同一个 tick 不应把它再收起
    fireEvent.click(screen.getAllByLabelText('展示')[0]);
    await waitFor(() => expect(expandedTabLabels()).toEqual(['甲', '乙']));

    draw(1, ['s-1']);
    await waitFor(() => expect(expandedTabLabels()).toEqual(['甲', '乙']));
  });

  it('切换会话会清空收起集合，并忽略上个会话的陈旧 hits', async () => {
    mocks.fetchNearby.mockResolvedValue([saved('s-1', '甲'), saved('s-2', '乙')]);
    const { rerender } = await renderPanel({ savedRecallTick: 0, savedRecallHits: null });

    rerender(
      <NearbyPanel
        worldId="w1" sessionId="s1" persona={{ name: '玩家甲' }}
        savedRecallTick={1} savedRecallHits={['s-1']}
      />,
    );
    await waitFor(() => expect(expandedTabLabels()).toEqual(['甲']));

    // 切到新会话：hits 仍是上个会话的 s-1，但不应触发任何收起
    rerender(
      <NearbyPanel
        worldId="w1" sessionId="s2" persona={{ name: '玩家甲' }}
        savedRecallTick={1} savedRecallHits={['s-1']}
      />,
    );
    await waitFor(() => expect(expandedTabLabels()).toEqual(['甲', '乙']));
    expect(collapsedNames()).toEqual([]);
  });

  it('角色不再是 saved 时，脏 id 会从收起集合里被清掉', async () => {
    mocks.fetchNearby.mockResolvedValue([saved('s-1', '甲'), saved('s-2', '乙')]);
    const { rerender } = await renderPanel({ savedRecallTick: 0, savedRecallHits: null });

    rerender(
      <NearbyPanel
        worldId="w1" sessionId="s1" persona={{ name: '玩家甲' }}
        savedRecallTick={1} savedRecallHits={['s-1']}
      />,
    );
    await waitFor(() => expect(collapsedNames()).toEqual(['乙']));

    // 「乙」被取消保存后重新拉取：它应回到完整展开区，不再残留在收起集合里
    mocks.fetchNearby.mockResolvedValue([saved('s-1', '甲'), transient('s-2', '乙')]);
    rerender(
      <NearbyPanel
        worldId="w1" sessionId="s1" persona={{ name: '玩家甲' }}
        stateTick={1} savedRecallTick={1} savedRecallHits={['s-1']}
      />,
    );

    await waitFor(() => expect(expandedTabLabels()).toEqual(['甲', '乙']));
    expect(collapsedNames()).toEqual([]);
  });

  it('没有 saved 角色时不渲染底部列表', async () => {
    mocks.fetchNearby.mockResolvedValue([transient('t-1', '丙')]);
    await renderPanel();
    await waitFor(() => expect(expandedTabLabels()).toEqual(['丙']));
    expect(screen.queryByText('已保存角色')).toBeNull();
  });

  it('nearby 为空时回落到「附近」占位 tab', async () => {
    mocks.fetchNearby.mockResolvedValue([]);
    await renderPanel();
    await waitFor(() => {
      expect(screen.getAllByTestId('tab').map((el) => el.getAttribute('data-key'))).toEqual(['player', 'nearby']);
    });
  });
});
