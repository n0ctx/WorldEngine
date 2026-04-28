import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.fn();
const useLocationMock = vi.fn();
const settingsHook = vi.hoisted(() => ({
  value: {
    loading: false,
    llmProps: { llm: {}, embedding: {} },
    promptProps: {},
    diaryProps: {},
    onImportSuccess: vi.fn(),
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useLocation: () => useLocationMock(),
}));

vi.mock('../../src/hooks/useSettingsConfig.js', () => ({
  useSettingsConfig: () => settingsHook.value,
}));

vi.mock('../../src/components/settings/LlmConfigPanel', () => ({ default: () => <div>LLM PANEL</div> }));
vi.mock('../../src/components/settings/PromptConfigPanel', () => ({ default: () => <div>PROMPT PANEL</div> }));
vi.mock('../../src/components/settings/ImportExportPanel', () => ({ default: () => <div>IMPORT PANEL</div> }));
vi.mock('../../src/components/settings/AboutPanel', () => ({ default: () => <div>ABOUT PANEL</div> }));
vi.mock('../../src/components/settings/ModeSwitch', () => ({ default: () => <div>MODE SWITCH</div> }));
vi.mock('../../src/components/settings/CustomCssManager', () => ({ default: () => <div>CSS PANEL</div> }));
vi.mock('../../src/components/settings/RegexRulesManager', () => ({ default: () => <div>REGEX PANEL</div> }));
vi.mock('../../src/components/settings/FeaturesConfigPanel', () => ({ default: () => <div>FEATURES PANEL</div> }));

import SettingsPage from '../../src/pages/SettingsPage.jsx';

describe('SettingsPage', () => {
  beforeEach(() => {
    settingsHook.value = {
      loading: false,
      llmProps: { llm: {}, embedding: {} },
      promptProps: {},
      diaryProps: {},
      onImportSuccess: vi.fn(),
    };
    useLocationMock.mockReturnValue({ state: { backgroundLocation: null } });
    navigate.mockReset();
  });

  it('能切换导航 section 并响应返回', () => {
    render(<SettingsPage />);

    expect(screen.getByText('LLM PANEL')).toBeInTheDocument();
    fireEvent.click(screen.getByText('全局提示词'));
    expect(screen.getByText('PROMPT PANEL')).toBeInTheDocument();

    fireEvent.click(screen.getByText('自定义 CSS'));
    expect(screen.getByText('CSS PANEL')).toBeInTheDocument();

    fireEvent.click(screen.getByText('← 返回'));
    expect(navigate).toHaveBeenCalledWith(-1);
  });

  it('支持功能/正则/导入导出/关于分区，以及 from 回跳', () => {
    useLocationMock.mockReturnValue({
      state: {
        backgroundLocation: null,
        from: { pathname: '/worlds/1', search: '?tab=a', hash: '#x', state: { a: 1 } },
      },
    });

    render(<SettingsPage />);
    fireEvent.click(screen.getByText('功能配置'));
    expect(screen.getByText('FEATURES PANEL')).toBeInTheDocument();
    fireEvent.click(screen.getByText('正则规则'));
    expect(screen.getByText('REGEX PANEL')).toBeInTheDocument();
    fireEvent.click(screen.getByText('导入导出'));
    expect(screen.getByText('IMPORT PANEL')).toBeInTheDocument();
    fireEvent.click(screen.getByText('关于'));
    expect(screen.getByText('ABOUT PANEL')).toBeInTheDocument();

    fireEvent.click(screen.getByText('← 返回'));
    expect(navigate).toHaveBeenCalledWith(
      { pathname: '/worlds/1', search: '?tab=a', hash: '#x' },
      { state: { a: 1 } },
    );
  });

  it('loading 时覆盖普通页与 overlay 两种壳子，并支持点击 overlay 关闭', () => {
    settingsHook.value = {
      loading: true,
      llmProps: {},
      promptProps: {},
      diaryProps: {},
      onImportSuccess: vi.fn(),
    };
    useLocationMock.mockReturnValue({ state: { backgroundLocation: null } });
    const { rerender } = render(<SettingsPage />);
    expect(screen.getByText('加载中…')).toBeInTheDocument();

    useLocationMock.mockReturnValue({ state: { backgroundLocation: { pathname: '/' } } });
    rerender(<SettingsPage />);
    const overlay = document.querySelector('.we-settings-overlay');
    fireEvent.click(overlay);
    expect(navigate).toHaveBeenCalledWith(-1);
  });
});
