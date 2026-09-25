import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  location: { pathname: '/', search: '', hash: '', state: null },
  currentWorldId: null,
  storyTitle: '故事标题',
  setCurrentWorldId: vi.fn(),
  setCurrentCharacterId: vi.fn(),
  setCurrentSessionId: vi.fn(),
  getWorlds: vi.fn(),
  getCharacter: vi.fn(),
  toggleAssistant: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => mocks.location,
}));

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  const motionOnlyProps = new Set(['animate', 'exit', 'initial', 'transition', 'variants', 'whileHover', 'whileTap']);
  const motionElement = (tag) => ReactModule.forwardRef(({ children, ...props }, ref) => {
    const domProps = Object.fromEntries(Object.entries(props).filter(([key]) => !motionOnlyProps.has(key)));
    return ReactModule.createElement(tag, { ...domProps, ref }, children);
  });
  return {
    AnimatePresence: ({ children }) => children,
    motion: {
      button: motionElement('button'),
      div: motionElement('div'),
      span: motionElement('span'),
    },
    useReducedMotion: () => false,
  };
});

vi.mock('../../src/core/api/worlds', () => ({
  getWorlds: (...args) => mocks.getWorlds(...args),
}));
vi.mock('../../src/core/api/characters', () => ({
  getCharacter: (...args) => mocks.getCharacter(...args),
}));
vi.mock('../../src/core/state/index', () => ({
  default: (selector) => selector({
    currentWorldId: mocks.currentWorldId,
    setCurrentWorldId: mocks.setCurrentWorldId,
    setCurrentCharacterId: mocks.setCurrentCharacterId,
    setCurrentSessionId: mocks.setCurrentSessionId,
  }),
}));
vi.mock('../../src/core/state/currentStory', () => ({ default: (selector) => selector({ title: mocks.storyTitle }) }));
vi.mock('../../src/core/features/assistant/index', () => ({
  useAssistantPanel: (selector) => selector({ isOpen: false, toggle: mocks.toggleAssistant }),
}));
vi.mock('../../src/components/chat/DanmakuLayer', () => ({ default: () => null }));
vi.mock('../../src/core/state/danmakuBand', () => ({ useDanmakuBandStore: (selector) => selector({ comments: [] }) }));
vi.mock('../../src/core/state/displaySettings', () => ({ useDisplaySettingsStore: (selector) => selector({ danmakuSpeed: 1 }) }));

import TopBar from '../../src/shells/book-spread/chrome/TopBar.jsx';

describe('TopBar', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.getWorlds.mockReset().mockResolvedValue([{ id: 'world-1', name: '群星海' }, { id: 'world-2', name: '雾中岛' }]);
    mocks.getCharacter.mockReset();
    mocks.toggleAssistant.mockReset();
    mocks.setCurrentWorldId.mockReset();
    mocks.setCurrentCharacterId.mockReset();
    mocks.setCurrentSessionId.mockReset();
    mocks.currentWorldId = null;
    mocks.storyTitle = '故事标题';
    mocks.location = { pathname: '/', search: '', hash: '', state: null };
  });

  it('在书架显示品牌，并保留助手和设置入口', () => {
    render(<TopBar />);

    expect(screen.getByText('WorldEngine')).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: '返回世界列表' })).toBeNull();
    expect(screen.getByRole('button', { name: '打开写卡助手' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: '打开写卡助手' }));
    expect(mocks.toggleAssistant).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: '打开设置' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/settings', {
      state: {
        backgroundLocation: mocks.location,
        from: { pathname: '/', search: '', hash: '', state: null },
      },
    });
  });

  it('用键盘展开世界选择器并切换世界', async () => {
    const user = userEvent.setup();
    mocks.location = { pathname: '/worlds/world-1/rules', search: '', hash: '', state: null };
    mocks.currentWorldId = 'world-1';
    const setCurrentWorldId = vi.fn();
    mocks.setCurrentWorldId = setCurrentWorldId;

    render(<TopBar />);

    const selector = await screen.findByRole('button', { name: '切换世界，当前：群星海' });
    expect(screen.getByText('规则')).toBeInTheDocument();
    await user.click(selector);
    expect(selector).toHaveAttribute('aria-expanded', 'true');

    await user.tab();
    await user.tab();
    const nextWorld = screen.getByRole('button', { name: '雾中岛' });
    expect(nextWorld).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(setCurrentWorldId).toHaveBeenCalledWith('world-2');
    expect(mocks.setCurrentCharacterId).toHaveBeenCalledWith(null);
    expect(mocks.setCurrentSessionId).toHaveBeenCalledWith(null);
    expect(mocks.navigate).toHaveBeenCalledWith('/worlds/world-2');
  });

  it('在对话路由显示故事标题，并在标题为空时回退到页面名称', async () => {
    mocks.location = { pathname: '/characters/character-1/chat', search: '', hash: '', state: null };
    mocks.currentWorldId = 'world-1';
    mocks.getCharacter.mockResolvedValue({ world_id: 'world-1' });

    const { rerender } = render(<TopBar />);
    expect(await screen.findByText('故事标题')).toBeInTheDocument();

    mocks.storyTitle = null;
    rerender(<TopBar />);
    expect(await screen.findByText('对话')).toBeInTheDocument();
  });
});
