import { describe, expect, it, vi } from 'vitest';

import { pushErrorToast, pushToast } from '../../src/utils/toast.js';

describe('toast utils', () => {
  it('分发全局 toast 事件，并支持错误类型', () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');

    pushToast('保存成功');
    pushErrorToast('保存失败');

    expect(dispatch).toHaveBeenNthCalledWith(1, expect.objectContaining({
      type: 'we:toast',
      detail: { message: '保存成功', type: 'success' },
    }));
    expect(dispatch).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: 'we:toast',
      detail: { message: '保存失败', type: 'error' },
    }));
  });
});
