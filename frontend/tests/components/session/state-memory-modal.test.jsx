import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const baseEntities = [
  {
    entity_id: 'e1',
    seq: 1,
    type: 'character',
    name: '沈彦',
    aliases: ['沈先生'],
    pinned: false,
    card_id: null,
    status: 'active',
    profile: {
      gender: { value: '男', evidence: '他是个男人', round: 3 },
      occupation: { value: '前海军军官', evidence: '曾任海军军官', round: 2 },
      social_identity: { value: ['通缉犯'], evidence: '被通缉', round: 4 },
    },
    dynamic: { 位置: '码头' },
    fields: [{ field_key: 'favor', label: '好感', type: 'number', update_mode: 'llm_auto', value: 60 }],
    age: { age: 30, text: '30 岁' },
    activeProfileFields: ['gender', 'occupation', 'social_identity'],
    card_description: null,
  },
  {
    entity_id: 'e2',
    seq: 2,
    type: 'location',
    name: '码头',
    aliases: [],
    pinned: false,
    card_id: null,
    status: 'retired',
    profile: {},
    dynamic: {},
    fields: [],
    age: null,
    activeProfileFields: ['category', 'description', 'features'],
    card_description: null,
  },
];

const baseData = {
  entities: baseEntities,
  relations: [{ relation_id: 'r1', seq: 1, subject_id: 'e1', predicate: '持有者', object_id: null, object_value: '一把旧钥匙', note: '' }],
  threads: [{ thread_id: 't1', seq: 1, kind: '承诺', participants: ['e1'], content: '三日内归还账本', status: 'active', opened_round: 4 }],
  facts: [],
  world: { time: null, location: null, location_entity_id: null },
  presentIds: ['e1'],
};

const baseSchema = {
  entityTypes: ['character', 'location', 'item', 'faction', 'other', 'player'],
  profileFields: {
    character: [
      { key: 'gender', label: '性别', group: '身份', kind: 'text', mutability: 'immutable', synonyms: [] },
      { key: 'occupation', label: '职业', group: '身份', kind: 'text', mutability: 'semi_stable', synonyms: [] },
      { key: 'social_identity', label: '社会身份', group: '身份', kind: 'list', mutability: 'semi_stable', synonyms: [] },
      { key: 'age_recorded', label: '记录年龄', group: '身份', kind: 'age', mutability: 'semi_stable', synonyms: [] },
    ],
    location: [
      { key: 'category', label: '类别', kind: 'text', mutability: 'semi_stable', synonyms: [] },
      { key: 'description', label: '概述', kind: 'text', mutability: 'semi_stable', synonyms: [] },
      { key: 'features', label: '特征', kind: 'list', mutability: 'semi_stable', synonyms: [] },
    ],
  },
  threadKinds: ['承诺', '任务', '债务', '冲突', '谜团', '威胁', '计划', '目标'],
  exclusivePredicates: ['持有者', '控制者'],
  reservedWorldFieldLabels: [],
  dynamicLocationKey: '位置',
};

const mocks = vi.hoisted(() => ({
  fetchStateMemory: vi.fn(),
  fetchStateMemorySchema: vi.fn(),
  updateStateEntity: vi.fn(),
  updateStateEntityField: vi.fn(),
  deleteStateEntity: vi.fn(),
  createStateRelation: vi.fn(),
  deleteStateRelation: vi.fn(),
  createStateThread: vi.fn(),
  updateStateThread: vi.fn(),
}));

vi.mock('../../../src/core/api/state-memory.js', () => mocks);

import StateMemoryModal from '../../../src/components/session/StateMemoryModal.jsx';

function setup(dataOverride) {
  mocks.fetchStateMemory.mockResolvedValue(dataOverride ?? baseData);
  mocks.fetchStateMemorySchema.mockResolvedValue(baseSchema);
  mocks.updateStateEntity.mockResolvedValue({});
  mocks.updateStateEntityField.mockResolvedValue({});
  mocks.deleteStateEntity.mockResolvedValue({ ok: true });
  mocks.createStateRelation.mockResolvedValue({});
  mocks.deleteStateRelation.mockResolvedValue({ ok: true });
  mocks.createStateThread.mockResolvedValue({});
  mocks.updateStateThread.mockResolvedValue({});
  const onClose = vi.fn();
  render(<StateMemoryModal sessionId="s1" onClose={onClose} />);
  return { onClose };
}

describe('StateMemoryModal', () => {
  it('按类型分组渲染实体列表，已退场实体单独标注', async () => {
    setup();
    expect(await screen.findByText('状态记忆')).toBeInTheDocument();
    expect(screen.getByText('角色')).toBeInTheDocument();
    expect(screen.getByText('地点')).toBeInTheDocument();
    expect(screen.getByText('沈彦')).toBeInTheDocument();
    const retiredItem = screen.getByText('码头').closest('button');
    expect(within(retiredItem).getByText('已退场')).toBeInTheDocument();
  });

  it('搜索按名字与别名过滤实体', async () => {
    setup();
    await screen.findByText('沈彦');
    fireEvent.change(screen.getByLabelText('搜索实体'), { target: { value: '沈先生' } });
    expect(screen.getByText('沈彦')).toBeInTheDocument();
    expect(screen.queryByText('码头')).not.toBeInTheDocument();
  });

  it('选中实体后只显示 activeProfileFields 内的字段，编辑档案调用 PATCH', async () => {
    setup();
    fireEvent.click(await screen.findByText('沈彦'));

    // age_recorded 不在 activeProfileFields 里，不应渲染
    expect(screen.queryByText('记录年龄')).not.toBeInTheDocument();
    expect(screen.getByText('职业')).toBeInTheDocument();

    const occupationInput = screen.getByDisplayValue('前海军军官');
    fireEvent.change(occupationInput, { target: { value: '海关顾问' } });
    fireEvent.blur(occupationInput);

    await vi.waitFor(() => {
      expect(mocks.updateStateEntity).toHaveBeenCalledWith('s1', 'e1', { profile: { occupation: '海关顾问' } });
    });
  });

  it('置顶开关调用 PATCH pinned', async () => {
    setup();
    fireEvent.click(await screen.findByText('沈彦'));
    fireEvent.click(screen.getByLabelText('置顶'));
    await vi.waitFor(() => {
      expect(mocks.updateStateEntity).toHaveBeenCalledWith('s1', 'e1', { pinned: true });
    });
  });

  it('删除实体需二次确认后调用 DELETE', async () => {
    setup();
    fireEvent.click(await screen.findByText('沈彦'));
    fireEvent.click(screen.getByText('删除实体'));
    expect(await screen.findByText('删除该实体？')).toBeInTheDocument();

    fireEvent.click(screen.getByText('删除'));
    await vi.waitFor(() => {
      expect(mocks.deleteStateEntity).toHaveBeenCalledWith('s1', 'e1');
    });
  });

  it('关系与事项页签渲染现有数据', async () => {
    setup();
    await screen.findByText('状态记忆');
    fireEvent.click(screen.getByText('关系'));
    expect(await screen.findByText(/沈彦.*—持有者→.*一把旧钥匙/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('事项'));
    expect(await screen.findByText('三日内归还账本')).toBeInTheDocument();
  });
});
