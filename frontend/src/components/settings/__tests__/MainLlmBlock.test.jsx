import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MainLlmBlock from '../MainLlmBlock.jsx';

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
  onApiKeySave: vi.fn(),
  onApiKeySaved: vi.fn(),
  testConnection: vi.fn(),
  loadModels: vi.fn(async () => ({ models: [] })),
};

function renderMainLlmBlock(config, overrides = {}) {
  return render(
    <MainLlmBlock
      providers={providers}
      config={config}
      {...callbacks}
      {...overrides}
    />,
  );
}

describe('MainLlmBlock', () => {
  beforeEach(() => {
    Object.values(callbacks).forEach((callback) => callback.mockReset());
    callbacks.loadModels.mockResolvedValue({ models: [] });
  });

  it('保存密钥后清空输入并通知配置层', async () => {
    callbacks.onApiKeySave.mockResolvedValue(undefined);
    renderMainLlmBlock({ provider: 'openai', has_key: false, model: '' });

    const keyInput = screen.getByPlaceholderText('输入后单独保存，不随其他配置提交');
    fireEvent.change(keyInput, { target: { value: 'test-secret' } });
    fireEvent.click(screen.getByRole('button', { name: '保存密钥' }));

    await waitFor(() => expect(callbacks.onApiKeySave).toHaveBeenCalledWith('openai', 'test-secret'));
    expect(await screen.findByRole('button', { name: '已保存' })).toBeInTheDocument();
    expect(keyInput).toHaveValue('');
    expect(callbacks.onApiKeySaved).toHaveBeenCalledOnce();
  });

  it('本地 provider 显示 Base URL 并隐藏 API Key 输入', () => {
    renderMainLlmBlock({ provider: 'ollama', has_key: false, base_url: 'local-endpoint' });

    expect(screen.getByText('Base URL')).toBeInTheDocument();
    expect(screen.getByDisplayValue('local-endpoint')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('输入后单独保存，不随其他配置提交')).not.toBeInTheDocument();
  });

  it('保留 provider 提示、思考档位和模型驱动状态', () => {
    const { unmount } = renderMainLlmBlock({ provider: 'xiaomi', has_key: true, model: '' });
    expect(screen.getByText(/小米官方模型接口/)).toBeInTheDocument();
    expect(screen.getByText('打开小米开放平台')).toBeInTheDocument();

    unmount();
    renderMainLlmBlock({ provider: 'kimi', has_key: true, model: '' });
    expect(screen.getByDisplayValue('模型驱动')).toBeDisabled();
    expect(screen.queryByText('自动（模型默认）')).not.toBeInTheDocument();
  });

  it('连接测试失败后显示服务端错误', async () => {
    callbacks.testConnection.mockResolvedValue({ success: false, error: 'API Key 无效' });
    renderMainLlmBlock({ provider: 'openai', has_key: true, model: '' });

    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));

    expect(await screen.findByText('连接失败：API Key 无效')).toBeInTheDocument();
  });

  it('写作模式的空 Provider、温度和 Token 数量继续继承对话设置', () => {
    const { container, unmount } = renderMainLlmBlock(
      { provider: '', temperature: 0, max_tokens: 64 },
      { inheritFrom: { label: '对话主模型', model: 'gpt-4.1' } },
    );

    expect(screen.getByRole('button', { name: '未配置（使用对话主模型）' })).toBeInTheDocument();
    expect(screen.getByText('用于写作页生成；未配置则回退对话主模型（gpt-4.1）。')).toBeInTheDocument();

    const temperature = container.querySelector('input[type="range"]');
    expect(temperature).toHaveValue('0');
    expect(temperature).toHaveAttribute('min', '0');
    expect(screen.getByText('继承')).toBeInTheDocument();

    const maxTokens = screen.getByPlaceholderText('留空继承对话配置');
    fireEvent.change(maxTokens, { target: { value: '' } });
    expect(callbacks.onMaxTokensChange).toHaveBeenCalledWith(null);

    unmount();
    const inheritedTemperature = renderMainLlmBlock(
      { provider: '', temperature: 0.1, max_tokens: 64 },
      { inheritFrom: { label: '对话主模型', model: 'gpt-4.1' } },
    ).container.querySelector('input[type="range"]');
    fireEvent.change(inheritedTemperature, { target: { value: '0' } });
    expect(callbacks.onTemperatureChange).toHaveBeenCalledWith(null);
  });

  it('对话模式保留默认 Temperature 和 Max Tokens', () => {
    const { container } = renderMainLlmBlock({ provider: 'openai', model: '' });

    expect(container.querySelector('input[type="range"]')).toHaveValue('0.8');
    expect(screen.getByDisplayValue('4096')).toBeInTheDocument();
  });
});
