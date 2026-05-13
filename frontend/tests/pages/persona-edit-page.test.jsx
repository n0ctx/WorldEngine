import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useParams: vi.fn(),
  useNavigate: vi.fn(),
  useLocation: vi.fn(),
  getPersona: vi.fn(),
  getPersonaById: vi.fn(),
  updatePersona: vi.fn(),
  updatePersonaById: vi.fn(),
  uploadPersonaAvatar: vi.fn(),
  getPersonaStateValues: vi.fn(),
  updatePersonaStateValue: vi.fn(),
  getPersonaStateValuesByPersonaId: vi.fn(),
  updatePersonaStateValueByPersonaId: vi.fn(),
  downloadPersonaCard: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useParams: () => mocks.useParams(),
  useNavigate: () => mocks.useNavigate,
  useLocation: () => mocks.useLocation(),
}));
vi.mock('../../src/core/api/personas', () => ({
  getPersona: (...args) => mocks.getPersona(...args),
  getPersonaById: (...args) => mocks.getPersonaById(...args),
  updatePersona: (...args) => mocks.updatePersona(...args),
  updatePersonaById: (...args) => mocks.updatePersonaById(...args),
  uploadPersonaAvatar: (...args) => mocks.uploadPersonaAvatar(...args),
}));
vi.mock('../../src/core/api/persona-state-values', () => ({
  getPersonaStateValues: (...args) => mocks.getPersonaStateValues(...args),
  updatePersonaStateValue: (...args) => mocks.updatePersonaStateValue(...args),
  getPersonaStateValuesByPersonaId: (...args) => mocks.getPersonaStateValuesByPersonaId(...args),
  updatePersonaStateValueByPersonaId: (...args) => mocks.updatePersonaStateValueByPersonaId(...args),
}));
vi.mock('../../src/core/api/import-export', () => ({
  downloadPersonaCard: (...args) => mocks.downloadPersonaCard(...args),
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
    mocks.useLocation.mockReturnValue({ pathname: '/worlds/world-1/persona', state: {} });
    mocks.useNavigate.mockReset();
    mocks.getPersona.mockResolvedValue({
      id: 'persona-1',
      name: '旅者',
      system_prompt: '异界来客',
      avatar_path: null,
    });
    mocks.getPersonaStateValues.mockResolvedValue([{ field_key: 'mood', label: '心境' }]);
    mocks.updatePersona.mockResolvedValue({ id: 'persona-1' });
    mocks.updatePersonaById.mockResolvedValue({ id: 'persona-1' });
    mocks.updatePersonaStateValue.mockResolvedValue({ success: true });
    mocks.updatePersonaStateValueByPersonaId.mockResolvedValue({ success: true });
    mocks.getPersonaStateValuesByPersonaId.mockResolvedValue([{ field_key: 'mood', label: '心境' }]);
    mocks.downloadPersonaCard.mockResolvedValue(undefined);
    mocks.uploadPersonaAvatar.mockResolvedValue({ avatar_path: 'avatars/persona.png' });
    mocks.logError.mockReset();
  });

  it('会保存玩家信息并支持导出', async () => {
    render(<PersonaEditPage />);

    expect(await screen.findByDisplayValue('旅者')).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('旅者'), { target: { value: '行者' } });
    fireEvent.click(screen.getByText('save-mood'));

    await waitFor(() => expect(mocks.updatePersonaStateValueByPersonaId).toHaveBeenCalledWith('world-1', 'persona-1', 'mood', '"玩家值"'));

    fireEvent.click(screen.getByText('导出玩家卡'));
    await waitFor(() => expect(mocks.downloadPersonaCard).toHaveBeenCalledWith('persona-1', '行者.wepersona.json'));

    fireEvent.click(screen.getByText('保存'));
    await waitFor(() => expect(mocks.updatePersonaById).toHaveBeenCalledWith('persona-1', {
      name: '行者',
      description: '',
      system_prompt: '异界来客',
    }));
    expect(mocks.useNavigate).toHaveBeenCalledWith(-1);
  });

  it('保存失败时会提示错误', async () => {
    mocks.updatePersonaById.mockRejectedValueOnce(new Error('保存失败'));

    render(<PersonaEditPage />);

    await screen.findByDisplayValue('旅者');
    fireEvent.click(screen.getByText('保存'));

    await waitFor(() => expect(mocks.logError).toHaveBeenCalledWith(
      'persona.save_failed',
      expect.anything(),
      expect.objectContaining({ toast: '保存失败：保存失败' }),
    ));
  });
});
