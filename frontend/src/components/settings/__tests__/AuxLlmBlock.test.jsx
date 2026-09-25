import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    Object.values(callbacks).forEach((callback) => callback.mockClear());
  });

  it('保存密钥后清空输入并通知配置层', async () => {
    callbacks.onApiKeySave.mockResolvedValue(undefined);
    renderAuxLlmBlock({ provider: 'openai', has_key: false, model: '' });

    const keyInput = screen.getByPlaceholderText('输入后单独保存，不随其他配置提交');
    fireEvent.change(keyInput, { target: { value: 'test-secret' } });
    fireEvent.click(screen.getByRole('button', { name: '保存密钥' }));

    await waitFor(() => expect(callbacks.onApiKeySave).toHaveBeenCalledWith('openai', 'test-secret'));
    expect(await screen.findByRole('button', { name: '已保存' })).toBeInTheDocument();
    expect(keyInput).toHaveValue('');
    expect(callbacks.onApiKeySaved).toHaveBeenCalledOnce();
  });

  it('连接测试成功后显示状态', async () => {
    callbacks.testConnection.mockResolvedValue({ success: true });
    renderAuxLlmBlock({ provider: 'openai', has_key: true, model: '' });

    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));

    expect(await screen.findByText('连接成功')).toBeInTheDocument();
    expect(callbacks.testConnection).toHaveBeenCalledOnce();
  });

  it('连接测试失败后显示服务端错误', async () => {
    callbacks.testConnection.mockResolvedValue({ success: false, error: 'API Key 无效' });
    renderAuxLlmBlock({ provider: 'openai', has_key: true, model: '' });

    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));

    expect(await screen.findByText('连接失败：API Key 无效')).toBeInTheDocument();
  });

  it('Kimi 显示模型驱动的思考链状态', () => {
    renderAuxLlmBlock({ provider: 'kimi', has_key: true, model: '' });

    expect(screen.getByDisplayValue('模型驱动')).toBeDisabled();
  });

  it('展示 provider 专属提示和思考档位', () => {
    const { unmount } = renderAuxLlmBlock({ provider: 'xiaomi', has_key: true, model: '' });
    expect(screen.getByText(/小米官方模型接口/)).toBeInTheDocument();
    expect(screen.getByText('打开小米开放平台')).toBeInTheDocument();
    unmount();

    renderAuxLlmBlock({ provider: 'openai', has_key: true, model: '' });
    expect(screen.getByText('自动（模型默认）')).toBeInTheDocument();
  });

  it('本地 provider 保留 Base URL 设置并隐藏 API Key 输入', () => {
    renderAuxLlmBlock({ provider: 'ollama', has_key: false, base_url: 'local-endpoint' });

    expect(screen.getByText('Base URL')).toBeInTheDocument();
    expect(screen.getByDisplayValue('local-endpoint')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('输入后单独保存，不随其他配置提交')).not.toBeInTheDocument();
  });
});
