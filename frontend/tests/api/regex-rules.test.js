import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createRegexRule,
  deleteRegexRule,
  listRegexRules,
  reorderRegexRules,
  updateRegexRule,
} from '../../src/api/regex-rules.js';

describe('regex rules api', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
  });

  it('构造查询参数并发送 CRUD / reorder', async () => {
    await listRegexRules({ scope: 'display_only', worldId: 'world-1', mode: 'writing' });
    await createRegexRule({ pattern: 'a' });
    await updateRegexRule('rule-1', { replacement: 'b' });
    await deleteRegexRule('rule-1');
    await reorderRegexRules([{ id: 'rule-1', sort_order: 0 }]);

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/regex-rules?scope=display_only&worldId=world-1&mode=writing', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/regex-rules', expect.objectContaining({ method: 'POST' }));
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/regex-rules/rule-1', expect.objectContaining({ method: 'PUT' }));
    expect(fetch).toHaveBeenNthCalledWith(4, '/api/regex-rules/rule-1', expect.objectContaining({ method: 'DELETE' }));
    expect(fetch).toHaveBeenNthCalledWith(5, '/api/regex-rules/reorder', expect.objectContaining({ method: 'PUT' }));
  });
});
