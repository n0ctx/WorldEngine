import { describe, expect, it, vi } from 'vitest';

import { createModelSectionChangeHandler } from '../../src/core/hooks/settingsConfigState.js';

function createHarness(options, updated = {}) {
  let section = { provider: 'openai', base_url: 'x', model: 'm', has_key: true, temperature: 1 };
  const setSection = vi.fn((update) => { section = update(section); });
  const patchConfig = vi.fn(async () => updated);
  const handle = createModelSectionChangeHandler(patchConfig, setSection, options);
  return { handle, patchConfig, getSection: () => section };
}

describe('createModelSectionChangeHandler', () => {
  it('切换 provider 时按路径提交补丁并用返回值刷新本地', async () => {
    const { handle, patchConfig, getSection } = createHarness(
      { path: ['writing', 'aux_llm'], providerPatch: (value) => ({ provider: value, base_url: '' }), empty: null },
      { writing: { aux_llm: { base_url: 'b', model: 'n', has_key: false } } },
    );

    await handle('provider', 'anthropic');

    expect(patchConfig).toHaveBeenCalledWith({ writing: { aux_llm: { provider: 'anthropic', base_url: '' } } }, { reload: true });
    expect(getSection()).toEqual({ provider: 'anthropic', base_url: 'b', model: 'n', has_key: false, temperature: 1 });
  });

  it('返回值缺字段时用缺省值，清空 provider 回落为缺省值', async () => {
    const { handle, getSection } = createHarness(
      { path: ['writing', 'llm'], providerPatch: () => ({ provider: null }), empty: null, emptyModel: '' },
    );

    await handle('provider', '');

    expect(getSection()).toMatchObject({ provider: null, base_url: null, model: '', has_key: false });
  });

  it('has_key 只改本地，其余字段同时写回后端', async () => {
    const { handle, patchConfig, getSection } = createHarness({ path: ['llm'], providerPatch: vi.fn(), empty: '' });

    await handle('has_key', false);
    expect(patchConfig).not.toHaveBeenCalled();

    await handle('temperature', 0.5);
    expect(patchConfig).toHaveBeenCalledWith({ llm: { temperature: 0.5 } });
    expect(getSection()).toMatchObject({ has_key: false, temperature: 0.5 });
  });
});
