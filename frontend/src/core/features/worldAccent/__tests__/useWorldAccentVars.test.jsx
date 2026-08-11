import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, renderHook, cleanup, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { useWorldAccentVars } from '../useWorldAccentVars.js';
import * as worldsApi from '../../../api/worlds.js';

// 深色主题（nocturne）画布色 vs 浅色主题（classic-parchment）画布色，
// 用来复现「主题 CSS 异步注入，晚于世界数据到达」的竞态。
const DARK_CANVAS = '#15181b';
const LIGHT_CANVAS = '#ede3d0';

function setCanvasVar(value) {
  document.documentElement.style.setProperty('--we-color-bg-canvas', value);
}

function renderAt(path) {
  return renderHook(() => useWorldAccentVars(), {
    wrapper: ({ children }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>,
  });
}

describe('useWorldAccentVars', () => {
  beforeEach(() => {
    setCanvasVar(DARK_CANVAS);
    vi.spyOn(worldsApi, 'getWorld').mockResolvedValue({ id: 'w1', accent_color: '#6172ae' });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.documentElement.style.removeProperty('--we-color-bg-canvas');
  });

  it('世界内页面（深色主题、有 accent_color）返回派生 token', async () => {
    const { result } = renderAt('/worlds/w1');
    await act(async () => {});
    expect(result.current).not.toBeNull();
    expect(result.current['--we-color-accent']).toBe('#6172ae');
  });

  it('书架层（"/")永远返回 null，不看残留的 accentColor', async () => {
    const { result } = renderAt('/');
    await act(async () => {});
    expect(result.current).toBeNull();
  });

  it('世界没有 accent_color 时返回 null（无覆盖，退回主题默认）', async () => {
    worldsApi.getWorld.mockResolvedValue({ id: 'w1', accent_color: null });
    const { result } = renderAt('/worlds/w1');
    await act(async () => {});
    expect(result.current).toBeNull();
  });

  it('浅色主题画布下不注入（即便世界有 accent_color）', async () => {
    setCanvasVar(LIGHT_CANVAS);
    const { result } = renderAt('/worlds/w1');
    await act(async () => {});
    expect(result.current).toBeNull();
  });

  it('主题 CSS 比世界数据晚到时，we:theme-updated 触发后能补上注入（回归：曾经永久卡在 null）', async () => {
    // 复现时序：hook 挂载时主题还是浅色默认值（还没被 nocturne 覆盖），世界数据先到。
    setCanvasVar(LIGHT_CANVAS);
    const { result } = renderAt('/worlds/w1');
    await act(async () => {});
    expect(result.current).toBeNull(); // 此时还判定为浅色主题，不注入

    // 主题包异步加载完成，画布色变暗，themes.js 派发 we:theme-updated
    await act(async () => {
      setCanvasVar(DARK_CANVAS);
      window.dispatchEvent(new CustomEvent('we:theme-updated'));
    });

    expect(result.current).not.toBeNull();
    expect(result.current['--we-color-accent']).toBe('#6172ae');
  });

  it('切换世界时立即清空旧世界的色，不等新世界数据到达就先残留旧色（缺陷三回归）', async () => {
    worldsApi.getWorld.mockImplementation((id) => {
      if (id === 'w1') return Promise.resolve({ id: 'w1', accent_color: '#6172ae' });
      // w2 故意永不 resolve，模拟慢网络：验证清空发生在 worldId 变化的瞬间，
      // 不是等 getWorld() 返回才发生。
      return new Promise(() => {});
    });

    function Harness() {
      const vars = useWorldAccentVars();
      const navigate = useNavigate();
      return (
        <div>
          <span data-testid="accent">{vars ? vars['--we-color-accent'] : 'null'}</span>
          <button onClick={() => navigate('/worlds/w2')}>go</button>
        </div>
      );
    }

    render(
      <MemoryRouter initialEntries={['/worlds/w1']}>
        <Harness />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.getByTestId('accent').textContent).toBe('#6172ae');

    await act(async () => {
      screen.getByText('go').click();
    });
    // w2 的 getWorld() 还没返回，此时不应再显示 w1 的颜色
    expect(screen.getByTestId('accent').textContent).toBe('null');
  });
});
