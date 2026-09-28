import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateStateEntity: vi.fn(),
  updateStateEntityField: vi.fn(),
}));

vi.mock('../../../src/core/api/state-memory.js', () => ({
  updateStateEntity: (...a) => mocks.updateStateEntity(...a),
  updateStateEntityField: (...a) => mocks.updateStateEntityField(...a),
}));
vi.mock('../../../src/core/utils/logger.js', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

import EntityStateBlock from '../../../src/components/state/EntityStateBlock.jsx';

const schema = {
  profileFields: {
    character: [
      { key: 'gender', label: '性别', group: '身份', kind: 'text', mutability: 'immutable', synonyms: [] },
      { key: 'occupation', label: '职业', group: '身份', kind: 'text', mutability: 'semi_stable', synonyms: [] },
      { key: 'outfit', label: '穿着', group: '外貌', kind: 'list', mutability: 'dynamic', synonyms: [] },
      { key: 'core_traits', label: '核心性格', group: '人格', kind: 'list', mutability: 'semi_stable', synonyms: [] },
    ],
  },
  dynamicLocationKey: '位置',
};

function baseEntity(overrides = {}) {
  return {
    entity_id: 'e1',
    type: 'character',
    name: '沈彦',
    card_id: null,
    profile: {
      gender: { value: '男', evidence: '他是个男人', round: 3 },
      occupation: { value: '前海军军官', evidence: '曾任海军军官', round: 2 },
    },
    dynamic: { 伤势: '右臂受伤', 位置: '旧港仓库' },
    fields: [],
    age: { age: 30, text: '30 岁' },
    activeProfileFields: ['gender', 'occupation', 'outfit', 'core_traits'],
    ...overrides,
  };
}

const entities = [
  { entity_id: 'e1', name: '沈彦', type: 'character', status: 'active' },
  { entity_id: 'e5', name: '黑潮会', type: 'faction', status: 'active' },
  { entity_id: 'e7', name: '银戒指', type: 'item', status: 'active' },
];

const relations = [
  { relation_id: 'r1', subject_id: 'e1', predicate: '成员', object_id: 'e5', object_value: null },
  { relation_id: 'r2', subject_id: 'e7', predicate: '持有者', object_id: 'e1', object_value: null },
];

function renderBlock(props = {}) {
  return render(
    <EntityStateBlock
      sessionId="s1"
      entity={baseEntity()}
      schema={schema}
      entities={entities}
      relations={[]}
      reload={vi.fn()}
      {...props}
    />,
  );
}

function expandProfile() {
  fireEvent.click(screen.getByRole('button', { name: /查看全部档案/ }));
}

describe('EntityStateBlock', () => {
  it('默认只显示现状（动态状态 + 用户字段），档案收起；展开后按分组显示全部启用字段', () => {
    renderBlock({ entity: baseEntity({ fields: [{ field_key: 'favor', label: '好感', type: 'number', update_mode: 'llm_auto', value: 60 }] }) });
    expect(screen.getByText('现状')).toBeInTheDocument();
    expect(screen.getByText('好感')).toBeInTheDocument();
    expect(screen.queryByText('职业')).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: '查看全部档案（4 项）' })).toBeInTheDocument();
    expandProfile();
    expect(screen.getByText('身份')).toBeInTheDocument();
    expect(screen.getByText('职业')).toBeInTheDocument();
    expect(screen.getByText('人格')).toBeInTheDocument();
    expect(screen.getByText('核心性格')).toBeInTheDocument();
    expect(screen.getByText('前海军军官').closest('.we-status-field')).toHaveTextContent('职业');
  });

  it('本轮变化的档案字段单列在「本轮变化」并高亮，现状里变化的行高亮', () => {
    renderBlock({ diffKeys: new Set(['e1:profile.occupation', 'e1:state.位置']) });
    const changes = screen.getByText('本轮变化').closest('.we-state-section');
    expect(changes).toHaveTextContent('职业');
    expect(changes).not.toHaveTextContent('性别');
    expect(screen.getByText('职业').closest('.we-status-field')).toHaveClass('we-status-field--changed');
    expect(screen.getByText('位置').closest('.we-status-field')).toHaveClass('we-status-field--changed');
    expect(screen.getByText('伤势').closest('.we-status-field')).not.toHaveClass('we-status-field--changed');
  });

  it('没有档案变化时不显示「本轮变化」', () => {
    renderBlock();
    expect(screen.queryByText('本轮变化')).not.toBeInTheDocument();
  });

  it('关联角色卡的实体与其他角色一样显示全部档案', () => {
    renderBlock({ entity: baseEntity({ card_id: 'char-1', profile: { outfit: { value: ['黑色风衣'], evidence: '', round: 1 } } }) });
    expect(screen.getByRole('button', { name: '查看全部档案（4 项）' })).toBeInTheDocument();
    expandProfile();
    expect(screen.getByText('职业')).toBeInTheDocument();
    expect(screen.getByText('穿着')).toBeInTheDocument();
    expect(screen.getByText('黑色风衣')).toBeInTheDocument();
  });

  it('现状小节「位置」总排第一，可编辑与删除（清空即删除）', async () => {
    mocks.updateStateEntity.mockResolvedValue({});
    const reload = vi.fn();
    renderBlock({ reload });

    const keys = screen.getAllByText(/位置|伤势/);
    expect(keys[0]).toHaveTextContent('位置');

    fireEvent.click(screen.getByText('旧港仓库'));
    const valueInput = screen.getByDisplayValue('旧港仓库');
    fireEvent.change(valueInput, { target: { value: '' } });
    fireEvent.blur(valueInput);

    await waitFor(() => {
      expect(mocks.updateStateEntity).toHaveBeenCalledWith('s1', 'e1', { dynamic: { 位置: null } });
    });
    expect(reload).toHaveBeenCalled();
  });

  it('传入 userRows 时现状显示这些行、不显示实体自带字段，保存走 onSaveUserRow', async () => {
    const onSaveUserRow = vi.fn().mockResolvedValue();
    renderBlock({
      entity: baseEntity({ fields: [{ field_key: 'favor', label: '好感', type: 'number', update_mode: 'llm_auto', value: 60 }] }),
      userRows: [{ field_key: 'mood', label: '心情', type: 'text', update_mode: 'llm_auto', effective_value_json: '"平静"' }],
      userChangedKeys: new Set(['mood']),
      onSaveUserRow,
    });
    expect(screen.queryByText('好感')).not.toBeInTheDocument();
    expect(screen.getByText('心情').closest('.we-status-field')).toHaveClass('we-status-field--changed');

    fireEvent.click(screen.getByText('平静'));
    const input = screen.getByDisplayValue('平静');
    fireEvent.change(input, { target: { value: '烦躁' } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(onSaveUserRow).toHaveBeenCalledWith('mood', JSON.stringify('烦躁'), undefined);
    });
  });

  it('展开后显示关系派生的所属组织（本实体 —成员→ 组织）与持有物品（物品 —持有者→ 本实体）', () => {
    renderBlock({ relations });
    expandProfile();
    expect(screen.getByText('所属')).toBeInTheDocument();
    expect(screen.getByText('黑潮会')).toBeInTheDocument();
    expect(screen.getByText('持有')).toBeInTheDocument();
    expect(screen.getByText('银戒指')).toBeInTheDocument();
  });

  it('编辑档案字段调用 PATCH profile', async () => {
    mocks.updateStateEntity.mockResolvedValue({});
    const reload = vi.fn();
    renderBlock({ reload });
    expandProfile();

    fireEvent.click(screen.getByText('前海军军官'));
    const occupationInput = screen.getByDisplayValue('前海军军官');
    fireEvent.change(occupationInput, { target: { value: '海关顾问' } });
    fireEvent.blur(occupationInput);

    await waitFor(() => {
      expect(mocks.updateStateEntity).toHaveBeenCalledWith('s1', 'e1', { profile: { occupation: '海关顾问' } });
    });
    expect(reload).toHaveBeenCalled();
  });
});
