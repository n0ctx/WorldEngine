import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  DEFAULT_THEME_ID: 'classic-parchment',
  listThemes: vi.fn(),
  setActiveTheme: vi.fn(),
  refreshThemeCss: vi.fn(),
}));

vi.mock('../../../core/api/themes.js', () => api);
vi.mock('../../../core/api/custom-css-snippets.js', () => ({ refreshCustomCss: vi.fn() }));

const ThemeManager = (await import('../ThemeManager.jsx')).default;

describe('ThemeManager', () => {
  beforeEach(() => {
    api.listThemes.mockResolvedValue({
      activeTheme: 'classic-parchment',
      themes: [
        { id: 'classic-parchment', name: '羊皮纸', version: '1.0.0', preview: {} },
        { id: 'ink', name: '墨色', version: '1.0.0', preview: {} },
      ],
    });
    api.setActiveTheme.mockResolvedValue({ activeTheme: 'ink' });
    api.refreshThemeCss.mockResolvedValue();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('展示主题列表并可切换主题', async () => {
    render(<ThemeManager />);

    expect(await screen.findByText('羊皮纸')).toBeInTheDocument();
    expect(screen.getByText('墨色')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '切换' }));

    await waitFor(() => expect(api.setActiveTheme).toHaveBeenCalledWith('ink'));
    expect(api.refreshThemeCss).toHaveBeenCalledWith('ink');
  });

  it('只提供切换：不再有导入、导出、删除入口，当前项标为使用中', async () => {
    render(<ThemeManager />);
    await screen.findByText('墨色');

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByText('使用中')).toBeInTheDocument();
    expect(screen.queryByText(/导入|导出|删除/)).toBeNull();
  });

  it('CSS 加载失败时回滚 active theme，不把 UI 标成新主题', async () => {
    api.refreshThemeCss.mockRejectedValueOnce(new Error('CSS 读取失败'));

    render(<ThemeManager />);
    await screen.findByText('墨色');

    fireEvent.click(screen.getByRole('button', { name: '切换' }));

    await waitFor(() => {
      expect(api.setActiveTheme).toHaveBeenNthCalledWith(1, 'ink');
      expect(api.setActiveTheme).toHaveBeenNthCalledWith(2, 'classic-parchment');
    });
    const parchmentCard = screen.getByText('羊皮纸').closest('.we-theme-card');
    expect(parchmentCard).toHaveClass('active');
    expect(screen.getByText('墨色').closest('.we-theme-card')).not.toHaveClass('active');
  });
});
