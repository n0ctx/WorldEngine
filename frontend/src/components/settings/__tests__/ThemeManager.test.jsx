import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const themes = vi.hoisted(() => ({
  VISUAL_THEMES: [
    { id: 'classic-parchment', name: '羊皮纸', version: '1.0.0', preview: {} },
    { id: 'ink', name: '墨色', version: '1.0.0', preview: {} },
  ],
  applyVisualTheme: vi.fn(),
  resolveThemeId: (id) => (id === 'ink' ? 'ink' : 'classic-parchment'),
}));
const config = vi.hoisted(() => ({ getConfig: vi.fn(), updateConfig: vi.fn() }));

vi.mock('../../../core/visual/visualThemes.js', () => themes);
vi.mock('../../../core/api/config.js', () => config);
vi.mock('../../../core/api/custom-css-snippets.js', () => ({ refreshCustomCss: vi.fn() }));

const ThemeManager = (await import('../ThemeManager.jsx')).default;

describe('ThemeManager', () => {
  beforeEach(() => {
    config.getConfig.mockResolvedValue({ ui: { theme: 'classic-parchment' } });
    config.updateConfig.mockResolvedValue({});
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

    await waitFor(() => expect(config.updateConfig).toHaveBeenCalledWith({ ui: { theme: 'ink' } }));
    expect(themes.applyVisualTheme).toHaveBeenCalledWith('ink');
    await waitFor(() => expect(screen.getByText('墨色').closest('.we-theme-card')).toHaveClass('active'));
  });

  it('只提供切换：不再有导入、导出、删除入口，当前项标为使用中', async () => {
    render(<ThemeManager />);
    await screen.findByText('墨色');

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByText('使用中')).toBeInTheDocument();
    expect(screen.queryByText(/导入|导出|删除/)).toBeNull();
  });

  it('配置保存失败时不套用新主题，也不把 UI 标成新主题', async () => {
    config.updateConfig.mockRejectedValueOnce(new Error('保存失败'));

    render(<ThemeManager />);
    await screen.findByText('墨色');

    fireEvent.click(screen.getByRole('button', { name: '切换' }));

    await waitFor(() => expect(config.updateConfig).toHaveBeenCalledTimes(1));
    expect(themes.applyVisualTheme).not.toHaveBeenCalled();
    expect(screen.getByText('羊皮纸').closest('.we-theme-card')).toHaveClass('active');
    expect(screen.getByText('墨色').closest('.we-theme-card')).not.toHaveClass('active');
  });
});
