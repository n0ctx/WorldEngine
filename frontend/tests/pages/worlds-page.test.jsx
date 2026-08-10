import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useNavigate: vi.fn(),
  useLocation: vi.fn(),
  setCurrentWorldId: vi.fn(),
  getWorlds: vi.fn(),
  deleteWorld: vi.fn(),
  getCharactersByWorld: vi.fn(),
  readJsonFile: vi.fn(),
  importWorld: vi.fn(),
  downloadWorldCard: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.useNavigate,
  useLocation: () => mocks.useLocation(),
}));
vi.mock('../../src/core/state/index', () => ({
  default: (selector) => selector({ setCurrentWorldId: mocks.setCurrentWorldId }),
}));
vi.mock('../../src/core/api/worlds', () => ({
  getWorlds: (...args) => mocks.getWorlds(...args),
  deleteWorld: (...args) => mocks.deleteWorld(...args),
}));
vi.mock('../../src/core/api/characters', () => ({
  getCharactersByWorld: (...args) => mocks.getCharactersByWorld(...args),
}));
vi.mock('../../src/core/api/import-export', () => ({
  readJsonFile: (...args) => mocks.readJsonFile(...args),
  importWorld: (...args) => mocks.importWorld(...args),
  downloadWorldCard: (...args) => mocks.downloadWorldCard(...args),
}));
vi.mock('../../src/core/utils/avatar', () => ({
  getAvatarColor: () => '#caa272',
  getAvatarUrl: (path) => (path ? `/api/uploads/${path}` : null),
}));

import WorldsPage from '../../src/pages/WorldsPage.jsx';

describe('WorldsPage', () => {
  beforeEach(() => {
    mocks.useLocation.mockReturnValue({ pathname: '/' });
    mocks.useNavigate.mockReset();
    mocks.setCurrentWorldId.mockReset();
    mocks.getWorlds.mockReset();
    mocks.deleteWorld.mockReset();
    mocks.getCharactersByWorld.mockReset();
    mocks.readJsonFile.mockReset();
    mocks.importWorld.mockReset();
    mocks.downloadWorldCard.mockReset();
    global.alert = vi.fn();
  });

  it('会加载世界列表并支持进入与删除世界', async () => {
    mocks.getWorlds.mockResolvedValue([
      { id: 'world-1', name: '群星海', system_prompt: '背景', updated_at: Date.now() - 3_600_000 },
    ]);
    mocks.getCharactersByWorld.mockResolvedValue([{ id: 'char-1' }, { id: 'char-2' }]);
    mocks.deleteWorld.mockResolvedValue(null);

    render(<WorldsPage />);

    expect(screen.getByText('检索中…')).toBeInTheDocument();
    expect(await screen.findByText('群星海')).toBeInTheDocument();
    expect(screen.getByText('2 角色')).toBeInTheDocument();

    fireEvent.click(screen.getByText('群星海'));
    expect(mocks.setCurrentWorldId).toHaveBeenCalledWith('world-1');
    expect(mocks.useNavigate).toHaveBeenCalledWith('/worlds/world-1');

    fireEvent.click(screen.getByTitle('删除'));
    fireEvent.click((await screen.findAllByText('确认删除'))[1]);

    await waitFor(() => expect(mocks.deleteWorld).toHaveBeenCalledWith('world-1'));
    expect(mocks.getWorlds).toHaveBeenCalledTimes(2);
  });

  it('世界列表为空时显示新建入口', async () => {
    mocks.getWorlds.mockResolvedValue([]);

    render(<WorldsPage />);

    expect(await screen.findByText('暂无世界记录')).toBeInTheDocument();
    fireEvent.click(screen.getByText('新建世界'));
    expect(mocks.useNavigate).toHaveBeenCalledWith('/worlds/new', {
      state: { backgroundLocation: { pathname: '/' } },
    });
  });

  it('首位世界占大格，无封面世界渲染色块而非图片', async () => {
    mocks.getWorlds.mockResolvedValue([
      { id: 'world-1', name: '群星海', cover_path: 'covers/a.png', updated_at: Date.now() },
      { id: 'world-2', name: '空白页', cover_path: null, updated_at: Date.now() },
    ]);
    mocks.getCharactersByWorld.mockResolvedValue([]);

    const { container } = render(<WorldsPage />);

    expect(await screen.findByText('群星海')).toBeInTheDocument();

    const firstShell = screen.getByText('群星海').closest('.we-world-card-shell');
    const secondShell = screen.getByText('空白页').closest('.we-world-card-shell');

    // 首位（worlds[0]）应带大格 modifier，其余不带
    expect(firstShell.className).toContain('we-world-card-shell--feature');
    expect(secondShell.className).not.toContain('we-world-card-shell--feature');

    // 有封面：渲染 <img class="we-world-card-bg">；无封面：渲染色块 div，不渲染 img
    expect(firstShell.querySelector('.we-world-card-bg')).toBeTruthy();
    expect(secondShell.querySelector('.we-world-card-bg')).toBeFalsy();
    expect(secondShell.querySelector('.we-world-card-block')).toBeTruthy();
    expect(secondShell.querySelector('.we-world-card--tinted')).toBeTruthy();

    expect(container.querySelectorAll('.we-world-card-shell--feature')).toHaveLength(1);
  });

  it('加载失败时显示错误并允许重试', async () => {
    mocks.getWorlds
      .mockRejectedValueOnce(new Error('网络异常'))
      .mockResolvedValueOnce([{ id: 'world-2', name: '余烬城', system_prompt: '', updated_at: Date.now() }]);
    mocks.getCharactersByWorld.mockResolvedValue([]);

    render(<WorldsPage />);

    expect(await screen.findByText('世界列表读取失败')).toBeInTheDocument();
    expect(screen.getByText('网络异常')).toBeInTheDocument();

    fireEvent.click(screen.getByText('重试'));
    expect(await screen.findByText('余烬城')).toBeInTheDocument();
  });
});
