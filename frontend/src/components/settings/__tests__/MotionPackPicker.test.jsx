import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ updateConfig: vi.fn() }));
vi.mock('../../../core/api/config.js', () => api);

const MotionPackPicker = (await import('../MotionPackPicker.jsx')).default;
const { DEFAULT_MOTION_PACK_ID, getMotionPack, setMotionPack } = await import('../../../core/motion/motionPack.js');

function card(name) {
  return screen.getByRole('heading', { name }).closest('article');
}

describe('MotionPackPicker', () => {
  beforeEach(() => {
    setMotionPack('liquid');
    api.updateConfig.mockResolvedValue({ ui: { motion: 'signal' } });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    setMotionPack(DEFAULT_MOTION_PACK_ID);
  });

  it('默认是墨流；切换立刻生效并写进配置', async () => {
    expect(DEFAULT_MOTION_PACK_ID).toBe('liquid');
    render(<MotionPackPicker />);
    expect(within(card('墨流')).getByText('使用中')).toBeInTheDocument();

    fireEvent.click(within(card('信号锁定')).getByRole('button', { name: '切换' }));

    expect(getMotionPack().id).toBe('signal');
    expect(document.documentElement.dataset.motion).toBe('signal');
    expect(api.updateConfig).toHaveBeenCalledWith({ ui: { motion: 'signal' } });
    await waitFor(() => expect(within(card('信号锁定')).getByText('使用中')).toBeInTheDocument());
  });

  it('保存失败时换回原来的动效包', async () => {
    api.updateConfig.mockRejectedValue(new Error('网络断开'));
    render(<MotionPackPicker />);

    fireEvent.click(within(card('信号锁定')).getByRole('button', { name: '切换' }));

    await waitFor(() => expect(getMotionPack().id).toBe('liquid'));
    expect(within(card('墨流')).getByText('使用中')).toBeInTheDocument();
  });
});
