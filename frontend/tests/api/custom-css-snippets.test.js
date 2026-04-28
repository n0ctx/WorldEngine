import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSnippet,
  deleteSnippet,
  listSnippets,
  refreshCustomCss,
  reorderSnippets,
  updateSnippet,
} from '../../src/api/custom-css-snippets.js';

describe('custom css snippets api', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ([]) });
  });

  it('发送 CRUD 与排序请求', async () => {
    await listSnippets({ mode: 'writing' });
    await createSnippet({ content: '.a{}' });
    await updateSnippet('css-1', { enabled: true });
    await deleteSnippet('css-1');
    await reorderSnippets([{ id: 'css-1', sort_order: 0 }]);

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/custom-css-snippets?mode=writing', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/custom-css-snippets', expect.objectContaining({ method: 'POST' }));
    expect(fetch).toHaveBeenNthCalledWith(3, '/api/custom-css-snippets/css-1', expect.objectContaining({ method: 'PUT' }));
    expect(fetch).toHaveBeenNthCalledWith(4, '/api/custom-css-snippets/css-1', expect.objectContaining({ method: 'DELETE' }));
    expect(fetch).toHaveBeenNthCalledWith(5, '/api/custom-css-snippets/reorder', expect.objectContaining({ method: 'PUT' }));
  });

  it('refreshCustomCss 会拼接启用片段并写入 style 标签，失败时静默', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ([
        { id: '1', enabled: true, content: '.enabled { color: red; }' },
        { id: '2', enabled: false, content: '.disabled { color: blue; }' },
      ]),
    });

    await refreshCustomCss('chat');

    const styleTag = document.getElementById('we-custom-css');
    expect(styleTag).not.toBeNull();
    expect(styleTag.textContent).toContain('.enabled');
    expect(styleTag.textContent).not.toContain('.disabled');

    fetch.mockRejectedValueOnce(new Error('boom'));
    await expect(refreshCustomCss('chat')).resolves.toBeUndefined();
  });
});
