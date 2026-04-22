import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useParams: vi.fn(),
  useNavigate: vi.fn(),
  useLocation: vi.fn(),
  getWorld: vi.fn(),
  updateWorld: vi.fn(),
  getConfig: vi.fn(),
  getWorldStateValues: vi.fn(),
  updateWorldStateValue: vi.fn(),
  syncDiaryTimeField: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useParams: () => mocks.useParams(),
  useNavigate: () => mocks.useNavigate,
  useLocation: () => mocks.useLocation(),
}));
vi.mock('../../src/api/worlds', () => ({
  getWorld: (...args) => mocks.getWorld(...args),
  updateWorld: (...args) => mocks.updateWorld(...args),
}));
vi.mock('../../src/api/import-export', () => ({
  downloadWorldCard: vi.fn(),
  importWorld: vi.fn(),
  readJsonFile: vi.fn(),
}));
vi.mock('../../src/api/world-state-fields', () => ({
  listWorldStateFields: vi.fn(),
  createWorldStateField: vi.fn(),
  updateWorldStateField: vi.fn(),
  deleteWorldStateField: vi.fn(),
  reorderWorldStateFields: vi.fn(),
  syncDiaryTimeField: (...args) => mocks.syncDiaryTimeField(...args),
}));
vi.mock('../../src/api/world-state-values.js', () => ({
  getWorldStateValues: (...args) => mocks.getWorldStateValues(...args),
  updateWorldStateValue: (...args) => mocks.updateWorldStateValue(...args),
}));
vi.mock('../../src/api/character-state-fields', () => ({
  listCharacterStateFields: vi.fn(),
  createCharacterStateField: vi.fn(),
  updateCharacterStateField: vi.fn(),
  deleteCharacterStateField: vi.fn(),
  reorderCharacterStateFields: vi.fn(),
}));
vi.mock('../../src/api/persona-state-fields', () => ({
  listPersonaStateFields: vi.fn(),
  createPersonaStateField: vi.fn(),
  updatePersonaStateField: vi.fn(),
  deletePersonaStateField: vi.fn(),
  reorderPersonaStateFields: vi.fn(),
}));
vi.mock('../../src/api/config', () => ({
  getConfig: (...args) => mocks.getConfig(...args),
}));
vi.mock('../../src/components/prompt/EntryList', () => ({ default: () => <div>ENTRY LIST</div> }));
vi.mock('../../src/components/state/StateFieldList', () => ({ default: ({ scope }) => <div>{scope}-fields</div> }));
vi.mock('../../src/components/state/StateValueField', () => ({
  default: ({ field, onSave }) => (
    <button onClick={() => onSave(field.field_key, '"stored"')}>save-{field.field_key}</button>
  ),
}));
vi.mock('../../src/components/ui/MarkdownEditor', () => ({
  default: ({ value, onChange, placeholder }) => (
    <textarea aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock('../../src/components/ui/Button', () => ({
  default: ({ children, onClick, disabled, variant, size }) => (
    <button data-variant={variant} data-size={size} onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));
vi.mock('../../src/components/ui/Input', () => ({
  default: ({ value, onChange, placeholder, type = 'text' }) => (
    <input aria-label={placeholder} type={type} value={value} onChange={onChange} />
  ),
}));
vi.mock('../../src/components/ui/Select', () => ({ default: () => <div /> }));
vi.mock('../../src/components/book/SectionTabs', () => ({
  default: ({ sections }) => <div>{sections.map((section) => <div key={section.key}>{section.content}</div>)}</div>,
}));
vi.mock('../../src/components/book/SealStampAnimation', () => ({ default: () => null }));

import WorldEditPage from '../../src/pages/WorldEditPage.jsx';

describe('WorldEditPage', () => {
  beforeEach(() => {
    mocks.useParams.mockReturnValue({ worldId: 'world-1' });
    mocks.useLocation.mockReturnValue({ state: {} });
    mocks.useNavigate.mockReset();
    mocks.updateWorld.mockReset();
    mocks.updateWorldStateValue.mockReset();
    mocks.syncDiaryTimeField.mockReset();
    mocks.getWorld.mockResolvedValue({
      id: 'world-1',
      name: '群星海',
      system_prompt: '世界背景',
      post_prompt: '输出中文',
      temperature: 0.7,
      max_tokens: 1024,
    });
    mocks.getWorldStateValues.mockResolvedValue([{ field_key: 'weather', label: '天气' }]);
    mocks.getConfig.mockResolvedValue({ diary: { chat: { date_mode: 'real' } } });
    mocks.updateWorld.mockResolvedValue({ id: 'world-1' });
    mocks.updateWorldStateValue.mockResolvedValue({ success: true });
    mocks.syncDiaryTimeField.mockResolvedValue(undefined);
  });

  it('会加载世界并保存配置与默认状态值', async () => {
    render(<WorldEditPage />);

    expect(await screen.findByDisplayValue('群星海')).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('群星海'), { target: { value: '群星海-修订' } });
    fireEvent.click(screen.getByText('save-weather'));
    await waitFor(() => expect(mocks.updateWorldStateValue).toHaveBeenCalledWith('world-1', 'weather', '"stored"'));

    fireEvent.click(screen.getAllByText('保存')[0]);

    await waitFor(() => expect(mocks.updateWorld).toHaveBeenCalledWith('world-1', {
      name: '群星海-修订',
      system_prompt: '世界背景',
      post_prompt: '输出中文',
      temperature: 0.7,
      max_tokens: 1024,
    }));
    expect(mocks.useNavigate).toHaveBeenCalledWith(-1);
    expect(mocks.syncDiaryTimeField).toHaveBeenCalledWith('world-1');
  });

  it('名称为空时显示校验错误且不提交', async () => {
    render(<WorldEditPage />);

    const nameInput = await screen.findByDisplayValue('群星海');
    fireEvent.change(nameInput, { target: { value: '   ' } });
    fireEvent.click(screen.getAllByText('保存')[0]);

    await waitFor(() => expect(screen.getAllByText('名称为必填项')).toHaveLength(2));
    expect(mocks.updateWorld).not.toHaveBeenCalled();
  });
});
