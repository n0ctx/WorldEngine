import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import CharacterSeal from '../../../src/components/chat/CharacterSeal.jsx';

describe('CharacterSeal', () => {
  it('没有头像时不渲染任何占位', () => {
    const { container } = render(<CharacterSeal character={{ id: 'c1', name: '白漓', avatar_path: null }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('有头像时只渲染头像图片', () => {
    const { container } = render(<CharacterSeal character={{ id: 'c1', name: '白漓', avatar_path: 'avatars/c1.png' }} size={32} />);
    const img = container.querySelector('img.we-character-seal');
    expect(img).toHaveAttribute('src', '/api/uploads/avatars/c1.png');
    expect(container.textContent).toBe('');
  });
});
