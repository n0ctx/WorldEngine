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
  onSamplingChange: vi.fn(),
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

    expect(screen.getByText('接口地址')).toBeInTheDocument();
    expect(screen.getByDisplayValue('local-endpoint')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('输入后单独保存，不随其他配置提交')).not.toBeInTheDocument();
  });

  it('保留 provider 提示，按服务商显示思考档位', () => {
    const { unmount } = renderMainLlmBlock({ provider: 'xiaomi', has_key: true, model: '' });
    expect(screen.getByText(/小米 MiMo 官方接口/)).toBeInTheDocument();
    expect(screen.getByText('查看 MiMo 接口文档')).toBeInTheDocument();

    unmount();
    const kimi = renderMainLlmBlock({ provider: 'kimi', has_key: true, model: '' });
    expect(screen.getByText('思考强度')).toBeInTheDocument();
    expect(screen.getByText('自动（模型默认）')).toBeInTheDocument();

    kimi.unmount();
    renderMainLlmBlock({ provider: 'lmstudio', has_key: false, model: '' });
    expect(screen.queryByText('思考强度')).not.toBeInTheDocument();
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

  it('高级采样只列出当前服务商支持的参数，Kimi 只给出说明', () => {
    const { container, rerender } = renderMainLlmBlock({ provider: 'ollama', sampling: { top_k: 40 } });

    expect(screen.getByText('高级采样（已设置 1 项）')).toBeInTheDocument();
    expect(['Top P', 'Top K', 'Min P', '重复惩罚', '存在惩罚', '频率惩罚'].every((label) => screen.queryByText(label))).toBe(true);
    expect(screen.getByDisplayValue('40')).toBeInTheDocument();

    rerender(<MainLlmBlock providers={providers} config={{ provider: 'openai' }} {...callbacks} />);
    expect(screen.queryByText('Top K')).not.toBeInTheDocument();
    expect(screen.getByText('Top P')).toBeInTheDocument();

    rerender(<MainLlmBlock providers={providers} config={{ provider: 'kimi' }} {...callbacks} />);
    expect(container.querySelector('.we-settings-sampling')).not.toBeNull();
    expect(screen.queryByText('Top P')).not.toBeInTheDocument();
    expect(screen.getByText('当前服务商固定了采样参数或会拒收这些参数，这里没有可调项。')).toBeInTheDocument();

    rerender(<MainLlmBlock providers={providers} config={{ provider: '' }} {...callbacks} />);
    expect(container.querySelector('.we-settings-sampling')).toBeNull();
  });

  it('改采样参数时存规整后的数字，清空存 null', () => {
    renderMainLlmBlock({ provider: 'openai', sampling: { top_p: 0.9 } });
    const input = screen.getByDisplayValue('0.9');

    fireEvent.change(input, { target: { value: '1.5' } });
    expect(callbacks.onSamplingChange).toHaveBeenLastCalledWith({ top_p: 1 });

    fireEvent.change(input, { target: { value: '' } });
    expect(callbacks.onSamplingChange).toHaveBeenLastCalledWith({ top_p: null });
  });
});
