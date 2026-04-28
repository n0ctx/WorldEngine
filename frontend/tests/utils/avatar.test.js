import { describe, expect, it } from 'vitest';

import { getAvatarColor, getAvatarUrl } from '../../src/utils/avatar.js';

describe('avatar utils', () => {
  it('空 id 使用默认颜色，同一 id 颜色稳定', () => {
    expect(getAvatarColor()).toBe('#a23b2e');
    expect(getAvatarColor('char-1')).toBe(getAvatarColor('char-1'));
    expect(getAvatarColor('char-1')).not.toBe(getAvatarColor('char-2'));
  });

  it('区分绝对路径和相对上传路径', () => {
    expect(getAvatarUrl(null)).toBeNull();
    expect(getAvatarUrl('avatars/a.png')).toBe('/api/uploads/avatars/a.png');
    expect(getAvatarUrl('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(getAvatarUrl('/api/uploads/avatars/a.png')).toBe('/api/uploads/avatars/a.png');
  });
});
