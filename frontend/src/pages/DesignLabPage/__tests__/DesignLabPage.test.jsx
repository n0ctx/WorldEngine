import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const themesApi = vi.hoisted(() => ({
  DEFAULT_THEME_ID: 'nocturne',
  VISUAL_THEMES: [{ id: 'nocturne', name: 'Nocturne' }, { id: 'neon-noir', name: 'Neon Noir' }],
  applyThemeCss: vi.fn(),
  applyVisualTheme: vi.fn(),
}));
const configApi = vi.hoisted(() => ({ getConfig: vi.fn(), updateConfig: vi.fn() }));
vi.mock('../../../core/visual/visualThemes.js', () => themesApi);
vi.mock('../../../core/api/config.js', () => configApi);
vi.mock('../drafts.js', () => ({
  DRAFTS: [{ key: 'draft:midnight', label: '草稿 · midnight', css: ':root { --we-color-accent: #0f0; }' }],
}));

const DesignLabPage = (await import('../index.jsx')).default;
const { getMotionPack, setMotionPack } = await import('../../../core/motion/motionPack.js');

describe('DesignLabPage', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} unobserve() {} });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    setMotionPack('liquid');
    configApi.getConfig.mockResolvedValue({ ui: { theme: 'nocturne', motion: 'liquid' } });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('可切到「视觉」分页', async () => {
    render(<MemoryRouter><DesignLabPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: '视觉' }));
    expect(screen.getByRole('heading', { name: '基础色板' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^聊天/ }));
    expect(screen.getByRole('heading', { name: '聊天消息' })).toBeInTheDocument();
    await screen.findByRole('button', { name: 'Neon Noir' });
  });

  it('主题与动效只临时预览，不写配置；离开时恢复设置里的选择', async () => {
    const { unmount } = render(<MemoryRouter><DesignLabPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Neon Noir' }));
    fireEvent.click(screen.getByRole('button', { name: '信号' }));

    expect(themesApi.applyVisualTheme).toHaveBeenCalledWith('neon-noir');
    expect(getMotionPack().id).toBe('signal');
    expect(configApi.updateConfig).not.toHaveBeenCalled();

    unmount();
    await waitFor(() => expect(themesApi.applyVisualTheme).toHaveBeenLastCalledWith('nocturne'));
    expect(getMotionPack().id).toBe('liquid');
  });

  it('草稿主题直接套用草稿里的 CSS：不写配置，离开时恢复设置里的主题', async () => {
    const { unmount } = render(<MemoryRouter><DesignLabPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: '草稿 · midnight' }));

    expect(themesApi.applyThemeCss).toHaveBeenCalledWith(':root { --we-color-accent: #0f0; }', 'draft:midnight');
    expect(themesApi.applyVisualTheme).not.toHaveBeenCalledWith('draft:midnight');
    expect(configApi.updateConfig).not.toHaveBeenCalled();

    unmount();
    await waitFor(() => expect(themesApi.applyVisualTheme).toHaveBeenLastCalledWith('nocturne'));
  });
});
