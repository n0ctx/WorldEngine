import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RulesOverview from '../../../src/pages/RulesPage/components/RulesOverview.jsx';

const fieldsByScope = { world: [{ field_key: 'time' }], character: [{ field_key: 'hp' }, { field_key: 'mood' }], persona: [] };

function sectionOf(title) {
  return within(screen.getByText(title).closest('.we-workshop-section'));
}

describe('RulesOverview：下一轮会发给 AI 的内容', () => {
  it('一直生效按常驻在前排序；其余三类归到满足条件时才发；禁用和没有正文的不发', () => {
    const entries = [
      { id: 'a', title: '临时前提', trigger_type: 'always', token: 1, sort_order: 0, content: '正文' },
      { id: 'b', title: '世界前提', trigger_type: 'always', token: 0, sort_order: 5, content: '正文' },
      { id: 'c', title: '战斗规则', trigger_type: 'keyword', keywords: ['战斗', '开打'], sort_order: 1, content: '正文' },
      { id: 'd', title: '已禁用', trigger_type: 'always', token: 0, enabled: 0, sort_order: 2, content: '正文' },
      { id: 'e', title: '空条目', trigger_type: 'llm', sort_order: 3, content: '' },
    ];
    render(<RulesOverview entries={entries} fieldsByScope={fieldsByScope} hint="提示" />);

    const always = sectionOf('每轮都发');
    expect(always.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['世界前提', '临时前提']);

    const conditional = sectionOf('满足条件时才发');
    expect(conditional.getAllByRole('listitem')).toHaveLength(1);
    expect(conditional.getByText('战斗规则')).toBeInTheDocument();
    expect(conditional.getByText('战斗、开打')).toBeInTheDocument();

    expect(screen.queryByText('已禁用')).not.toBeInTheDocument();
    expect(screen.getByText('另有 2 条已禁用或没有正文，不会发。')).toBeInTheDocument();
    expect(screen.getByText(/世界 1 项 · 角色 2 项 · 玩家 0 项/)).toBeInTheDocument();
  });

  it('没有一直生效的条目时提醒缺少世界前提，不显示条件段', () => {
    render(<RulesOverview entries={[]} fieldsByScope={fieldsByScope} hint="提示" />);
    expect(screen.getByText('还没有「一直生效」的设定条目，AI 不知道这个世界的前提。')).toBeInTheDocument();
    expect(screen.queryByText('满足条件时才发')).not.toBeInTheDocument();
  });
});
