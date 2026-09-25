/**
 * 提案归一化：校验并归一化原始 LLM 提案，落库见 apply-proposal.js。
 */

import { assertThemeId } from '../../backend/services/themes.js';
import { buildWorldConditionContext, normalizeEntryOps } from './proposal-entry-ops.js';
import { normalizeStateFieldOps, normalizeStateValueOps } from './proposal-state-ops.js';
import {
  VALID_REGEX_SCOPES,
  normalizeObject,
  normalizeString,
  normalizeEntityId,
  normalizeMode,
  normalizeEnabled,
  normalizeNumberOrNull,
  normalizeIntegerOrNull,
  pickAllowed,
  deepOmit,
} from './proposal-values.js';

const PROPOSAL_ALLOWED_OPERATIONS = {
  'world-card': new Set(['create', 'update', 'delete']),
  'character-card': new Set(['create', 'update', 'delete']),
  'persona-card': new Set(['create', 'update']),
  'global-config': new Set(['update']),
  'css-snippet': new Set(['create', 'update', 'delete']),
  'regex-rule': new Set(['create', 'update', 'delete']),
  'theme': new Set(['create', 'update', 'delete']),
};

function normalizeProposal(raw, locked = {}) {
  const type = locked.type || normalizeString(raw?.type);
  if (!type || !PROPOSAL_ALLOWED_OPERATIONS[type]) {
    throw new Error(`提案格式错误：未知的 proposal type：${raw?.type || '(空)'}`);
  }

  const operationCandidate = locked.operation || normalizeString(raw?.operation) || 'update';
  const operation = PROPOSAL_ALLOWED_OPERATIONS[type].has(operationCandidate) ? operationCandidate : null;
  if (!operation) throw new Error(`提案格式错误：${type} 不支持 operation=${operationCandidate}`);

  const proposal = {
    type,
    operation,
    explanation: normalizeString(raw?.explanation) || getDefaultExplanation(type, operation),
  };
  normalizeProposalIdentity(proposal, raw, locked);

  const changes = raw?.changes && typeof raw.changes === 'object' && !Array.isArray(raw.changes) ? raw.changes : {};
  normalizeProposalContent(proposal, raw, changes);
  normalizeProposalMetadata(proposal, raw);
  assertProposalHasChanges(proposal);
  return proposal;
}

function normalizeProposalIdentity(proposal, raw, locked) {
  const { type, operation } = proposal;
  const requiresEntityId = ['world-card', 'character-card', 'persona-card', 'theme'].includes(type)
    || (['css-snippet', 'regex-rule'].includes(type) && operation !== 'create');
  if (!requiresEntityId) return;
  proposal.entityId = normalizeEntityId(locked.entityId ?? raw?.entityId);
  if (type !== 'theme') return;
  if (!proposal.entityId) throw new Error('提案格式错误：theme 必须提供 entityId（主题 id）');
  try {
    assertThemeId(proposal.entityId);
  } catch (err) {
    throw new Error(`提案格式错误：${err.message}`);
  }
}

function normalizeProposalContent(proposal, raw, changes) {
  switch (proposal.type) {
    case 'world-card':
      normalizeWorldProposalContent(proposal, raw, changes);
      break;
    case 'character-card':
      proposal.changes = normalizeCharacterChanges(changes);
      normalizeCardStateOps(proposal, raw);
      break;
    case 'persona-card':
      proposal.changes = normalizePersonaChanges(changes);
      normalizeCardStateOps(proposal, raw);
      break;
    case 'global-config':
      proposal.changes = deepOmit(normalizeObject(changes), ['api_key', 'llm.api_key', 'embedding.api_key']);
      break;
    case 'css-snippet':
      proposal.changes = normalizeCssProposalChanges(changes, proposal.operation);
      break;
    case 'regex-rule':
      proposal.changes = normalizeRegexProposalChanges(changes, proposal.operation);
      break;
    case 'theme':
      proposal.changes = proposal.operation === 'delete' ? {} : normalizeThemeChanges(changes, proposal.operation);
      break;
    default:
      break;
  }
}

function normalizeWorldProposalContent(proposal, raw, changes) {
  proposal.changes = normalizeWorldChanges(changes);
  proposal.stateFieldOps = normalizeStateFieldOps(raw?.stateFieldOps, proposal.type);
  proposal.stateValueOps = normalizeStateValueOps(raw?.stateValueOps, proposal.type);
  const warnings = [];
  proposal.entryOps = normalizeEntryOps(raw?.entryOps, {
    allowTriggerType: true,
    conditionContext: buildWorldConditionContext(proposal.entityId, proposal.stateFieldOps),
    warnings,
  });
  appendWorldProposalWarnings(proposal, changes, warnings);
}

function appendWorldProposalWarnings(proposal, changes, entryWarnings) {
  const allowedKeys = ['name', 'description', 'temperature', 'max_tokens'];
  const disallowedKeys = Object.keys(changes).filter((key) => !allowedKeys.includes(key));
  if (disallowedKeys.length > 0) {
    proposal.explanation += `（注意：世界卡不支持 ${disallowedKeys.join(', ')} 字段，相关内容请通过条目管理）`;
  }
  if (entryWarnings.length > 0) proposal.explanation += `\n⚠️ 条目警告：${entryWarnings.join('；')}`;
}

function normalizeCardStateOps(proposal, raw) {
  proposal.stateFieldOps = normalizeStateFieldOps(raw?.stateFieldOps, proposal.type);
  proposal.stateValueOps = normalizeStateValueOps(raw?.stateValueOps, proposal.type);
}

function normalizeCssProposalChanges(changes, operation) {
  if (operation === 'delete') return {};
  if (operation === 'update') return pickAllowed(changes, ['name', 'content', 'mode', 'enabled']);
  return normalizeCssSnippetChanges(changes);
}

function normalizeRegexProposalChanges(changes, operation) {
  if (operation === 'delete') return {};
  if (operation === 'update') return pickAllowed(changes, ['name', 'pattern', 'replacement', 'flags', 'scope', 'world_id', 'mode', 'enabled']);
  return normalizeRegexRuleChanges(changes);
}

function normalizeProposalMetadata(proposal, raw) {
  if (typeof raw?.worldRef === 'string' && raw.worldRef.trim()) proposal.worldRef = raw.worldRef.trim();
  if (typeof raw?.taskId === 'string' && raw.taskId.trim()) proposal.taskId = raw.taskId.trim();
}

function assertProposalHasChanges(proposal) {
  if (proposal.operation === 'delete' || hasProposalChanges(proposal)) return;
  throw new Error('提案格式错误：提案内容为空，未包含任何变更');
}

function hasProposalChanges(proposal) {
  return Object.keys(proposal.changes || {}).length > 0
    || (Array.isArray(proposal.entryOps) && proposal.entryOps.length > 0)
    || (Array.isArray(proposal.stateFieldOps) && proposal.stateFieldOps.length > 0)
    || (Array.isArray(proposal.stateValueOps) && proposal.stateValueOps.length > 0);
}

function normalizeWorldChanges(changes) {
  const picked = pickAllowed(changes, ['name', 'description', 'temperature', 'max_tokens']);
  const normalized = {};
  if ('name' in picked) normalized.name = String(picked.name ?? '');
  if ('description' in picked) normalized.description = String(picked.description ?? '');
  if ('temperature' in picked) normalized.temperature = normalizeNumberOrNull(picked.temperature);
  if ('max_tokens' in picked) normalized.max_tokens = normalizeIntegerOrNull(picked.max_tokens);
  return normalized;
}

/** 角色卡 / 玩家卡：world_id 规范成实体 id，其余白名单字段一律转字符串 */
function normalizeCardChanges(changes, allowed) {
  const picked = pickAllowed(changes, [...allowed, 'world_id']);
  const normalized = {};
  for (const key of Object.keys(picked)) {
    normalized[key] = key === 'world_id' ? normalizeEntityId(picked[key]) : String(picked[key] ?? '');
  }
  return normalized;
}

function normalizeCharacterChanges(changes) {
  return normalizeCardChanges(changes, ['name', 'description', 'system_prompt', 'post_prompt', 'first_message']);
}

function normalizePersonaChanges(changes) {
  return normalizeCardChanges(changes, ['name', 'description', 'system_prompt']);
}

function normalizeCssSnippetChanges(changes) {
  const picked = pickAllowed(changes, ['name', 'content', 'mode', 'enabled']);
  const content = String(picked.content ?? '').trim();
  if (!content) throw new Error('提案格式错误：css-snippet.changes.content 不能为空');
  return {
    name: normalizeString(picked.name) || '写卡助手生成',
    content: String(picked.content),
    mode: normalizeMode(picked.mode),
    enabled: normalizeEnabled(picked.enabled),
  };
}

function normalizeThemeChanges(changes, operation) {
  const picked = pickAllowed(changes, ['name', 'version', 'author', 'description', 'preview', 'css']);
  const normalized = {};
  if ('name' in picked) normalized.name = String(picked.name ?? '').trim();
  if ('version' in picked) normalized.version = String(picked.version ?? '').trim();
  if ('author' in picked) normalized.author = String(picked.author ?? '');
  if ('description' in picked) normalized.description = String(picked.description ?? '');
  if ('preview' in picked) {
    if (picked.preview && typeof picked.preview === 'object' && !Array.isArray(picked.preview)) {
      normalized.preview = picked.preview;
    } else {
      throw new Error('提案格式错误：theme.changes.preview 必须是对象');
    }
  }
  if ('css' in picked) {
    if (typeof picked.css !== 'string') throw new Error('提案格式错误：theme.changes.css 必须是字符串');
    const trimmed = picked.css.trim();
    if (!trimmed) throw new Error('提案格式错误：theme.changes.css 不能为空');
    normalized.css = picked.css;
  }
  if (operation === 'create') {
    if (!normalized.name) throw new Error('提案格式错误：theme create 必须提供 name');
    if (!normalized.version) throw new Error('提案格式错误：theme create 必须提供 version');
    if (typeof normalized.css !== 'string') throw new Error('提案格式错误：theme create 必须提供 css');
  }
  return normalized;
}

function normalizeRegexRuleChanges(changes) {
  const picked = pickAllowed(changes, ['name', 'pattern', 'replacement', 'flags', 'scope', 'world_id', 'mode', 'enabled']);
  const pattern = String(picked.pattern ?? '').trim();
  if (!pattern) throw new Error('提案格式错误：regex-rule.changes.pattern 不能为空');
  return {
    name: normalizeString(picked.name) || '写卡助手生成',
    pattern: String(picked.pattern),
    replacement: String(picked.replacement ?? ''),
    flags: normalizeString(picked.flags) || 'g',
    scope: VALID_REGEX_SCOPES.has(picked.scope) ? picked.scope : 'display_only',
    world_id: normalizeEntityId(picked.world_id),
    mode: normalizeMode(picked.mode),
    enabled: normalizeEnabled(picked.enabled),
  };
}

function getDefaultExplanation(type, operation) {
  return `已生成 ${type} ${operation} 提案`;
}

export { normalizeProposal, normalizeRegexRuleChanges };
