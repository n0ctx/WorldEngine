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
    card_description: null,
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
  { relation_id: 'r2', subject_id: 'e1', predicate: '持有者', object_id: 'e7', object_value: null },
];

describe('EntityStateBlock', () => {
  it('按分组显示已启用且非空的档案字段，immutable 字段带锁形标记，未启用/空字段不显示', () => {
    render(
      <EntityStateBlock
        sessionId="s1"
        entity={baseEntity()}
        schema={schema}
        entities={entities}
        relations={[]}
        reload={vi.fn()}
      />,
    );

    expect(screen.getByText('身份')).toBeInTheDocument();
    expect(screen.getByText('职业')).toBeInTheDocument();
    // core_traits 在 activeProfileFields 里但值为空（profile 没有该字段），不应显示
    expect(screen.queryByText('核心性格')).not.toBeInTheDocument();
    // immutable 字段（性别）带锁形标记：查找带 title 属性的 key（悬停显示证据）
    const genderKey = screen.getByText('性别').closest('.we-status-key');
    expect(genderKey.getAttribute('title')).toContain('他是个男人');
    expect(genderKey.querySelector('svg')).not.toBeNull();
  });

  it('卡片实体的档案组改为只读摘要，「穿着」仍可编辑', async () => {
    mocks.updateStateEntity.mockResolvedValue({});
    render(
      <EntityStateBlock
        sessionId="s1"
        entity={baseEntity({ card_id: 'char-1', card_description: '一位神秘的前军官，行踪不定。', profile: { outfit: { value: ['黑色风衣'], evidence: '', round: 1 } } })}
        schema={schema}
        entities={entities}
        relations={[]}
        reload={vi.fn()}
      />,
    );

    expect(screen.getByText('一位神秘的前军官，行踪不定。')).toBeInTheDocument();
    expect(screen.queryByText('职业')).not.toBeInTheDocument();
    expect(screen.getByText('穿着')).toBeInTheDocument();
    expect(screen.getByText('黑色风衣')).toBeInTheDocument();
  });

  it('现状小节「位置」总排第一，可编辑与删除（清空即删除）', async () => {
    mocks.updateStateEntity.mockResolvedValue({});
    const reload = vi.fn();
    render(
      <EntityStateBlock
        sessionId="s1"
        entity={baseEntity()}
        schema={schema}
        entities={entities}
        relations={[]}
        reload={reload}
      />,
    );

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

  it('所属组织与持有物品从关系派生（本实体为主体），只读显示', () => {
    render(
      <EntityStateBlock
        sessionId="s1"
        entity={baseEntity()}
        schema={schema}
        entities={entities}
        relations={relations}
        reload={vi.fn()}
      />,
    );

    expect(screen.getByText('所属')).toBeInTheDocument();
    expect(screen.getByText('黑潮会')).toBeInTheDocument();
    expect(screen.getByText('持有')).toBeInTheDocument();
    expect(screen.getByText('银戒指')).toBeInTheDocument();
  });

  it('编辑档案字段调用 PATCH profile', async () => {
    mocks.updateStateEntity.mockResolvedValue({});
    const reload = vi.fn();
    render(
      <EntityStateBlock
        sessionId="s1"
        entity={baseEntity()}
        schema={schema}
        entities={entities}
        relations={[]}
        reload={reload}
      />,
    );

    const occupationInput = screen.getByDisplayValue('前海军军官');
    fireEvent.change(occupationInput, { target: { value: '海关顾问' } });
    fireEvent.blur(occupationInput);

    await waitFor(() => {
      expect(mocks.updateStateEntity).toHaveBeenCalledWith('s1', 'e1', { profile: { occupation: '海关顾问' } });
    });
    expect(reload).toHaveBeenCalled();
  });
});
