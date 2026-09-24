import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  renameSession: vi.fn(async (id, title) => ({ id, title })),
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('../../../src/core/api/sessions.js', () => ({
  getWorldTimeline: vi.fn(async () => [
    { id: 's1', mode: 'chat', title: '旧标题', character_id: 'c1', updated_at: Date.now() },
  ]),
  renameSession: (...args) => mocks.renameSession(...args),
  deleteSession: vi.fn(),
}));
vi.mock('../../../src/core/api/characters.js', () => ({
  getCharactersByWorld: vi.fn(async () => [{ id: 'c1', name: '白漓' }]),
}));
vi.mock('../../../src/core/api/writing-sessions.js', () => ({ deleteWritingSession: vi.fn() }));

import WorldTimelinePanel from '../../../src/components/session/WorldTimelinePanel.jsx';

describe('WorldTimelinePanel 内联重命名', () => {
  it('编辑框里的空格和回车不会触发打开会话', async () => {
    render(<WorldTimelinePanel worldId="w1" currentMode="chat" currentSessionId="s1" />);

    const title = await screen.findByText('旧标题');
    fireEvent.mouseEnter(title.closest('.we-storyline-item'));
    fireEvent.click(screen.getByLabelText('编辑会话标题'));

    const input = screen.getByDisplayValue('旧标题');
    fireEvent.keyDown(input, { key: ' ' });
    fireEvent.change(input, { target: { value: '新 标题' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(mocks.renameSession).toHaveBeenCalledWith('s1', '新 标题'));
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
