import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  importGlobalSettings: vi.fn(async () => ({ mode: 'chat' })),
}));

vi.mock('../../../src/core/api/import-export', () => ({
  downloadGlobalSettings: vi.fn(),
  importGlobalSettings: (...args) => mocks.importGlobalSettings(...args),
  downloadMigration: vi.fn(),
  importMigration: vi.fn(),
  readJsonFile: vi.fn(async () => ({})),
}));
vi.mock('../../../src/core/api/custom-css-snippets', () => ({ refreshCustomCss: vi.fn() }));
vi.mock('../../../src/core/utils/regex-runner', () => ({ invalidateCache: vi.fn(), loadRules: vi.fn(async () => {}) }));

import ImportExportPanel from '../../../src/components/settings/ImportExportPanel.jsx';

describe('ImportExportPanel', () => {
  it('选好设置文件后先确认，取消则不导入，确认才导入', async () => {
    const { container } = render(<ImportExportPanel settingsMode="chat" />);
    const input = container.querySelector('input[accept=".json,.weglobal.json"]');
    const file = new File(['{}'], 'backup.weglobal.json', { type: 'application/json' });

    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText('覆盖对话全局设置？')).toBeInTheDocument();
    fireEvent.click(screen.getByText('取消'));
    expect(mocks.importGlobalSettings).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByText('确认导入'));
    await waitFor(() => expect(mocks.importGlobalSettings).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('导入成功，已覆盖对话全局设置')).toBeInTheDocument();
  });
});
