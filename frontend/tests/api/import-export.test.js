import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  downloadGlobalSettings,
  downloadPersonaCard,
  downloadWorldCard,
  exportGlobalSettings,
  importCharacter,
  importGlobalSettings,
  importWorld,
  readJsonFile,
} from '../../src/api/import-export.js';

describe('import export api', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
  });

  it('会发送导入导出请求并带上关键 query 参数', async () => {
    await exportGlobalSettings('writing');
    await importGlobalSettings({ a: 1 });
    await importWorld({ world: { name: '群星海' } });
    await importCharacter('world-1', { character: { name: '阿塔' } });

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/global-settings/export?mode=writing', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/global-settings/import', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/worlds/import', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ world: { name: '群星海' } }),
    }));
    expect(fetch).toHaveBeenNthCalledWith(4, '/api/worlds/world-1/import-character', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ character: { name: '阿塔' } }),
    }));
  });

  it('下载类接口会创建链接并回收 object URL', async () => {
    const createObjectURL = vi.fn(() => 'blob:mock');
    const revokeObjectURL = vi.fn();
    const click = vi.fn();
    const anchor = { click };
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);

    await downloadWorldCard('world-1', 'world.json');
    await downloadPersonaCard('world-1', 'persona.json');
    await downloadGlobalSettings('chat');

    expect(createObjectURL).toHaveBeenCalledTimes(3);
    expect(click).toHaveBeenCalledTimes(3);
    expect(revokeObjectURL).toHaveBeenCalledTimes(3);
  });

  it('readJsonFile 在解析失败时会返回明确错误', async () => {
    const originalReader = global.FileReader;
    class MockReader {
      readAsText() {
        this.onload({ target: { result: '{bad json' } });
      }
    }
    vi.stubGlobal('FileReader', MockReader);

    await expect(readJsonFile(new File(['x'], 'bad.json'))).rejects.toThrow('文件格式错误，无法解析 JSON');

    if (originalReader) {
      vi.stubGlobal('FileReader', originalReader);
    }
  });
});
