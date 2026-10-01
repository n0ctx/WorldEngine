import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AboutPanel from '../../../src/components/settings/AboutPanel.jsx';

// 版本号由 vite 构建时注入，测试里补一个
vi.stubGlobal('__APP_VERSION__', '0.0.0');

describe('AboutPanel', () => {
  it('按 Rare UI 许可显示可点的署名链接', () => {
    render(<AboutPanel />);
    expect(screen.getByRole('link', { name: /Rare UI/ })).toHaveAttribute('href', 'https://rareui.com');
  });
});
