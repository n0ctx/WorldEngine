// CSS 片段、正则规则、主题包。
//
// 后端补齐：CSS 片段 / 正则的默认模式与启用状态、正则 /…/flags 写法拆分与可编译校验、
// "仅当前世界" 转世界 id、主题 id 与版本号；主题与片段只允许使用已有 --we-* token。

import { randomUUID } from 'node:crypto';

import { getCustomCssSnippetById, listCustomCssSnippets } from '../../../backend/db/queries/custom-css-snippets.js';
import { getRegexRuleById, listRegexRules } from '../../../backend/db/queries/regex-rules.js';
import { getThemeSnapshot, listThemes } from '../../../backend/services/themes.js';

import { normalizeProposal } from '../normalize-proposal.js';
import { applyProposal } from '../apply-proposal.js';
import { compact, fail, pickKnown, requireObjectKeys, requireText } from './common.js';
import { assertSnippetTokens, assertThemeCss } from './tokens.js';

export const CSS_FIELDS = ['name', 'content', 'mode', 'enabled'];
export const REGEX_FIELDS = ['name', 'pattern', 'replacement', 'flags', 'scope', 'world_only', 'mode', 'enabled'];
export const THEME_FIELDS = ['name', 'description', 'author', 'version', 'css'];
const MODES = ['chat', 'writing'];
const REGEX_SCOPES = ['display_only', 'ai_output', 'user_input', 'prompt_only'];

function assertMode(mode) {
  if (mode !== undefined && !MODES.includes(mode)) fail('mode 只能是 chat / writing');
}

function toEnabled(input) {
  if ('enabled' in input) input.enabled = input.enabled === false ? 0 : 1;
  return input;
}

// ─── CSS 片段 ─────────────────────────────────────────────

export function loadCss(id) {
  const snippet = getCustomCssSnippetById(id);
  if (!snippet) fail(`CSS 片段 css:${id} 不存在；read("css") 查看全部片段`);
  return snippet;
}

export function viewCss(snippet) {
  return compact({
    ref: `css:${snippet.id}`,
    name: snippet.name,
    mode: snippet.mode,
    enabled: Boolean(snippet.enabled),
    content: snippet.content,
  });
}

export function listCss() {
  return listCustomCssSnippets().map((s) => `css:${s.id} ${s.name}（${s.mode}${s.enabled ? '' : '，已停用'}）`);
}

function prepareCss(data) {
  const input = toEnabled(pickKnown(data, CSS_FIELDS, 'css'));
  assertMode(input.mode);
  if ('content' in input) assertSnippetTokens(requireText(input.content, 'content'));
  return input;
}

export async function createCss(data) {
  const changes = prepareCss(data);
  requireText(changes.name, 'name');
  requireText(changes.content, 'content');
  const snippet = await applyProposal(normalizeProposal({ type: 'css-snippet', operation: 'create', changes }));
  return `已创建 css:${snippet.id}（${snippet.name}）`;
}

export async function updateCss(id, data) {
  const changes = prepareCss(data);
  requireObjectKeys(changes, 'css 没有要修改的字段');
  loadCss(id);
  await applyProposal(normalizeProposal({ type: 'css-snippet', operation: 'update', entityId: id, changes }));
  return `已更新 css:${id}`;
}

export async function removeCss(id) {
  const snippet = loadCss(id);
  await applyProposal(normalizeProposal({ type: 'css-snippet', operation: 'delete', entityId: id }));
  return `已删除 css:${id}（${snippet.name}）`;
}

// ─── 正则规则 ─────────────────────────────────────────────

export function loadRegex(id) {
  const rule = getRegexRuleById(id);
  if (!rule) fail(`正则规则 regex:${id} 不存在；read("regex") 查看全部规则`);
  return rule;
}

export function viewRegex(rule) {
  return compact({
    ref: `regex:${rule.id}`,
    name: rule.name,
    pattern: rule.pattern,
    replacement: rule.replacement,
    flags: rule.flags,
    scope: rule.scope,
    world: rule.world_id ? `world:${rule.world_id}` : '全局',
    mode: rule.mode,
    enabled: Boolean(rule.enabled),
  });
}

export function listRegex() {
  return listRegexRules().map((r) => `regex:${r.id} ${r.name}（${r.scope}${r.world_id ? '，仅单个世界' : ''}${r.enabled ? '' : '，已停用'}）`);
}

function prepareRegex(data, worldId, current = null) {
  const input = toEnabled(pickKnown(data, REGEX_FIELDS, 'regex'));
  assertMode(input.mode);
  if (input.scope !== undefined && !REGEX_SCOPES.includes(input.scope)) fail(`scope 只能是 ${REGEX_SCOPES.join(' / ')}`);
  if (!current && !('pattern' in input)) fail('缺少 pattern');
  if ('pattern' in input) {
    const literal = /^\/([\s\S]+)\/([a-z]*)$/.exec(String(input.pattern));
    if (literal) {
      input.pattern = literal[1];
      if (!('flags' in input) && literal[2]) input.flags = literal[2];
    }
    requireText(input.pattern, 'pattern');
  }
  const pattern = input.pattern ?? current?.pattern;
  const flags = input.flags ?? current?.flags ?? 'g';
  try {
    new RegExp(pattern, flags);
  } catch (err) {
    fail(`正则无法编译：${err.message}`);
  }
  const { world_only: worldOnly, ...changes } = input;
  if (worldOnly !== undefined) {
    if (worldOnly && !worldId) fail('world_only=true 需要当前选中世界');
    changes.world_id = worldOnly ? worldId : null;
  }
  return changes;
}

export async function createRegex(data, worldId) {
  const changes = prepareRegex(data, worldId);
  requireText(changes.name, 'name');
  const rule = await applyProposal(normalizeProposal({ type: 'regex-rule', operation: 'create', changes }));
  return `已创建 regex:${rule.id}（${rule.name}）`;
}

export async function updateRegex(id, data, worldId) {
  const current = loadRegex(id);
  const changes = prepareRegex(data, worldId, current);
  requireObjectKeys(changes, 'regex 没有要修改的字段');
  await applyProposal(normalizeProposal({ type: 'regex-rule', operation: 'update', entityId: id, changes }));
  return `已更新 regex:${id}`;
}

export async function removeRegex(id) {
  const rule = loadRegex(id);
  await applyProposal(normalizeProposal({ type: 'regex-rule', operation: 'delete', entityId: id }));
  return `已删除 regex:${id}（${rule.name}）`;
}

// ─── 主题包 ─────────────────────────────────────────────

export function loadTheme(id) {
  try {
    return getThemeSnapshot(id);
  } catch {
    return fail(`主题 theme:${id} 不存在；read("themes") 查看全部主题`);
  }
}

export function viewTheme(theme) {
  return compact({
    ref: `theme:${theme.id}`,
    name: theme.name,
    description: theme.description,
    author: theme.author,
    version: theme.version,
    builtin: theme.builtin ? '内置主题，修改时自动复制为用户主题' : undefined,
    active: listThemes().activeTheme === theme.id ? true : undefined,
    css: theme.css,
  });
}

export function listThemeRefs() {
  const { activeTheme, themes } = listThemes();
  return themes.map((t) => `theme:${t.id} ${t.name}${t.id === activeTheme ? '（当前使用）' : ''}${t.builtin ? '（内置）' : ''}`);
}

function themeIdFrom(name) {
  const existing = new Set(listThemes().themes.map((t) => t.id));
  const slug = String(name).trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/^[^a-z]+/, '');
  const base = slug.length >= 2 ? slug.slice(0, 48) : `theme-${randomUUID().slice(0, 6)}`;
  let id = base;
  for (let n = 2; existing.has(id); n += 1) id = `${base}-${n}`;
  return id;
}

function prepareTheme(data) {
  const input = pickKnown(data, THEME_FIELDS, 'theme');
  if ('css' in input) assertThemeCss(requireText(input.css, 'css'));
  return input;
}

export async function createTheme(data) {
  const changes = prepareTheme(data);
  requireText(changes.name, 'name');
  requireText(changes.css, 'css');
  const id = themeIdFrom(changes.name);
  await applyProposal(normalizeProposal({
    type: 'theme', operation: 'create', entityId: id, changes: { version: '1.0.0', ...changes },
  }));
  return `已创建 theme:${id}（${changes.name}）。是否启用由用户在设置中切换`;
}

export async function updateTheme(id, data) {
  const changes = prepareTheme(data);
  requireObjectKeys(changes, 'theme 没有要修改的字段');
  loadTheme(id);
  await applyProposal(normalizeProposal({ type: 'theme', operation: 'update', entityId: id, changes }));
  return `已更新 theme:${id}`;
}

export async function removeTheme(id) {
  const theme = loadTheme(id);
  await applyProposal(normalizeProposal({ type: 'theme', operation: 'delete', entityId: id }));
  return `已删除 theme:${id}（${theme.name}）`;
}
