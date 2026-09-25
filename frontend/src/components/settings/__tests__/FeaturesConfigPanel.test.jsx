import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FeaturesConfigPanel from '../FeaturesConfigPanel.jsx';
import { DIARY_DATE_MODE, SETTINGS_MODE } from '../../../core/constants/settings.js';

function createProps(overrides = {}) {
  return {
    settingsMode: SETTINGS_MODE.CHAT,
    contextRounds: 8,
    setContextRounds: vi.fn(),
    onSaveContextRounds: vi.fn(),
    writingContextRounds: null,
    setWritingContextRounds: vi.fn(),
    onSaveWritingContextRounds: vi.fn(),
    chapterTurnSize: null,
    setChapterTurnSize: vi.fn(),
    onSaveChapterTurnSize: vi.fn(),
    writingChapterTurnSize: 20,
    setWritingChapterTurnSize: vi.fn(),
    onSaveWritingChapterTurnSize: vi.fn(),
    pageTurnSize: 40,
    setPageTurnSize: vi.fn(),
    onSavePageTurnSize: vi.fn(),
    writingPageTurnSize: null,
    setWritingPageTurnSize: vi.fn(),
    onSaveWritingPageTurnSize: vi.fn(),
    memoryExpansionEnabled: true,
    onToggleMemoryExpansion: vi.fn(),
    writingMemoryExpansionEnabled: false,
    onToggleWritingMemoryExpansion: vi.fn(),
    longTermMemoryEnabled: false,
    onToggleLongTermMemory: vi.fn(),
    writingLongTermMemoryEnabled: false,
    onToggleWritingLongTermMemory: vi.fn(),
    tableMemoryEnabled: false,
    onToggleTableMemory: vi.fn(),
    writingTableMemoryEnabled: true,
    onToggleWritingTableMemory: vi.fn(),
    tableMemoryRowLimits: { relations: 10, items: 20, places: 30, factions: 40 },
    setTableMemoryRowLimits: vi.fn(),
    onSaveTableMemoryRowLimit: vi.fn(),
    memoryRecallMaxSessions: 5,
    setMemoryRecallMaxSessions: vi.fn(),
    onSaveMemoryRecallMaxSessions: vi.fn(),
    chatDiaryEnabled: true,
    onToggleChatDiaryEnabled: vi.fn(),
    chatDateMode: DIARY_DATE_MODE.REAL,
    onChangeChatDateMode: vi.fn(),
    writingDiaryEnabled: true,
    onToggleWritingDiaryEnabled: vi.fn(),
    writingDateMode: DIARY_DATE_MODE.VIRTUAL,
    onChangeWritingDateMode: vi.fn(),
    showThinking: false,
    onToggleShowThinking: vi.fn(),
    autoCollapseThinking: true,
    onToggleAutoCollapseThinking: vi.fn(),
    showTokenUsage: true,
    onToggleShowTokenUsage: vi.fn(),
    suggestionEnabled: false,
    onToggleSuggestion: vi.fn(),
    writingSuggestionEnabled: true,
    onToggleWritingSuggestion: vi.fn(),
    danmakuEnabled: false,
    onToggleDanmaku: vi.fn(),
    danmakuCount: 4,
    setDanmakuCount: vi.fn(),
    onSaveDanmakuCount: vi.fn(),
    danmakuSpeed: 'normal',
    onChangeDanmakuSpeed: vi.fn(),
    ...overrides,
  };
}

describe('FeaturesConfigPanel', () => {
  it('shows chat values and routes chat setting changes to chat callbacks', () => {
    const props = createProps();
    const { rerender } = render(<FeaturesConfigPanel {...props} />);

    const contextInput = screen.getByRole('spinbutton', { name: '上下文保留轮次' });
    expect(contextInput).toHaveValue(8);
    expect(screen.getByText('对话日记')).toBeInTheDocument();
    expect(screen.queryByText('写作日记')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '真实日期' })).toHaveClass('we-settings-date-option--active');
    expect(screen.queryByText('关系表')).not.toBeInTheDocument();

    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[0]);
    expect(props.onToggleMemoryExpansion).toHaveBeenCalledWith(false);
    expect(switches[5]).toBeDisabled();
    fireEvent.click(switches[5]);
    expect(props.onToggleAutoCollapseThinking).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '虚拟日期' }));
    expect(props.onChangeChatDateMode).toHaveBeenCalledWith(DIARY_DATE_MODE.VIRTUAL);

    fireEvent.change(contextInput, { target: { value: '9' } });
    expect(props.setContextRounds).toHaveBeenCalledWith('9');
    rerender(<FeaturesConfigPanel {...props} contextRounds="9" />);
    fireEvent.blur(contextInput);
    expect(props.onSaveContextRounds).toHaveBeenCalledWith('9');
  });

  it('uses writing overrides and preserves their memory, diary, and turn settings', () => {
    const props = createProps({ settingsMode: SETTINGS_MODE.WRITING, writingContextRounds: '14' });
    const { rerender } = render(<FeaturesConfigPanel {...props} />);

    const contextInput = screen.getByRole('spinbutton', { name: '写作上下文保留轮次' });
    expect(contextInput).toHaveValue(14);
    expect(contextInput).toHaveAttribute('placeholder', '继承对话');
    expect(screen.getByText('写作日记')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '虚拟日期' })).toHaveClass('we-settings-date-option--active');
    expect(screen.getByRole('spinbutton', { name: '写作每章轮数' })).toHaveValue(20);
    expect(screen.getByRole('spinbutton', { name: '写作每页轮数' })).toHaveValue(null);
    expect(screen.getByRole('spinbutton', { name: '关系表行数上限' })).toHaveValue(10);

    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[0]);
    expect(props.onToggleWritingMemoryExpansion).toHaveBeenCalledWith(true);
    fireEvent.click(switches[1]);
    expect(props.onToggleWritingLongTermMemory).toHaveBeenCalledWith(true);
    fireEvent.click(switches[2]);
    expect(props.onToggleWritingTableMemory).toHaveBeenCalledWith(false);
    fireEvent.click(switches[8]);
    expect(props.onToggleWritingSuggestion).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: '真实日期' }));
    expect(props.onChangeWritingDateMode).toHaveBeenCalledWith(DIARY_DATE_MODE.REAL);

    fireEvent.change(contextInput, { target: { value: '' } });
    expect(props.setWritingContextRounds).toHaveBeenCalledWith(null);
    rerender(<FeaturesConfigPanel {...props} writingContextRounds={null} />);
    fireEvent.blur(contextInput);
    expect(props.onSaveWritingContextRounds).toHaveBeenCalledWith(null);
  });
});
