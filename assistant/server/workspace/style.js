// CSS 片段、正则规则。
//
// 后端补齐：CSS 片段 / 正则的默认模式与启用状态、正则 /…/flags 写法拆分与可编译校验、
// "仅当前世界" 转世界 id；片段只允许使用已有 --we-* token。

import { getCustomCssSnippetById, listCustomCssSnippets } from '../../../backend/db/queries/custom-css-snippets.js';
import { getRegexRuleById, listRegexRules } from '../../../backend/db/queries/regex-rules.js';

import { normalizeProposal } from '../normalize-proposal.js';
import { compact, fail, parseFields, requireObjectKeys, requireText } from './common.js';
import { bool, oneOf, text } from './coerce.js';
import { assertSnippetTokens } from './tokens.js';
import { applyStep } from './step.js';

const MODE = oneOf(['chat', 'writing']);
const CSS_SPEC = { name: text, content: text, mode: MODE, enabled: bool };
const REGEX_SPEC = {
  name: text,
  pattern: text,
  replacement: text,
  flags: text,
  scope: oneOf(['display_only', 'ai_output', 'user_input', 'prompt_only']),
  world_only: bool,
  mode: MODE,
  enabled: bool,
};
export const CSS_FIELDS = Object.keys(CSS_SPEC);
export const REGEX_FIELDS = Object.keys(REGEX_SPEC);

function toEnabled(input) {
  if ('enabled' in input) input.enabled = input.enabled ? 1 : 0;
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
  const input = toEnabled(parseFields(data, CSS_SPEC, 'css'));
  if ('content' in input) assertSnippetTokens(requireText(input.content, 'content'));
  return input;
}

export function planCreateCss(data) {
  const changes = prepareCss(data);
  requireText(changes.name, 'name');
  requireText(changes.content, 'content');
  const proposal = normalizeProposal({ type: 'css-snippet', operation: 'create', changes });
  return applyStep(proposal, (snippet) => `已创建 css:${snippet.id}（${snippet.name}）`);
}

export function planUpdateCss(id, data) {
  const changes = prepareCss(data);
  requireObjectKeys(changes, 'css 没有要修改的字段');
  loadCss(id);
  const proposal = normalizeProposal({ type: 'css-snippet', operation: 'update', entityId: id, changes });
  return applyStep(proposal, `已更新 css:${id}`);
}

export function planRemoveCss(id) {
  const snippet = loadCss(id);
  const proposal = normalizeProposal({ type: 'css-snippet', operation: 'delete', entityId: id });
  return applyStep(proposal, `已删除 css:${id}（${snippet.name}）`);
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
  const input = toEnabled(parseFields(data, REGEX_SPEC, 'regex'));
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

export function planCreateRegex(data, worldId) {
  const changes = prepareRegex(data, worldId);
  requireText(changes.name, 'name');
  const proposal = normalizeProposal({ type: 'regex-rule', operation: 'create', changes });
  return applyStep(proposal, (rule) => `已创建 regex:${rule.id}（${rule.name}）`);
}

export function planUpdateRegex(id, data, worldId) {
  const current = loadRegex(id);
  const changes = prepareRegex(data, worldId, current);
  requireObjectKeys(changes, 'regex 没有要修改的字段');
  const proposal = normalizeProposal({ type: 'regex-rule', operation: 'update', entityId: id, changes });
  return applyStep(proposal, `已更新 regex:${id}`);
}

export function planRemoveRegex(id) {
  const rule = loadRegex(id);
  const proposal = normalizeProposal({ type: 'regex-rule', operation: 'delete', entityId: id });
  return applyStep(proposal, `已删除 regex:${id}（${rule.name}）`);
}
