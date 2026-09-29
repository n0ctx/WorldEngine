import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCharacterProfileDefaults: vi.fn(),
  updateCharacterProfileDefault: vi.fn(),
  getPersonaProfileDefaults: vi.fn(),
  updatePersonaProfileDefault: vi.fn(),
  getCharactersByWorld: vi.fn(),
  listPersonas: vi.fn(),
}));

vi.mock('../../src/core/api/character-state-values.js', () => ({
  getCharacterProfileDefaults: mocks.getCharacterProfileDefaults,
  updateCharacterProfileDefault: mocks.updateCharacterProfileDefault,
}));
vi.mock('../../src/core/api/persona-state-values.js', () => ({
  getPersonaProfileDefaults: mocks.getPersonaProfileDefaults,
  updatePersonaProfileDefault: mocks.updatePersonaProfileDefault,
}));
vi.mock('../../src/core/api/characters.js', () => ({
  getCharactersByWorld: mocks.getCharactersByWorld,
}));
vi.mock('../../src/core/api/personas.js', () => ({
  listPersonas: mocks.listPersonas,
}));

import CardProfileDefaultsDetail from '../../src/pages/RulesPage/components/CardProfileDefaultsDetail.jsx';

describe('CardProfileDefaultsDetail', () => {
  it('角色：按卡列出身份/外貌/人格分组，编辑后调用角色档案默认值接口', async () => {
    mocks.getCharactersByWorld.mockResolvedValue([{ id: 'c1', name: '阿黎' }]);
    mocks.getCharacterProfileDefaults.mockResolvedValue([
      { field_key: 'identity', label: '身份', group: '身份', type: 'text', value_json: JSON.stringify('拾荒者') },
      { field_key: 'hair', label: '发型', group: '外貌', type: 'text', value_json: null },
      { field_key: 'trait', label: '性格', group: '人格', type: 'text', value_json: null },
    ]);
    mocks.updateCharacterProfileDefault.mockResolvedValue({});

    render(<CardProfileDefaultsDetail worldId="w1" scopeKey="character" />);

    expect(await screen.findByText('阿黎')).toBeInTheDocument();
    expect(screen.getAllByText('身份').length).toBeGreaterThan(0);
    expect(screen.getByText('外貌')).toBeInTheDocument();
    expect(screen.getByText('人格')).toBeInTheDocument();
    expect(mocks.getCharacterProfileDefaults).toHaveBeenCalledWith('c1');

    const input = screen.getByDisplayValue('拾荒者');
    fireEvent.change(input, { target: { value: '医生' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mocks.updateCharacterProfileDefault).toHaveBeenCalledWith('c1', 'identity', JSON.stringify('医生'));
    });
  });

  it('玩家：使用 persona 接口加载与保存', async () => {
    mocks.listPersonas.mockResolvedValue([{ id: 'p1', name: '旅人' }]);
    mocks.getPersonaProfileDefaults.mockResolvedValue([
      { field_key: 'identity', label: '身份', group: '身份', type: 'text', value_json: JSON.stringify('学生') },
    ]);
    mocks.updatePersonaProfileDefault.mockResolvedValue({});

    render(<CardProfileDefaultsDetail worldId="w1" scopeKey="persona" />);

    expect(await screen.findByText('旅人')).toBeInTheDocument();
    expect(mocks.listPersonas).toHaveBeenCalledWith('w1');
    expect(mocks.getPersonaProfileDefaults).toHaveBeenCalledWith('p1');

    const input = screen.getByDisplayValue('学生');
    fireEvent.change(input, { target: { value: '佣兵' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mocks.updatePersonaProfileDefault).toHaveBeenCalledWith('p1', 'identity', JSON.stringify('佣兵'));
    });
  });

  it('没有角色时显示空态', async () => {
    mocks.getCharactersByWorld.mockResolvedValue([]);
    render(<CardProfileDefaultsDetail worldId="w1" scopeKey="character" />);
    expect(await screen.findByText('暂无角色')).toBeInTheDocument();
  });
});
