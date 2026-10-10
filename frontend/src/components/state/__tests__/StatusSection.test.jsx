import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import StatusSection from '../StatusSection.jsx';

const row = (field_key, label, type, value, extra = {}) => ({
  field_key, label, type, ...extra,
  effective_value_json: value == null ? null : JSON.stringify(value),
});

const ROWS = [
  row('realm', '修为', 'text', '金丹初期'),
  row('progress', '修为进度', 'number', 72, { max_value: 100 }),
  row('stone', '灵石', 'number', 1280),
  row('manual', '功法', 'text', '《紫霄天雷诀》天品：紫霄神雷引、奔雷掣电手、惊鸿雷影步'),
  row('arts', '法诀', 'list', ['紫霄神雷引', '奔雷掣电手']),
  row('sect', '宗门', 'text', null),
  row('pill', '丹药', 'list', []),
];

afterEach(cleanup);

function field(container, key) {
  return container.querySelector(`[data-field-key="${key}"]`);
}

it('角色面板排法：数值做读数格，短值进规格表，长值折成档案条，没填的压成一行', () => {
  const { container } = render(<StatusSection headerless sheetLayout rows={ROWS} onSave={vi.fn()} />);

  expect(field(container, 'progress')).toHaveClass('we-status-field--readout', 'we-status-field--metered');
  expect(field(container, 'progress').querySelector('.we-status-value')).toHaveStyle({ '--status-fill': '0.72' });
  expect(field(container, 'stone')).toHaveClass('we-status-field--readout');
  expect(field(container, 'stone')).not.toHaveClass('we-status-field--metered');
  expect(field(container, 'realm')).toHaveClass('we-status-field--spec');

  // 档案条收起时只露一行预览，列表标出条数
  const arts = screen.getByRole('button', { name: /法诀/ });
  expect(arts).toHaveAttribute('aria-expanded', 'false');
  expect(arts).toHaveTextContent('紫霄神雷引、奔雷掣电手');
  expect(arts).toHaveTextContent('2');
  expect(field(container, 'arts').querySelector('.we-status-tags')).toBeNull();
  fireEvent.click(arts);
  expect(arts).toHaveAttribute('aria-expanded', 'true');
  expect(field(container, 'arts').querySelector('.we-status-tags')).not.toBeNull();

  // 没填的两项收成一行，点开后逐项显示、可以填写
  expect(field(container, 'sect')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '未填写 2 项：宗门、丹药' }));
  expect(field(container, 'sect')).toHaveClass('we-status-field--spec');
  expect(screen.getByRole('button', { name: '收起未填写的 2 项' })).toHaveAttribute('aria-expanded', 'true');
});

it('本轮变化过的长值自动展开，变成空值的字段也不收进未填写', () => {
  const { container } = render(
    <StatusSection headerless sheetLayout rows={ROWS} onSave={vi.fn()} changedKeys={new Set(['manual', 'sect'])} />,
  );
  expect(screen.getByRole('button', { name: /功法/ })).toHaveAttribute('aria-expanded', 'true');
  expect(field(container, 'sect')).not.toBeNull();
  expect(screen.getByRole('button', { name: '未填写 1 项：丹药' })).toBeInTheDocument();
});

it('不用角色面板排法时按原顺序一列排开，不分堆', () => {
  const { container } = render(<StatusSection headerless rows={ROWS} onSave={vi.fn()} />);
  const keys = [...container.querySelectorAll('[data-field-key]')].map((el) => el.dataset.fieldKey);
  expect(keys).toEqual(ROWS.map((r) => r.field_key));
  expect(screen.queryByRole('button', { name: /未填写/ })).toBeNull();
});
