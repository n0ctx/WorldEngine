import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AuxLlmBlock from '../AuxLlmBlock.jsx';

const providers = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'ollama', label: 'Ollama（本地）' },
  { value: 'kimi', label: 'Kimi（月之暗面）' },
  { value: 'xiaomi', label: 'Xiaomi（小米）' },
];

const callbacks = {
  onProviderChange: vi.fn(),
  onBaseUrlChange: vi.fn(),
  onModelChange: vi.fn(),
  onThinkingLevelChange: vi.fn(),
  onTemperatureChange: vi.fn(),
  onMaxTokensChange: vi.fn(),
  onSamplingChange: vi.fn(),
  onApiKeySave: vi.fn(),
  onApiKeySaved: vi.fn(),
  testConnection: vi.fn(),
  loadModels: vi.fn(async () => ({ models: [] })),
};

function renderAuxLlmBlock(config, overrides = {}) {
  return render(
    <AuxLlmBlock
      providers={providers}
      config={config}
      {...callbacks}
      {...overrides}
    />,
  );
}

describe('AuxLlmBlock', () => {
  beforeEach(() => {
    Object.values(callbacks).forEach((callback) => callback.mockReset());
    callbacks.loadModels.mockResolvedValue({ models: [] });
  });

  it('温度滑条：null 显示继承，拖到 0.9 给 0.9，拖到 0 给 null', () => {
    // Case 1: null → 0.9
    const firstRender = renderAuxLlmBlock({ provider: 'openai', temperature: null, max_tokens: null, sampling: {} });
    let container = firstRender.container;
    let temperature = container.querySelector('input[type="range"]');
    expect(temperature).toHaveValue('0');
    expect(screen.getByText('继承')).toBeInTheDocument();

    fireEvent.change(temperature, { target: { value: '0.9' } });
    expect(callbacks.onTemperatureChange).toHaveBeenCalledWith(0.9);
    firstRender.unmount();

    // Case 2: 0.9 → 0
    const secondRender = renderAuxLlmBlock({ provider: 'openai', temperature: 0.9, max_tokens: null, sampling: {} });
    container = secondRender.container;
    temperature = container.querySelector('input[type="range"]');
    expect(temperature).toHaveValue('0.9');

    fireEvent.change(temperature, { target: { value: '0' } });
    expect(callbacks.onTemperatureChange).toHaveBeenCalledWith(null);
  });

  it('单次回复上限：placeholder 留空继承主模型，输入 1024 给 1024，清空给 null', () => {
    // Case 1: null → 1024
    const firstRender = renderAuxLlmBlock({ provider: 'openai', temperature: null, max_tokens: null, sampling: {} });
    let maxTokens = screen.getByPlaceholderText('留空继承主模型');
    fireEvent.change(maxTokens, { target: { value: '1024' } });
    expect(callbacks.onMaxTokensChange).toHaveBeenCalledWith(1024);
    firstRender.unmount();

    // Case 2: 1024 → ''
    renderAuxLlmBlock({ provider: 'openai', temperature: null, max_tokens: 1024, sampling: {} });
    maxTokens = screen.getByDisplayValue('1024');
    fireEvent.change(maxTokens, { target: { value: '' } });
    expect(callbacks.onMaxTokensChange).toHaveBeenCalledWith(null);
  });

  it('provider 为 openai 时渲染高级采样且含 Top P，Top P 输入 1.5 给 { top_p: 1 }', () => {
    const { container } = renderAuxLlmBlock({ provider: 'openai', temperature: null, max_tokens: null, sampling: {} });

    expect(screen.getByText('高级采样')).toBeInTheDocument();
    const topP = container.querySelector('.we-settings-sampling input[type="number"]');
    expect(screen.getByText('Top P')).toBeInTheDocument();

    fireEvent.change(topP, { target: { value: '1.5' } });
    expect(callbacks.onSamplingChange).toHaveBeenCalledWith({ top_p: 1 });
  });

  it('provider 为空（未配置）时不渲染高级采样，但温度滑条与 max_tokens 输入框仍在', () => {
    const { container } = renderAuxLlmBlock({ provider: '', temperature: null, max_tokens: null, sampling: {} });

    expect(container.querySelector('.we-settings-sampling')).toBeNull();
    expect(container.querySelector('input[type="range"]')).not.toBeNull();
    expect(screen.getByPlaceholderText('留空继承主模型')).toBeInTheDocument();
  });
});
