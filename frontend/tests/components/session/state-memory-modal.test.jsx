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
  },
];

const baseData = {
  entities: baseEntities,
  relations: [{ relation_id: 'r1', seq: 1, subject_id: 'e1', predicate: '持有者', object_id: null, object_value: '一把旧钥匙', note: '' }],
  threads: [{ thread_id: 't1', seq: 1, kind: '承诺', participants: ['e1'], content: '三日内归还账本', status: 'active', opened_round: 4 }],
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
      { key: 'age_recorded', label: '年龄', group: '身份', kind: 'age', mutability: 'semi_stable', synonyms: [] },
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

function entityList() {
  return screen.getByLabelText('搜索实体').closest('.we-sm-entity-list');
}

function detailPane() {
  return document.querySelector('.we-sm-entity-detail-pane');
}

describe('StateMemoryModal', () => {
  it('页签带数量：只计在场上的实体与进行中的事项', async () => {
    setup();
    expect(await screen.findByRole('tab', { name: /角色\s*1/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /地点\s*0/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /物品\s*0/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /势力\s*0/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /关系\s*1/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /未了事项\s*1/ })).toBeInTheDocument();
  });

  it('角色、地点分在不同页签，已退场实体单独标注', async () => {
    setup();
    await screen.findByLabelText('搜索实体');
    expect(within(entityList()).getByText('沈彦')).toBeInTheDocument();
    expect(within(entityList()).queryByText('码头')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /地点/ }));
    const retiredItem = within(entityList()).getByText('码头').closest('button');
    expect(within(retiredItem).getByText('已退场')).toBeInTheDocument();
    expect(within(entityList()).queryByText('沈彦')).not.toBeInTheDocument();
  });

  it('玩家与角色同在「角色」页签，玩家排在前面并分组显示', async () => {
    const player = { ...baseEntities[1], entity_id: 'e3', seq: 3, type: 'player', name: '旅人', status: 'active', activeProfileFields: [] };
    setup({ ...baseData, entities: [...baseEntities, player] });
    await screen.findByLabelText('搜索实体');
    const titles = [...entityList().querySelectorAll('.we-sm-group-title')].map((el) => el.firstChild.textContent);
    expect(titles).toEqual(['玩家', '角色']);
    expect(screen.getByRole('tab', { name: /角色\s*2/ })).toBeInTheDocument();
  });

  it('默认选中第一个在场上的实体，右侧直接显示详情', async () => {
    setup();
    await screen.findByLabelText('搜索实体');
    expect(within(detailPane()).getByRole('heading', { name: '沈彦' })).toBeInTheDocument();
    expect(within(detailPane()).getByText('在场')).toBeInTheDocument();
    expect(within(detailPane()).getByText('又名 沈先生')).toBeInTheDocument();
  });

  it('搜索按名字与别名过滤实体，无结果时提示', async () => {
    setup();
    await screen.findByLabelText('搜索实体');
    fireEvent.change(screen.getByLabelText('搜索实体'), { target: { value: '沈先生' } });
    expect(within(entityList()).getByText('沈彦')).toBeInTheDocument();
    expect(within(entityList()).queryByText('码头')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('搜索实体'), { target: { value: '不存在' } });
    expect(screen.getByText('没有匹配的名字')).toBeInTheDocument();
  });

  it('只显示 activeProfileFields 内的字段，编辑档案调用 PATCH', async () => {
    setup();
    await screen.findByLabelText('搜索实体');

    // age_recorded 不在 activeProfileFields 里，不应渲染
    expect(screen.queryByText('年龄')).not.toBeInTheDocument();
    expect(screen.getByText('职业')).toBeInTheDocument();

    fireEvent.click(screen.getByText('前海军军官'));
    const occupationInput = screen.getByDisplayValue('前海军军官');
    fireEvent.change(occupationInput, { target: { value: '海关顾问' } });
    fireEvent.blur(occupationInput);

    await vi.waitFor(() => {
      expect(mocks.updateStateEntity).toHaveBeenCalledWith('s1', 'e1', { profile: { occupation: '海关顾问' } });
    });
  });

  it('档案字段按分组全部显示，年龄只读显示自动计算值', async () => {
    setup({
      ...baseData,
      entities: [{ ...baseEntities[0], activeProfileFields: ['gender', 'occupation', 'social_identity', 'age_recorded'] }],
    });
    await screen.findByLabelText('搜索实体');
    const ageRow = screen.getByText('年龄').closest('.we-status-field');
    expect(within(ageRow).getByText('30 岁')).toBeInTheDocument();
    expect(within(ageRow).queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('现状与用户字段合在「现状」一节，不再单列用户字段', async () => {
    setup();
    await screen.findByLabelText('搜索实体');
    expect(screen.queryByText('用户字段')).not.toBeInTheDocument();
    const section = screen.getByText('现状').closest('.we-state-section');
    expect(within(section).getByText('位置')).toBeInTheDocument();
    expect(within(section).getByText('好感')).toBeInTheDocument();
  });

  it('置顶开关调用 PATCH pinned', async () => {
    setup();
    await screen.findByLabelText('搜索实体');
    const pin = screen.getByRole('button', { name: '置顶' });
    expect(pin).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(pin);
    await vi.waitFor(() => {
      expect(mocks.updateStateEntity).toHaveBeenCalledWith('s1', 'e1', { pinned: true });
    });
  });

  it('删除实体需二次确认后调用 DELETE；已退场实体不再显示删除', async () => {
    setup();
    await screen.findByLabelText('搜索实体');
    fireEvent.click(screen.getByText('删除实体'));
    expect(await screen.findByText('删除该实体？')).toBeInTheDocument();

    fireEvent.click(screen.getByText('删除'));
    await vi.waitFor(() => {
      expect(mocks.deleteStateEntity).toHaveBeenCalledWith('s1', 'e1');
    });

    fireEvent.click(screen.getByRole('tab', { name: /地点/ }));
    fireEvent.click(within(entityList()).getByText('码头'));
    expect(screen.queryByText('删除实体')).not.toBeInTheDocument();
  });

  it('关系页签逐行渲染关系，可删除', async () => {
    setup();
    await screen.findByLabelText('搜索实体');
    fireEvent.click(screen.getByRole('tab', { name: /关系/ }));
    const row = (await screen.findByText('一把旧钥匙')).closest('li');
    expect(within(row).getByText('沈彦')).toBeInTheDocument();
    expect(within(row).getByText('持有者')).toBeInTheDocument();

    fireEvent.click(within(row).getByRole('button', { name: '删除关系' }));
    await vi.waitFor(() => {
      expect(mocks.deleteStateRelation).toHaveBeenCalledWith('s1', 'r1');
    });
  });

  it('添加关系：展开表单，对象选「其他」时填写文字并提交', async () => {
    setup();
    await screen.findByLabelText('搜索实体');
    fireEvent.click(screen.getByRole('tab', { name: /关系/ }));
    fireEvent.click(await screen.findByText('＋ 添加关系'));

    const form = document.querySelector('.we-sm-relation-form');
    const [subjectSelect, objectSelect] = form.querySelectorAll('.we-select-trigger');
    fireEvent.click(subjectSelect);
    fireEvent.mouseDown(within(form.querySelector('.we-select-dropdown')).getByText('沈彦'));
    fireEvent.change(within(form).getByLabelText('关系'), { target: { value: '师父' } });
    fireEvent.click(objectSelect);
    fireEvent.mouseDown(within(form).getByText('其他（手动填写）'));
    fireEvent.change(within(form).getByLabelText('对象文字'), { target: { value: '老船长' } });

    expect(within(form).getByText('将记录：沈彦 —师父→ 老船长')).toBeInTheDocument();
    fireEvent.click(within(form).getByText('添加'));
    await vi.waitFor(() => {
      expect(mocks.createStateRelation).toHaveBeenCalledWith('s1', {
        subject_id: 'e1', predicate: '师父', object_id: undefined, object_value: '老船长',
      });
    });
  });

  it('事项页签显示参与者，已结束事项默认折叠', async () => {
    setup({
      ...baseData,
      threads: [
        ...baseData.threads,
        { thread_id: 't2', seq: 2, kind: '债务', participants: [], content: '欠酒馆十个银币', status: 'resolved', opened_round: 1 },
      ],
    });
    await screen.findByLabelText('搜索实体');
    fireEvent.click(screen.getByRole('tab', { name: /未了事项/ }));

    expect(await screen.findByDisplayValue('三日内归还账本')).toBeInTheDocument();
    expect(screen.getByText(/沈彦 · 第 4 轮起/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue('欠酒馆十个银币')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /已结束 1/ }));
    expect(screen.getByDisplayValue('欠酒馆十个银币')).toBeInTheDocument();
    expect(screen.getByText('第 1 轮起')).toBeInTheDocument();
  });
});
