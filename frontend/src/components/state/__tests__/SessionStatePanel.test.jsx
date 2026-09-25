import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  state: null,
  setStateData: vi.fn(),
  retryStateLoad: vi.fn(),
  getWorld: vi.fn(),
  getConfig: vi.fn(),
  patchStateValue: vi.fn(),
  fetchDiaryContent: vi.fn(),
}));

vi.mock('../../../core/api/worlds.js', () => ({ getWorld: harness.getWorld }));
vi.mock('../../../core/api/config.js', () => ({ getConfig: harness.getConfig }));
vi.mock('../../../core/api/daily-entries.js', () => ({ fetchDiaryContent: harness.fetchDiaryContent }));
vi.mock('../../../core/api/session-state-values.js', () => ({
  resetSessionWorldStateValues: vi.fn(),
  resetSessionPersonaStateValues: vi.fn(),
  patchSessionStateValue: harness.patchStateValue,
}));
vi.mock('../../../core/hooks/useSessionState.js', () => ({
  useSessionState: () => harness.state,
}));
vi.mock('../../../core/hooks/useStateDiff.js', () => ({
  useStateDiff: () => ({ diff: { world: [], persona: [] }, ready: true }),
}));
vi.mock('../../ui/SectionTabs.jsx', () => {
  function MockSectionTabs({ sections, defaultKey }) {
    const [activeKey, setActiveKey] = useState(defaultKey ?? sections[0]?.key);
    const active = sections.find((section) => section.key === activeKey) ?? sections[0];
    return (
      <>
        <div role="tablist">
          {sections.map((section) => (
            <button
              key={section.key}
              type="button"
              role="tab"
              aria-selected={active?.key === section.key}
              onClick={() => setActiveKey(section.key)}
            >
              {section.label}
            </button>
          ))}
        </div>
        {active?.content}
        {active?.actions}
      </>
    );
  }
  return { default: MockSectionTabs };
});
vi.mock('../../ui/PanelCard.jsx', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../StateChangeCard.jsx', () => ({
  default: ({ className, onSave }) => (
    <button type="button" onClick={() => onSave('weather', JSON.stringify('clear'))}>{className}</button>
  ),
}));
vi.mock('../panel-parts.jsx', () => ({
  DiaryEntry: ({ entry, onSelect, selected, className }) => (
    <div className={`${className}${selected ? ` ${className}--selected` : ''}`} onClick={() => onSelect(entry)}>
      {entry.summary}
    </div>
  ),
  ResetAction: () => <button type="button">重置</button>,
  StateBusyOverlay: () => null,
  StateEmpty: ({ hint }) => <span>{hint}</span>,
}));

const SessionStatePanel = (await import('../SessionStatePanel.jsx')).default;

const classNames = {
  panel: 'panel',
  scroll: 'scroll',
  diaryEntry: 'entry',
  diaryMore: 'more',
  overlayKey: 'overlay',
  overlay: 'overlay',
  overlayChip: 'chip',
  overlayText: 'text',
};

function props() {
  return {
    sessionId: 'session-1',
    worldId: 'world-1',
    persona: { name: '玩家' },
    charName: '角色',
    ticks: { state: 0, diary: 0, queued: 0, failed: 0 },
    diaryScope: 'chat',
    classNames,
  };
}

function state(overrides = {}) {
  return {
    stateData: { world: [{ field_key: 'weather' }], persona: [] },
    setStateData: harness.setStateData,
    diaryEntries: [],
    stateError: null,
    diaryError: null,
    stateJustChanged: false,
    isUpdating: false,
    retryStateLoad: harness.retryStateLoad,
    ...overrides,
  };
}

async function openDiaryTab() {
  fireEvent.click(await screen.findByRole('tab', { name: '日记' }));
}

beforeEach(() => {
  harness.state = state();
  harness.getWorld.mockResolvedValue({ name: '森林' });
  harness.getConfig.mockResolvedValue({ diary: { chat: { enabled: true } } });
  harness.patchStateValue.mockResolvedValue();
  harness.fetchDiaryContent.mockResolvedValue('日记正文');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('保留世界名称和状态值的内联保存行为', async () => {
  render(<SessionStatePanel {...props()} />);

  expect(await screen.findByText('森林')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'we-status-world' }));

  await waitFor(() => {
    expect(harness.patchStateValue).toHaveBeenCalledWith('session-1', 'world', 'weather', '"clear"', undefined);
  });
  expect(harness.setStateData).toHaveBeenCalledTimes(1);
  const updateState = harness.setStateData.mock.calls[0][0];
  expect(updateState({ world: [{ field_key: 'weather' }], persona: [] }).world[0]).toMatchObject({
    effective_value_json: '"clear"',
    runtime_value_json: '"clear"',
  });
});

it('保留日记展开状态和更多条目的无障碍状态', async () => {
  harness.state = state({ diaryEntries: Array.from({ length: 6 }, (_, index) => ({
    date_str: `2026-09-${String(index + 1).padStart(2, '0')}`,
    summary: `日记 ${index + 1}`,
  })) });
  render(<SessionStatePanel {...props()} />);
  await openDiaryTab();

  const expand = await screen.findByRole('button', { name: '▼ 展开更多（1 条）' });
  expect(expand).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(expand);

  expect(screen.getByText('日记 1')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '▲ 收起' })).toHaveAttribute('aria-expanded', 'true');
});

it('选择日记后注入内容，同一条可取消，切换会话会清空选择', async () => {
  const entry = { date_str: '2026-09-25', summary: '选中的日记' };
  harness.state = state({ diaryEntries: [entry] });
  const onDiaryInject = vi.fn();
  const panelProps = { ...props(), onDiaryInject };
  const { rerender } = render(<SessionStatePanel {...panelProps} />);
  await openDiaryTab();
  const diaryEntry = screen.getByText('选中的日记');

  fireEvent.click(diaryEntry);
  await waitFor(() => expect(onDiaryInject).toHaveBeenCalledWith('日记正文'));
  expect(diaryEntry).toHaveClass('entry--selected');
  expect(harness.fetchDiaryContent).toHaveBeenCalledWith('session-1', entry.date_str);

  fireEvent.click(diaryEntry);
  await waitFor(() => expect(onDiaryInject).toHaveBeenCalledWith(null));
  expect(diaryEntry).not.toHaveClass('entry--selected');

  fireEvent.click(diaryEntry);
  await waitFor(() => expect(diaryEntry).toHaveClass('entry--selected'));
  rerender(<SessionStatePanel {...panelProps} sessionId="session-2" />);
  await waitFor(() => expect(screen.getByText('选中的日记')).not.toHaveClass('entry--selected'));
});

it('加载期间标记忙碌，状态错误仍可通过可访问按钮重试', () => {
  harness.state = state({ stateData: null, diaryEntries: null, stateError: 'load failed' });
  const { container } = render(<SessionStatePanel {...props()} />);
  fireEvent.click(screen.getByRole('tab', { name: '日记' }));

  expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  const retryButtons = screen.getAllByRole('button', { name: '重试' });
  fireEvent.click(retryButtons[0]);
  expect(harness.retryStateLoad).toHaveBeenCalledTimes(1);
});

it('日记加载错误通过日记视图的重试按钮重新加载会话状态', () => {
  harness.state = state({ diaryEntries: [], diaryError: 'load failed' });
  render(<SessionStatePanel {...props()} />);
  fireEvent.click(screen.getByRole('tab', { name: '日记' }));

  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  expect(harness.retryStateLoad).toHaveBeenCalledTimes(1);
});

it('切换其他页签后仍保留日记选择和展开状态', async () => {
  const onDiaryInject = vi.fn();
  harness.state = state({ diaryEntries: Array.from({ length: 6 }, (_, index) => ({
    date_str: `2026-09-${String(index + 1).padStart(2, '0')}`,
    summary: `日记 ${index + 1}`,
  })) });
  render(<SessionStatePanel {...props()} onDiaryInject={onDiaryInject} />);
  await openDiaryTab();

  const selected = screen.getByText('日记 6');
  fireEvent.click(selected);
  await waitFor(() => expect(selected).toHaveClass('entry--selected'));
  fireEvent.click(screen.getByRole('button', { name: '▼ 展开更多（1 条）' }));
  expect(screen.getByText('日记 1')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: '玩家' }));
  fireEvent.click(screen.getByRole('tab', { name: '日记' }));

  expect(screen.getByText('日记 6')).toHaveClass('entry--selected');
  expect(screen.getByText('日记 1')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '▲ 收起' })).toHaveAttribute('aria-expanded', 'true');
});
