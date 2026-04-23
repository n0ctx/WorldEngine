import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useParams: vi.fn(),
  useNavigate: vi.fn(),
  useLocation: vi.fn(),
  getPersona: vi.fn(),
  updatePersona: vi.fn(),
  uploadPersonaAvatar: vi.fn(),
  getPersonaStateValues: vi.fn(),
  updatePersonaStateValue: vi.fn(),
  downloadPersonaCard: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useParams: () => mocks.useParams(),
  useNavigate: () => mocks.useNavigate,
  useLocation: () => mocks.useLocation(),
}));
vi.mock('../../src/api/personas', () => ({
  getPersona: (...args) => mocks.getPersona(...args),
  updatePersona: (...args) => mocks.updatePersona(...args),
  uploadPersonaAvatar: (...args) => mocks.uploadPersonaAvatar(...args),
}));
vi.mock('../../src/api/persona-state-values', () => ({
  getPersonaStateValues: (...args) => mocks.getPersonaStateValues(...args),
  updatePersonaStateValue: (...args) => mocks.updatePersonaStateValue(...args),
}));
vi.mock('../../src/api/import-export', () => ({
  downloadPersonaCard: (...args) => mocks.downloadPersonaCard(...args),
}));
vi.mock('../../src/utils/avatar', () => ({
  getAvatarColor: () => '#333',
  getAvatarUrl: (path) => (path ? `/uploads/${path}` : ''),
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
vi.mock('../../src/components/state/StateValueField', () => ({
  default: ({ field, onSave }) => <button onClick={() => onSave(field.field_key, '"玩家值"')}>save-{field.field_key}</button>,
}));

import PersonaEditPage from '../../src/pages/PersonaEditPage.jsx';

describe('PersonaEditPage', () => {
  beforeEach(() => {
    mocks.useParams.mockReturnValue({ worldId: 'world-1' });
    mocks.useLocation.mockReturnValue({ state: {} });
    mocks.useNavigate.mockReset();
    mocks.getPersona.mockResolvedValue({
      id: 'persona-1',
      name: '旅者',
      system_prompt: '异界来客',
      avatar_path: null,
    });
    mocks.getPersonaStateValues.mockResolvedValue([{ field_key: 'mood', label: '心境' }]);
    mocks.updatePersona.mockResolvedValue({ id: 'persona-1' });
    mocks.updatePersonaStateValue.mockResolvedValue({ success: true });
    mocks.downloadPersonaCard.mockResolvedValue(undefined);
    mocks.uploadPersonaAvatar.mockResolvedValue({ avatar_path: 'avatars/persona.png' });
    global.alert = vi.fn();
  });

  it('会保存玩家信息并支持导出', async () => {
    render(<PersonaEditPage />);

    expect(await screen.findByDisplayValue('旅者')).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('旅者'), { target: { value: '行者' } });
    fireEvent.click(screen.getByText('save-mood'));

    await waitFor(() => expect(mocks.updatePersonaStateValue).toHaveBeenCalledWith('world-1', 'mood', '"玩家值"'));

    fireEvent.click(screen.getByText('导出为角色卡'));
    await waitFor(() => expect(mocks.downloadPersonaCard).toHaveBeenCalledWith('world-1', '行者.wechar.json'));

    fireEvent.click(screen.getByText('保存'));
    await waitFor(() => expect(mocks.updatePersona).toHaveBeenCalledWith('world-1', {
      name: '行者',
      system_prompt: '异界来客',
    }));
    expect(mocks.useNavigate).toHaveBeenCalledWith(-1);
  });

  it('保存失败时会提示错误', async () => {
    mocks.updatePersona.mockRejectedValueOnce(new Error('保存失败'));

    render(<PersonaEditPage />);

    await screen.findByDisplayValue('旅者');
    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => expect(global.alert).toHaveBeenCalledWith('保存失败：保存失败'));
  });
});
