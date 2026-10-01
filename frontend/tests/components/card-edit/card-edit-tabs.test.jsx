import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/components/ui/SectionTabs.jsx', () => ({
  default: ({ sections }) => <div>{sections.map((section) => <div key={section.key}>{section.content}</div>)}</div>,
}));
vi.mock('../../../src/core/utils/logger.js', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import CardEditTabs from '../../../src/components/card-edit/CardEditTabs.jsx';

const basicTab = { key: 'basic', label: '设定', content: <p>设定页</p> };

describe('CardEditTabs', () => {
  it('新建时只有设定页', () => {
    render(<CardEditTabs basicTab={basicTab} stateInit={null} />);
    expect(screen.getByText('设定页')).toBeInTheDocument();
    expect(screen.queryByText('AI 提取状态字段建议')).not.toBeInTheDocument();
  });

  it('状态初始值页按身份 / 外貌 / 人格分组；AI 建议按 profile_key 分别写进档案与状态字段', async () => {
    const stateInit = {
      profileRows: [
        { field_key: 'core_traits', label: '核心性格', group: '人格', type: 'list', value_json: null },
        { field_key: 'gender', label: '性别', group: '身份', type: 'text', value_json: '"男"' },
      ],
      stateFields: [{ field_key: 'hp', label: '体力', type: 'number', default_value_json: null }],
      writeProfile: vi.fn().mockResolvedValue({}),
      writeState: vi.fn().mockResolvedValue({}),
      extract: vi.fn().mockResolvedValue([
        { field_key: 'profile.core_traits', profile_key: 'core_traits', label: '人格·核心性格', type: 'list', current_value_json: null, suggested_value_json: '["沉默"]' },
        { field_key: 'hp', label: '体力', type: 'number', current_value_json: null, suggested_value_json: '80' },
      ]),
      onChanged: vi.fn(),
    };
    render(<CardEditTabs basicTab={basicTab} stateInit={stateInit} />);

    const groupLabels = screen.getAllByText(/^(身份|人格|现状)$/).map((el) => el.textContent);
    expect(groupLabels).toEqual(['身份', '人格', '现状']);

    fireEvent.click(screen.getByText('AI 提取状态字段建议'));
    fireEvent.click(await screen.findByText('写入 2 条'));

    await waitFor(() => expect(stateInit.onChanged).toHaveBeenCalled());
    expect(stateInit.writeProfile).toHaveBeenCalledWith('core_traits', '["沉默"]');
    expect(stateInit.writeState).toHaveBeenCalledWith('hp', '80');
  });
});
