import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.fn();
const useLocationMock = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useLocation: () => useLocationMock(),
}));

vi.mock('../../src/hooks/useSettingsConfig.js', () => ({
  useSettingsConfig: () => ({
    loading: false,
    llmProps: { llm: {}, embedding: {} },
    promptProps: {},
    onImportSuccess: vi.fn(),
  }),
}));

vi.mock('../../src/components/settings/LlmConfigPanel', () => ({ default: () => <div>LLM PANEL</div> }));
vi.mock('../../src/components/settings/PromptConfigPanel', () => ({ default: () => <div>PROMPT PANEL</div> }));
vi.mock('../../src/components/settings/ImportExportPanel', () => ({ default: () => <div>IMPORT PANEL</div> }));
vi.mock('../../src/components/settings/AboutPanel', () => ({ default: () => <div>ABOUT PANEL</div> }));
vi.mock('../../src/components/settings/ModeSwitch', () => ({ default: () => <div>MODE SWITCH</div> }));
vi.mock('../../src/components/settings/CustomCssManager', () => ({ default: () => <div>CSS PANEL</div> }));
vi.mock('../../src/components/settings/RegexRulesManager', () => ({ default: () => <div>REGEX PANEL</div> }));

import SettingsPage from '../../src/pages/SettingsPage.jsx';

describe('SettingsPage', () => {
  beforeEach(() => {
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
});
