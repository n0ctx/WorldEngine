import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useParams: vi.fn(),
  useNavigate: vi.fn(),
  useLocation: vi.fn(),
  getWorld: vi.fn(),
  createWorld: vi.fn(),
  updateWorld: vi.fn(),
  getConfig: vi.fn(),
  getWorldStateValues: vi.fn(),
  updateWorldStateValue: vi.fn(),
  uploadWorldCover: vi.fn(),
  extractAccentColorFromFile: vi.fn(),
  extractAccentColorFromImageSrc: vi.fn(),
  loadedWorld: {},
}));

vi.mock('react-router-dom', () => ({
  useParams: () => mocks.useParams(),
  useNavigate: () => mocks.useNavigate,
  useLocation: () => mocks.useLocation(),
}));
vi.mock('../../src/core/api/worlds', () => ({
  getWorld: (...args) => mocks.getWorld(...args),
  createWorld: (...args) => mocks.createWorld(...args),
  updateWorld: (...args) => mocks.updateWorld(...args),
  uploadWorldCover: (...args) => mocks.uploadWorldCover(...args),
}));
vi.mock('../../src/core/utils/extractAccentColor.js', () => ({
  extractAccentColorFromFile: (...args) => mocks.extractAccentColorFromFile(...args),
  extractAccentColorFromImageSrc: (...args) => mocks.extractAccentColorFromImageSrc(...args),
  FALLBACK_ACCENT_HEX: '#7f95a8',
}));
vi.mock('../../src/core/api/import-export', () => ({
  downloadWorldCard: vi.fn(),
  importWorld: vi.fn(),
  readJsonFile: vi.fn(),
}));
vi.mock('../../src/core/api/world-state-fields', () => ({
  listWorldStateFields: vi.fn(),
  createWorldStateField: vi.fn(),
  updateWorldStateField: vi.fn(),
  deleteWorldStateField: vi.fn(),
  reorderWorldStateFields: vi.fn(),
}));
vi.mock('../../src/core/api/world-state-values.js', () => ({
  getWorldStateValues: (...args) => mocks.getWorldStateValues(...args),
  updateWorldStateValue: (...args) => mocks.updateWorldStateValue(...args),
}));
vi.mock('../../src/core/api/character-state-fields', () => ({
  listCharacterStateFields: vi.fn(),
  createCharacterStateField: vi.fn(),
  updateCharacterStateField: vi.fn(),
  deleteCharacterStateField: vi.fn(),
  reorderCharacterStateFields: vi.fn(),
}));
vi.mock('../../src/core/api/persona-state-fields', () => ({
  listPersonaStateFields: vi.fn(),
  createPersonaStateField: vi.fn(),
  updatePersonaStateField: vi.fn(),
  deletePersonaStateField: vi.fn(),
  reorderPersonaStateFields: vi.fn(),
}));
vi.mock('../../src/core/api/config', () => ({
  getConfig: (...args) => mocks.getConfig(...args),
}));
vi.mock('../../src/components/rules/StateFieldList', () => ({ default: ({ scope }) => <div>{scope}-fields</div> }));
vi.mock('../../src/components/ui/AvatarUpload', () => ({
  default: ({ fileInputRef, onFileChange }) => <input ref={fileInputRef} type="file" onChange={onFileChange} />,
}));
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
vi.mock('../../src/components/ui/SectionTabs.jsx', () => ({
  default: ({ sections }) => <div>{sections.map((section) => <div key={section.key}>{section.content}</div>)}</div>,
}));

import WorldEditPage from '../../src/pages/WorldEditPage/index.jsx';

describe('WorldEditPage', () => {
  beforeEach(() => {
    mocks.useParams.mockReturnValue({ worldId: 'world-1' });
    mocks.useLocation.mockReturnValue({ state: {} });
    mocks.useNavigate.mockReset();
    mocks.createWorld.mockReset();
    mocks.updateWorld.mockReset();
    mocks.uploadWorldCover.mockReset();
    mocks.extractAccentColorFromFile.mockReset();
    mocks.extractAccentColorFromImageSrc.mockReset();
    mocks.updateWorldStateValue.mockReset();
    mocks.loadedWorld = {
      id: 'world-1',
      name: '群星海',
      temperature: 0.7,
      max_tokens: 1024,
      accent_color: null,
      accent_source: 'auto',
    };
    mocks.getWorld.mockImplementation(async () => ({ ...mocks.loadedWorld }));
    mocks.getWorldStateValues.mockResolvedValue([{ field_key: 'weather', label: '天气' }]);
    mocks.getConfig.mockResolvedValue({ diary: { chat: { date_mode: 'real' } } });
    mocks.createWorld.mockResolvedValue({ id: 'world-2' });
    mocks.updateWorld.mockImplementation(async (_id, patch) => {
      mocks.loadedWorld = { ...mocks.loadedWorld, ...patch };
      return { id: 'world-1' };
    });
    mocks.uploadWorldCover.mockImplementation(async (_id, file, accentColor) => {
      const manual = mocks.loadedWorld.accent_source === 'manual';
      const nextAccentColor = manual ? mocks.loadedWorld.accent_color : accentColor;
      mocks.loadedWorld = {
        ...mocks.loadedWorld,
        cover_path: 'covers/new-cover.png',
        accent_color: nextAccentColor,
        accent_source: manual ? 'manual' : 'auto',
      };
      return {
        cover_path: 'covers/new-cover.png',
        accent_color: nextAccentColor,
        accent_source: manual ? 'manual' : 'auto',
      };
    });
    mocks.extractAccentColorFromFile.mockResolvedValue('#123456');
    mocks.extractAccentColorFromImageSrc.mockResolvedValue('#789abc');
    mocks.updateWorldStateValue.mockResolvedValue({ success: true });
  });

  it('加载失败时显示错误而不是空表单，重试后恢复', async () => {
    mocks.getWorld.mockRejectedValueOnce(new Error('世界不存在'));
    render(<WorldEditPage />);

    expect(await screen.findByText('世界不存在')).toBeInTheDocument();
    expect(screen.queryByText('保存')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('重试'));
    expect(await screen.findByDisplayValue('群星海')).toBeInTheDocument();
  });

  it('有未保存修改时返回需确认，未修改时直接返回', async () => {
    render(<WorldEditPage />);
    const nameInput = await screen.findByDisplayValue('群星海');

    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    expect(mocks.useNavigate).toHaveBeenCalledWith(-1);
    mocks.useNavigate.mockClear();

    fireEvent.change(nameInput, { target: { value: '群星海-修订' } });
    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    expect(mocks.useNavigate).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByText('放弃修改'));
    await waitFor(() => expect(mocks.useNavigate).toHaveBeenCalledWith(-1));
  });

  it('会加载世界并保存配置', async () => {
    render(<WorldEditPage />);

    expect(await screen.findByDisplayValue('群星海')).toBeInTheDocument();
    expect(screen.getByText('world-fields')).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('群星海'), { target: { value: '群星海-修订' } });

    fireEvent.click(screen.getAllByText('保存')[0]);

    await waitFor(() => expect(mocks.updateWorld).toHaveBeenCalledWith('world-1', {
      name: '群星海-修订',
      description: '',
      temperature: 0.7,
      max_tokens: 1024,
    }));
    expect(mocks.useNavigate).toHaveBeenCalledWith(-1);
  });

  it('保存 LLM 参数时保留数值转换', async () => {
    render(<WorldEditPage />);

    await screen.findByDisplayValue('群星海');
    const llmInputs = screen.getAllByLabelText('留空则使用全局配置');
    fireEvent.change(llmInputs[0], { target: { value: '1.25' } });
    fireEvent.change(llmInputs[1], { target: { value: '2048' } });
    fireEvent.click(screen.getAllByText('保存')[1]);

    await waitFor(() => expect(mocks.updateWorld).toHaveBeenCalledWith('world-1', {
      name: '群星海',
      description: '',
      temperature: 1.25,
      max_tokens: 2048,
    }));
  });

  it('新建状态模板不挂载；编辑页上传封面并保留主色切换逻辑', async () => {
    mocks.useParams.mockReturnValue({});
    const createView = render(<WorldEditPage />);
    expect(screen.queryByText('world-fields')).not.toBeInTheDocument();
    createView.unmount();

    mocks.useParams.mockReturnValue({ worldId: 'world-1' });
    mocks.loadedWorld = {
      ...mocks.loadedWorld,
      cover_path: 'covers/old-cover.png',
      accent_color: '#445566',
      accent_source: 'auto',
    };
    const updatedEvent = vi.fn();
    window.addEventListener('we:world-updated', updatedEvent);
    render(<WorldEditPage />);
    await screen.findByDisplayValue('群星海');

    const file = new File(['cover'], 'cover.png', { type: 'image/png' });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
    await waitFor(() => expect(mocks.uploadWorldCover).toHaveBeenCalledWith('world-1', file, '#123456'));
    expect(mocks.extractAccentColorFromFile).toHaveBeenCalledWith(file);

    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(mocks.updateWorld).toHaveBeenCalledWith('world-1', {
      accent_color: '#123456',
      accent_source: 'manual',
    }));

    fireEvent.change(await screen.findByLabelText('选择主色'), { target: { value: '#aabbcc' } });
    await waitFor(() => expect(mocks.updateWorld).toHaveBeenCalledWith('world-1', {
      accent_color: '#aabbcc',
      accent_source: 'manual',
    }));

    mocks.extractAccentColorFromFile.mockClear();
    const manualCover = new File(['manual cover'], 'manual-cover.png', { type: 'image/png' });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [manualCover] } });
    await waitFor(() => expect(mocks.uploadWorldCover).toHaveBeenLastCalledWith('world-1', manualCover, null));
    expect(mocks.extractAccentColorFromFile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(mocks.extractAccentColorFromImageSrc).toHaveBeenCalledWith('/api/uploads/covers/new-cover.png'));
    await waitFor(() => expect(mocks.updateWorld).toHaveBeenCalledWith('world-1', {
      accent_color: '#789abc',
      accent_source: 'auto',
    }));
    expect(updatedEvent).toHaveBeenCalled();
    window.removeEventListener('we:world-updated', updatedEvent);
  });

  it('名称为空时显示校验错误且不提交', async () => {
    render(<WorldEditPage />);

    const nameInput = await screen.findByDisplayValue('群星海');
    fireEvent.change(nameInput, { target: { value: '   ' } });
    fireEvent.click(screen.getAllByText('保存')[0]);

    await waitFor(() => expect(screen.getAllByText('名称为必填项')).toHaveLength(2));
    expect(mocks.updateWorld).not.toHaveBeenCalled();
  });

  it('创建模式重新打开时会恢复草稿', async () => {
    mocks.useParams.mockReturnValue({});
    mocks.useLocation.mockReturnValue({ state: {} });

    const { unmount } = render(<WorldEditPage />);
    fireEvent.change(screen.getByLabelText('世界的名称'), { target: { value: '草稿世界' } });
    unmount();

    render(<WorldEditPage />);
    expect(await screen.findByDisplayValue('草稿世界')).toBeInTheDocument();
    sessionStorage.removeItem('world_create_draft');
  });

  it('overlay 创建成功后会关闭创建页而不是停在保存中', async () => {
    mocks.useParams.mockReturnValue({});
    mocks.useLocation.mockReturnValue({
      state: { backgroundLocation: { pathname: '/' } },
    });

    render(<WorldEditPage />);

    fireEvent.change(screen.getByLabelText('世界的名称'), { target: { value: '新世界' } });
    fireEvent.click(screen.getByText('创建世界'));

    await waitFor(() => expect(mocks.createWorld).toHaveBeenCalledWith({
      name: '新世界',
      description: '',
    }));
    expect(mocks.useNavigate).toHaveBeenCalledWith(-1);
  });

  it('直达创建成功后会切到编辑页并清掉保存态', async () => {
    mocks.useParams.mockReturnValue({});
    mocks.useLocation.mockReturnValue({ state: {} });

    render(<WorldEditPage />);

    fireEvent.change(screen.getByLabelText('世界的名称'), { target: { value: '直达新世界' } });
    fireEvent.click(screen.getByText('创建世界'));

    await waitFor(() => expect(mocks.createWorld).toHaveBeenCalledWith({
      name: '直达新世界',
      description: '',
    }));
    expect(mocks.useNavigate).toHaveBeenCalledWith('/worlds/world-2/edit', { replace: true });
  });
});
