const BASE = '/api/custom-css-snippets';

export async function listSnippets() {
  const res = await fetch(BASE);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function createSnippet(data) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateSnippet(id, patch) {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteSnippet(id) {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
}

export async function reorderSnippets(items) {
  const res = await fetch(`${BASE}/reorder`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/**
 * 拉取所有启用片段，按 sort_order 拼接后写入 <style id="we-custom-css">
 */
export async function refreshCustomCss() {
  try {
    const snippets = await listSnippets();
    const css = snippets
      .filter((s) => s.enabled)
      .map((s) => s.content)
      .join('\n');
    let el = document.getElementById('we-custom-css');
    if (!el) {
      el = document.createElement('style');
      el.id = 'we-custom-css';
      document.head.appendChild(el);
    }
    el.textContent = css;
  } catch {
    // 静默失败，不影响主功能
  }
}
