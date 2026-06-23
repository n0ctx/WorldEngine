import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useParams: vi.fn(),
  useNavigate: vi.fn(),
  useLocation: vi.fn(),
  getCharacter: vi.fn(),
  createCharacter: vi.fn(),
  updateCharacter: vi.fn(),
  uploadAvatar: vi.fn(),
  getCharacterStateValues: vi.fn(),
  updateCharacterStateValue: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useParams: () => mocks.useParams(),
  useNavigate: () => mocks.useNavigate,
  useLocation: () => mocks.useLocation(),
}));
vi.mock('../../src/core/api/characters', () => ({
  getCharacter: (...args) => mocks.getCharacter(...args),
  createCharacter: (...args) => mocks.createCharacter(...args),
  updateCharacter: (...args) => mocks.updateCharacter(...args),
  uploadAvatar: (...args) => mocks.uploadAvatar(...args),
}));
vi.mock('../../src/core/api/import-export', () => ({
  downloadCharacterCard: vi.fn(),
  importCharacter: vi.fn(),
  readJsonFile: vi.fn(),
}));
vi.mock('../../src/core/api/character-state-values', () => ({
  getCharacterStateValues: (...args) => mocks.getCharacterStateValues(...args),
  updateCharacterStateValue: (...args) => mocks.updateCharacterStateValue(...args),
}));
vi.mock('../../src/core/utils/logger.js', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: (...args) => mocks.logError(...args),
  },
}));
vi.mock('../../src/core/utils/avatar', () => ({
  getAvatarColor: () => '#946',
  getAvatarUrl: (path) => (path ? `/uploads/${path}` : ''),
}));
vi.mock('../../src/components/state/StateValueField', () => ({
  default: ({ field, onSave }) => (
    <button onClick={() => onSave(field.field_key, '"hp-10"')}>save-{field.field_key}</button>
  ),
}));
vi.mock('../../src/components/ui/MarkdownEditor', () => ({
  default: ({ value, onChange, placeholder }) => (
    <textarea aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock('../../src/components/ui/Button', () => ({
  default: ({ children, onClick, disabled }) => <button onClick={onClick} disabled={disabled}>{children}</button>,
}));
vi.mock('../../src/components/ui/Input', () => ({
  default: ({ value, onChange, placeholder }) => <input aria-label={placeholder} value={value} onChange={onChange} />,
}));
vi.mock('../../src/components/ui/Select', () => ({ default: () => <div /> }));
vi.mock('../../src/components/ui/SectionTabs.jsx', () => ({
  default: ({ sections }) => <div>{sections.map((section) => <div key={section.key}>{section.content}</div>)}</div>,
}));
vi.mock('../../src/pages/CharacterEditPage/components/SealStampAnimation.jsx', () => ({ default: () => null }));

import CharacterEditPage from '../../src/pages/CharacterEditPage/index.jsx';

describe('CharacterEditPage', () => {
  beforeEach(() => {
    mocks.useParams.mockReturnValue({ characterId: 'char-1' });
    mocks.useLocation.mockReturnValue({ state: {} });
    mocks.useNavigate.mockReset();
    mocks.createCharacter.mockReset();
    mocks.getCharacter.mockResolvedValue({
      id: 'char-1',
      world_id: 'world-1',
      name: '阿塔',
      system_prompt: '冷静',
      post_prompt: '保留神秘感',
      first_message: '你好',
      avatar_path: null,
    });
    mocks.getCharacterStateValues.mockResolvedValue([{ field_key: 'age_char', label: '年龄' }]);
    mocks.createCharacter.mockResolvedValue({ id: 'char-2' });
    mocks.updateCharacter.mockResolvedValue({ id: 'char-1' });
    mocks.updateCharacterStateValue.mockResolvedValue({ success: true });
    mocks.uploadAvatar.mockResolvedValue({ avatar_path: 'avatars/char-1.png' });
    mocks.logError.mockReset();
  });

  it('会保存角色编辑结果并保存状态初始值', async () => {
    render(<CharacterEditPage />);

    expect(await screen.findByDisplayValue('阿塔')).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('阿塔'), { target: { value: '阿塔-新' } });
    expect(await screen.findByText('年龄')).toBeInTheDocument();
    expect(screen.queryByText('age_char')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('save-age_char'));

    await waitFor(() => expect(mocks.updateCharacterStateValue).toHaveBeenCalledWith('char-1', 'age_char', '"hp-10"'));

    fireEvent.click(screen.getAllByText('保存')[0]);

    await waitFor(() => expect(mocks.updateCharacter).toHaveBeenCalledWith('char-1', {
      name: '阿塔-新',
      description: '',
      system_prompt: '冷静',
      post_prompt: '保留神秘感',
      first_message: '你好',
    }));
    expect(mocks.useNavigate).toHaveBeenCalledWith(-1);
  });

  it('上传头像失败时会显示错误提示', async () => {
    mocks.uploadAvatar.mockRejectedValueOnce(new Error('文件过大'));

    render(<CharacterEditPage />);

    const fileInput = await screen.findByLabelText('', { selector: 'input[type="file"]' }).catch(() => null);
    const input = fileInput || document.querySelector('input[type="file"]');
    fireEvent.change(input, { target: { files: [new File(['x'], 'avatar.png', { type: 'image/png' })] } });

    await waitFor(() => expect(mocks.logError).toHaveBeenCalledWith(
      'character.avatar.upload_failed',
      expect.anything(),
      expect.objectContaining({ toast: '头像上传失败：文件过大' }),
    ));
  });

  it('overlay 创建成功后会关闭角色创建页', async () => {
    mocks.useParams.mockReturnValue({ worldId: 'world-1' });
    mocks.useLocation.mockReturnValue({
      state: { backgroundLocation: { pathname: '/worlds/world-1' } },
    });

    render(<CharacterEditPage />);

    fireEvent.change(screen.getByLabelText('角色的名字'), { target: { value: '新角色' } });
    fireEvent.click(screen.getByText('创建角色'));

    await waitFor(() => expect(mocks.createCharacter).toHaveBeenCalledWith('world-1', {
      name: '新角色',
      description: '',
      system_prompt: '',
      post_prompt: '',
      first_message: '',
    }));
    expect(mocks.useNavigate).toHaveBeenCalledWith(-1);
  });
});
