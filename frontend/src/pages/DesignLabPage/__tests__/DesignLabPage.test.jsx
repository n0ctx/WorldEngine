import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
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
const icons = await import('../../../components/ui/icons.jsx');

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

  it('可切到「图形」分页：标识、场景画和图标集，icons.jsx 的每个图标都有展示', async () => {
    const { container } = render(<MemoryRouter><DesignLabPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: '图形' }));
    for (const name of ['品牌标识「骰界」', '无封面世界的场景画「星图」', '图标「切角」']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
    expect(container.querySelectorAll('.we-design-lab__graphics-scene')).toHaveLength(4);
    const shown = [...container.querySelectorAll('.we-design-lab__graphics-icon')].map((cell) => cell.title);
    expect(shown.sort()).toEqual(Object.keys(icons).sort());
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

  it('StrictMode 下的挂载即卸载不把主题和动效换回默认', async () => {
    configApi.getConfig.mockResolvedValue({ ui: { theme: 'neon-noir', motion: 'signal' } });
    setMotionPack('signal');
    render(<StrictMode><MemoryRouter><DesignLabPage /></MemoryRouter></StrictMode>);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Neon Noir' })).toHaveAttribute('aria-pressed', 'true'));
    await waitFor(() => expect(themesApi.applyVisualTheme).toHaveBeenCalled());
    expect(themesApi.applyVisualTheme).not.toHaveBeenCalledWith('nocturne');
    expect(themesApi.applyVisualTheme).toHaveBeenLastCalledWith('neon-noir');
    expect(getMotionPack().id).toBe('signal');
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
