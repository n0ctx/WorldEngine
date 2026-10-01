import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useParams: vi.fn(),
  navigate: vi.fn(),
  useSearchParams: vi.fn(),
  listWorldEntries: vi.fn(),
  deleteWorldEntry: vi.fn(),
  reorderWorldEntries: vi.fn(),
  updateWorldEntry: vi.fn(),
  getEntryConditions: vi.fn(),
  listWorldStateFields: vi.fn(),
  listCharacterStateFields: vi.fn(),
  listPersonaStateFields: vi.fn(),
  deleteCharacterStateField: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useParams: () => mocks.useParams(),
  useNavigate: () => mocks.navigate,
  useSearchParams: () => mocks.useSearchParams(),
}));

vi.mock('../../src/core/api/prompt-entries', () => ({
  listWorldEntries: (...args) => mocks.listWorldEntries(...args),
  deleteWorldEntry: (...args) => mocks.deleteWorldEntry(...args),
  reorderWorldEntries: (...args) => mocks.reorderWorldEntries(...args),
  updateWorldEntry: (...args) => mocks.updateWorldEntry(...args),
  getEntryConditions: (...args) => mocks.getEntryConditions(...args),
}));

vi.mock('../../src/core/api/world-state-fields', () => ({
  listWorldStateFields: (...args) => mocks.listWorldStateFields(...args),
  createWorldStateField: vi.fn(),
  updateWorldStateField: vi.fn(),
  deleteWorldStateField: vi.fn(),
}));
vi.mock('../../src/core/api/character-state-fields', () => ({
  listCharacterStateFields: (...args) => mocks.listCharacterStateFields(...args),
  createCharacterStateField: vi.fn(),
  updateCharacterStateField: vi.fn(),
  deleteCharacterStateField: (...args) => mocks.deleteCharacterStateField(...args),
}));
vi.mock('../../src/core/api/persona-state-fields', () => ({
  listPersonaStateFields: (...args) => mocks.listPersonaStateFields(...args),
  createPersonaStateField: vi.fn(),
  updatePersonaStateField: vi.fn(),
  deletePersonaStateField: vi.fn(),
}));
vi.mock('../../src/core/api/world-state-values', () => ({
  getWorldStateValues: vi.fn(),
  updateWorldStateValue: vi.fn(),
}));
vi.mock('../../src/core/api/character-state-values', () => ({
  getCharacterStateValues: vi.fn(),
  updateCharacterStateValue: vi.fn(),
}));
vi.mock('../../src/core/api/persona-state-values', () => ({
  getPersonaStateValuesByPersonaId: vi.fn(),
  updatePersonaStateValueByPersonaId: vi.fn(),
}));
vi.mock('../../src/core/api/characters', () => ({
  getCharactersByWorld: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../src/core/api/personas', () => ({
  listPersonas: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/core/utils/logger.js', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: (...args) => mocks.logError(...args) },
}));

// EntryEditor / StateFieldEditor / StateValueField 都是复杂子组件，这里只关心 RulesPage 自身的
// 机制导航、列表筛选、启用开关、删除确认这些结构性行为，子组件内部逻辑各自有单测覆盖。
vi.mock('../../src/components/state/EntryEditor', () => ({
  default: ({ entry, onClose }) => (
    <div data-testid="entry-editor">
      <span>条目编辑器：{entry ? entry.title : '（新建）'}</span>
      <button onClick={onClose}>关闭编辑器</button>
    </div>
  ),
}));
vi.mock('../../src/components/state/StateFieldEditor', () => ({
  default: () => <div data-testid="state-field-editor" />,
}));
vi.mock('../../src/components/state/StateValueField', () => ({
  default: () => <div data-testid="state-value-field" />,
}));
vi.mock('../../src/components/state/WorldProfileDefaultsFields.jsx', () => ({
  default: () => <div data-testid="world-profile-defaults-fields">开场时间</div>,
}));
vi.mock('../../src/pages/RulesPage/components/CardProfileDefaultsDetail.jsx', () => ({
  default: ({ scopeKey }) => <div data-testid="card-profile-defaults">{scopeKey}</div>,
}));

import RulesPage from '../../src/pages/RulesPage/index.jsx';

const baseEntries = [
  { id: 'e-always-1', title: '世界观设定', trigger_type: 'always', enabled: 1, token: 0, keywords: [], group_name: '总则' },
  { id: 'e-always-2', title: '常驻规则', trigger_type: 'always', enabled: 1, token: 1, keywords: [], group_name: null },
  { id: 'e-keyword-1', title: '战斗触发', trigger_type: 'keyword', enabled: 1, active_turns: 1, keywords: ['战斗'], group_name: '总则' },
  { id: 'e-state-1', title: '好感条件', trigger_type: 'state', enabled: 0, keywords: [], group_name: null },
];

describe('RulesPage', () => {
  beforeEach(() => {
    mocks.useParams.mockReturnValue({ worldId: 'world-1' });
    mocks.useSearchParams.mockReturnValue([new URLSearchParams('')]);
    mocks.navigate.mockReset();
    mocks.listWorldEntries.mockReset().mockResolvedValue(baseEntries);
    mocks.deleteWorldEntry.mockReset();
    mocks.reorderWorldEntries.mockReset();
    mocks.updateWorldEntry.mockReset();
    mocks.getEntryConditions.mockReset().mockResolvedValue([]);
    mocks.listWorldStateFields.mockReset().mockResolvedValue([]);
    mocks.listCharacterStateFields.mockReset().mockResolvedValue([]);
    mocks.listPersonaStateFields.mockReset().mockResolvedValue([]);
    mocks.deleteCharacterStateField.mockReset();
    mocks.logError.mockReset();
  });

  it('页头「返回世界」回到当前世界页', async () => {
    render(<RulesPage />);
    await waitFor(() => expect(mocks.listWorldEntries).toHaveBeenCalledWith('world-1'));

    fireEvent.click(screen.getByRole('button', { name: '返回世界' }));

    expect(mocks.navigate).toHaveBeenCalledWith('/worlds/world-1');
  });

  it('左栏按触发机制自动分组，状态字段保留三个作用域', async () => {
    render(<RulesPage />);

    await waitFor(() => expect(mocks.listWorldEntries).toHaveBeenCalledWith('world-1'));

    expect(screen.getByTestId('nav-entries-all')).toHaveTextContent('全部4');
    expect(screen.getByTestId('nav-entries-always')).toHaveTextContent('一直生效2');
    expect(screen.getByTestId('nav-entries-keyword')).toHaveTextContent('出现关键词1');
    expect(screen.getByTestId('nav-entries-llm')).toHaveTextContent('AI 判断相关0');
    expect(screen.getByTestId('nav-entries-state')).toHaveTextContent('状态满足条件1');
    expect(screen.queryByTestId('nav-entries-group-总则')).not.toBeInTheDocument();

    // 状态字段：三个作用域初始为空
    await waitFor(() => expect(mocks.listCharacterStateFields).toHaveBeenCalledWith('world-1'));
    expect(screen.getByTestId('nav-fields-world')).toHaveTextContent('世界状态0');
    expect(screen.getByTestId('nav-fields-character')).toHaveTextContent('角色状态0');
    expect(screen.getByTestId('nav-fields-persona')).toHaveTextContent('玩家状态0');
  });

  it('世界状态列出档案默认值，点开后可填开场时间和地点', async () => {
    render(<RulesPage />);
    await waitFor(() => expect(mocks.listWorldStateFields).toHaveBeenCalledWith('world-1'));

    fireEvent.click(screen.getByTestId('nav-fields-world'));

    expect(screen.getByTestId('world-profile-defaults')).toHaveTextContent('档案默认值');
    expect(screen.getByTestId('world-profile-defaults-fields')).toBeInTheDocument();
  });

  it('角色状态和玩家状态列出档案默认值', async () => {
    render(<RulesPage />);
    await waitFor(() => expect(mocks.listCharacterStateFields).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('nav-fields-character'));
    expect(screen.getByTestId('character-profile-defaults')).toHaveTextContent('身份 / 外貌 / 人格');
    expect(screen.getByTestId('card-profile-defaults')).toHaveTextContent('character');

    fireEvent.click(screen.getByTestId('nav-fields-persona'));
    expect(screen.getByTestId('persona-profile-defaults')).toHaveTextContent('身份 / 外貌');
    expect(screen.getByTestId('card-profile-defaults')).toHaveTextContent('persona');
  });

  it('点击机制后中栏只显示该机制条目，不受旧手动分组影响', async () => {
    render(<RulesPage />);
    await waitFor(() => expect(mocks.listWorldEntries).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('nav-entries-always'));

    // 右栏此时是「世界规则概览」空态，注入顺序预览里也会出现同名条目——
    // 用 data-testid 把断言范围收窄到中栏列表本身，避免和概览面板的文本重复。
    const list = within(screen.getByTestId('entry-list'));
    expect(list.getByText('世界观设定')).toBeInTheDocument();
    expect(list.getByText('常驻规则')).toBeInTheDocument();
    expect(list.queryByText('战斗触发')).not.toBeInTheDocument();
    expect(list.queryByText('好感条件')).not.toBeInTheDocument();
  });

  it('点击状态条件后中栏只显示对应条目', async () => {
    render(<RulesPage />);
    await waitFor(() => expect(mocks.listWorldEntries).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('nav-entries-state'));

    const list = within(screen.getByTestId('entry-list'));
    expect(list.getByText('好感条件')).toBeInTheDocument();
    expect(list.queryByText('常驻规则')).not.toBeInTheDocument();
    expect(list.queryByText('世界观设定')).not.toBeInTheDocument();
  });

  it('点击条目行后右栏出现内嵌编辑器', async () => {
    render(<RulesPage />);
    await waitFor(() => expect(mocks.listWorldEntries).toHaveBeenCalled());

    fireEvent.click(within(screen.getByTestId('entry-list')).getByText('世界观设定'));

    expect(screen.getByTestId('entry-editor')).toHaveTextContent('世界观设定');
  });

  it('切换启用开关：失败时回滚并 toast', async () => {
    mocks.updateWorldEntry.mockRejectedValue(new Error('服务器错误'));
    render(<RulesPage />);
    await waitFor(() => expect(mocks.listWorldEntries).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole('switch', { name: '启用条目' })[0]);

    await waitFor(() => expect(mocks.logError).toHaveBeenCalledWith(
      'entry.toggle_failed',
      expect.anything(),
      expect.objectContaining({ toast: expect.stringContaining('切换失败') }),
    ));
  });

  it('删除条目：确认后调用 deleteWorldEntry 并刷新列表', async () => {
    mocks.deleteWorldEntry.mockResolvedValue({});
    render(<RulesPage />);
    await waitFor(() => expect(mocks.listWorldEntries).toHaveBeenCalled());

    fireEvent.click(screen.getAllByRole('button', { name: /^删除条目「/ })[0]);
    expect(mocks.deleteWorldEntry).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(mocks.deleteWorldEntry).toHaveBeenCalledWith('e-always-1'));
    await waitFor(() => expect(mocks.listWorldEntries).toHaveBeenCalledTimes(2));
  });

  it('调整顺序：切到顺序视图后全部条目一起展示', async () => {
    render(<RulesPage />);
    await waitFor(() => expect(mocks.listWorldEntries).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('nav-entries-always'));
    fireEvent.click(screen.getByText('调整顺序'));

    expect(screen.getByText('完成排序')).toBeInTheDocument();
    // 顺序视图跨全部 trigger_type，筛选态不影响它
    expect(screen.getByText('世界观设定')).toBeInTheDocument();
    expect(screen.getByText('战斗触发')).toBeInTheDocument();
    expect(screen.getByText('好感条件')).toBeInTheDocument();
  });

  it('删除状态字段：确认后调用 deleteFn 并重拉该作用域字段', async () => {
    mocks.useSearchParams.mockReturnValue([new URLSearchParams('tab=state')]);
    mocks.listCharacterStateFields.mockResolvedValue([{ id: 'f-1', field_key: 'goal', label: '目标', type: 'text' }]);
    mocks.deleteCharacterStateField.mockResolvedValue({});
    render(<RulesPage />);

    const list = within(await screen.findByTestId('field-list'));
    fireEvent.click(list.getByRole('button', { name: '删除字段「目标」' }));
    expect(mocks.deleteCharacterStateField).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(mocks.deleteCharacterStateField).toHaveBeenCalledWith('f-1'));
    await waitFor(() => expect(mocks.listCharacterStateFields).toHaveBeenCalledTimes(2));
  });

  it('?tab=state 时默认打开状态字段视图', async () => {
    mocks.useSearchParams.mockReturnValue([new URLSearchParams('tab=state')]);
    render(<RulesPage />);

    await waitFor(() => expect(mocks.listCharacterStateFields).toHaveBeenCalled());
    expect(screen.getByText('暂无字段')).toBeInTheDocument();
  });
});
