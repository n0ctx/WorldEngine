import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getTableMemory: vi.fn(),
  updateTableMemory: vi.fn(),
}));

vi.mock('../../../core/api/table-memory.js', () => api);

const TableMemoryModal = (await import('../TableMemoryModal.jsx')).default;

const SCHEMA = {
  fieldMaxChars: 60,
  tables: {
    relations: { name: '关系表', columns: ['主体A', '关系类型'] },
    items: { name: '物品表', columns: ['物品'] },
  },
};

function makeTables(rows = []) {
  return {
    version: 1,
    tables: {
      relations: { rows, nextId: rows.length + 1 },
      items: { rows: [], nextId: 1 },
    },
    archive: { relations: [], items: [] },
  };
}

describe('TableMemoryModal', () => {
  beforeEach(() => {
    api.updateTableMemory.mockResolvedValue({ tables: makeTables(), markdown: '' });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('空表也渲染表头', async () => {
    api.getTableMemory.mockResolvedValue({ tables: makeTables([]), markdown: '', schema: SCHEMA });
    render(<TableMemoryModal sessionId="s1" onClose={() => {}} />);
    expect(await screen.findByText('主体A')).toBeInTheDocument();
    expect(screen.getByText('关系类型')).toBeInTheDocument();
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
  });

  it('编辑单元格只改本地、不发请求；保存按钮编辑后才可用', async () => {
    const rows = [{ id: 1, 主体A: '张三', 关系类型: '盟友', 别名: '张老板' }];
    api.getTableMemory.mockResolvedValue({ tables: makeTables(rows), markdown: '', schema: SCHEMA });
    render(<TableMemoryModal sessionId="s1" onClose={() => {}} />);

    const saveBtn = await screen.findByRole('button', { name: '保存' });
    expect(saveBtn).toBeDisabled();

    fireEvent.click(screen.getByText('盟友'));
    const input = screen.getByDisplayValue('盟友');
    fireEvent.change(input, { target: { value: '敌对' } });
    fireEvent.blur(input);

    expect(await screen.findByText('敌对')).toBeInTheDocument();
    expect(api.updateTableMemory).not.toHaveBeenCalled();
    expect(saveBtn).toBeEnabled();
  });

  it('保存传完整对象（version/archive/id/别名 不丢）', async () => {
    const rows = [{ id: 1, 主体A: '张三', 关系类型: '盟友', 别名: '张老板' }];
    api.getTableMemory.mockResolvedValue({ tables: makeTables(rows), markdown: '', schema: SCHEMA });
    const onClose = vi.fn();
    render(<TableMemoryModal sessionId="s1" onClose={onClose} />);

    fireEvent.click(await screen.findByText('盟友'));
    const input = screen.getByDisplayValue('盟友');
    fireEvent.change(input, { target: { value: '敌对' } });
    fireEvent.blur(input);
    await screen.findByText('敌对');

    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(api.updateTableMemory).toHaveBeenCalledTimes(1));
    const [sid, sent] = api.updateTableMemory.mock.calls[0];
    expect(sid).toBe('s1');
    expect(sent.version).toBe(1);
    expect(sent.archive).toBeTruthy();
    expect(sent.tables.relations.rows[0]).toMatchObject({ id: 1, 关系类型: '敌对', 别名: '张老板' });
    expect(sent.tables.relations.nextId).toBe(2);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('删行从本地移除', async () => {
    const rows = [{ id: 1, 主体A: '张三', 关系类型: '盟友', 别名: '' }];
    api.getTableMemory.mockResolvedValue({ tables: makeTables(rows), markdown: '', schema: SCHEMA });
    render(<TableMemoryModal sessionId="s1" onClose={() => {}} />);

    expect(await screen.findByText('张三')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '删除此行' }));
    await waitFor(() => expect(screen.queryByText('张三')).not.toBeInTheDocument());
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
  });
});
