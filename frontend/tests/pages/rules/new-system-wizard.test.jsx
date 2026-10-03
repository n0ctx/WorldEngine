import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const seen = vi.hoisted(() => ({ field: null, entry: null }));

vi.mock('../../../src/components/rules/StateFieldEditor', () => ({
  default: (props) => {
    seen.field = props;
    return <div>字段编辑器</div>;
  },
}));
vi.mock('../../../src/components/rules/EntryEditor', () => ({
  default: (props) => {
    seen.entry = props;
    return <div>条目编辑器</div>;
  },
}));
vi.mock('../../../src/pages/RulesPage/components/DefaultValueMatrix.jsx', () => ({ default: () => <div>默认值矩阵</div> }));

import NewSystemWizard from '../../../src/pages/RulesPage/components/NewSystemWizard.jsx';

describe('新建系统向导', () => {
  it('三步都带步骤条，第二、三步接替上一步的弹窗而不重新入场', async () => {
    const scope = { label: '角色', cnScope: '角色', createFn: vi.fn(async () => ({ field_key: 'hp', label: '体力' })) };
    render(<NewSystemWizard worldId="w1" scope={scope} scopeKey="character" onClose={vi.fn()} onFinish={vi.fn()} />);

    expect(seen.field.dialog.footerStart).toBeTruthy();
    expect(seen.field.dialog.continued).toBeFalsy();

    await act(() => seen.field.onSave({ field_key: 'hp', label: '体力', type: 'number' }));
    expect(screen.getByRole('dialog', { name: '新建系统' })).toBeInTheDocument();

    act(() => screen.getByRole('button', { name: '下一步：配设定条目' }).click());
    expect(seen.entry.dialog).toMatchObject({ continued: true });
    expect(seen.entry.dialog.footerStart).toBeTruthy();
  });
});
