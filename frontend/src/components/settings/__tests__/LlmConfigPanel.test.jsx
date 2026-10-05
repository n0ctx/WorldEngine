import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LlmConfigPanel from '../LlmConfigPanel.jsx';
import { SETTINGS_MODE } from '../../../core/constants/settings.js';

vi.mock('../../../core/api/config', () => ({
  updateProviderKey: vi.fn(),
  fetchModels: vi.fn(async () => ({ models: [] })),
  testConnection: vi.fn(),
}));

function renderPanel(overrides = {}) {
  return render(
    <LlmConfigPanel
      settingsMode={SETTINGS_MODE.CHAT}
      llm={{}}
      onLlmChange={vi.fn()}
      auxLlm={{}}
      onAuxLlmChange={vi.fn()}
      onAuxApiKeySave={vi.fn()}
      fetchAuxModels={vi.fn(async () => ({ models: [] }))}
      testAuxConnection={vi.fn()}
      assistantModelSource="main"
      onAssistantModelSourceChange={vi.fn()}
      proxyUrl=""
      onProxyUrlSave={vi.fn()}
      {...overrides}
    />,
  );
}

describe('LlmConfigPanel', () => {
  it('不再渲染 Embedding 区块或其测试按钮', async () => {
    renderPanel();

    await waitFor(() => expect(screen.getByText('模型')).toBeInTheDocument());
    expect(screen.queryByText('Embedding 模型')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /测试 Embedding/ })).not.toBeInTheDocument();
    expect(screen.getByText(/仅对 LLM 网络请求生效/)).toBeInTheDocument();
  });
});
