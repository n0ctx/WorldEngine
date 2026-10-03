import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/core/api/worlds.js', () => ({ getWorld: vi.fn().mockResolvedValue({ name: '无限轮回' }) }));
vi.mock('../../../src/core/api/config.js', () => ({ getConfig: vi.fn().mockResolvedValue({}) }));
vi.mock('../../../src/core/api/session-state-values.js', () => ({
  resetSessionWorldStateValues: vi.fn(),
  resetSessionPersonaStateValues: vi.fn(),
  patchSessionStateValue: vi.fn(),
}));
// stateData 引用保持稳定，见 NearbyPanel.test.jsx 的说明
vi.mock('../../../src/core/hooks/useSessionState.js', () => {
  const sessionState = {
    stateData: {
      world: [{ field_key: 'place', label: '地点', type: 'text', effective_value_json: '"拳场"' }],
      persona: [],
      character: [],
    },
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
  default: ({ children }) => <div>{children}</div>,
}));
// 只关心面板切到了哪个页签
vi.mock('../../../src/components/ui/SectionTabs.jsx', () => ({
  default: ({ defaultKey }) => <div data-testid="tabs" data-active={defaultKey} />,
}));

const { default: SessionStatePanel } = await import('../../../src/components/state/SessionStatePanel.jsx');
const { default: useSidePanelsStore } = await import('../../../src/core/state/sidePanels.js');

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  useSidePanelsStore.setState({ rightOpen: false, stateFocus: null });
});

function renderPanel() {
  return render(
    <SessionStatePanel
      sessionId="s-1"
      worldId="w-1"
      persona={{ name: '玩家' }}
      ticks={{ state: 0, diary: 0, queued: 0, failed: 0 }}
      diaryScope="chat"
      classNames={{ panel: 'we-state-panel', scroll: 'we-state-scroll' }}
      stateMemory={{ entities: [] }}
      reloadStateMemory={vi.fn()}
      stateMemorySchema={null}
      entityDiff={new Set()}
    />,
  );
}

describe('状态面板响应正文的定位请求', () => {
  it('切到请求的页签，滚到对应字段并亮一下，然后收掉请求', () => {
    const { container } = renderPanel();
    expect(screen.getByTestId('tabs').dataset.active).toBe('player');

    act(() => useSidePanelsStore.getState().revealStateField({ tab: 'character', fieldKeys: ['place'] }));

    expect(screen.getByTestId('tabs').dataset.active).toBe('character');
    const row = container.querySelector('[data-field-key="place"]');
    expect(row.classList.contains('we-status-field--located')).toBe(true);
    expect(row.scrollIntoView).toHaveBeenCalled();
    expect(useSidePanelsStore.getState().stateFocus).toBeNull();
  });

  it('数据都到了仍找不到行时只停在页签上，也收掉请求', () => {
    renderPanel();
    act(() => useSidePanelsStore.getState().revealStateField({ tab: 'e-npc', fieldKeys: [] }));
    expect(screen.getByTestId('tabs').dataset.active).toBe('e-npc');
    expect(useSidePanelsStore.getState().stateFocus).toBeNull();
  });
});
