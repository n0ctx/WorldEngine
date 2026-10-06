/**
 * state-memory-render.js — 状态记忆的相关实体选取与注入文本渲染
 *
 * 不调用模型，只读数据库当前视图。三类用途：
 *   1. selectRelevantEntities：按规则选出与当前轮相关的实体（供 renderStoryState 使用）；
 *   2. renderStoryState：渲染注入主模型的 `<story_state>` 段（受 token 预算约束）；
 *   3. 状态更新调用（下一节点使用）的辅助文本：renderEntityDirectory /
 *      renderEntityDetailsForUpdate / renderEntityProfileText。
 *
 * 对外接口：
 *   selectRelevantEntities(sessionId, { userMessage, lastAssistant }) → [{ entityId, reason }]
 *   renderStoryState(sessionId, { worldId, userMessage, lastAssistant, budget }) → string
 *   renderEntityDirectory(sessionId, budget = STATE_DIRECTORY_BUDGET) → string
 *   renderEntityDetailsForUpdate(sessionId, entityIds, { worldId, mainCharacterEntityId }) → string
 *   renderEntityProfileText(sessionId, entityId, { worldId }) → string
 */

import {
  listCurrentEntities,
  getEntityDetails,
  listCurrentRelations,
  listActiveThreads,
  getCurrentWorldProfile,
  getLatestPresence,
} from '../db/queries/state-memory.js';
import { getEntityStateValues } from '../db/queries/session-entity-state-values.js';
import { getCharacterStateFieldsByWorldId } from '../db/queries/character-state-fields.js';
import { getCharacterById } from '../db/queries/characters.js';
import {
  getProfileFieldDefinitions,
  resolveActiveProfileFields,
  isPlaceholderValue,
  DYNAMIC_LOCATION_KEY,
} from './state-memory-schema.js';
import { currentWorldDate, deriveAge, formatSystemWorldTime } from '../utils/world-date.js';
import { countTokens } from '../utils/token-counter.js';
import { STATE_DIRECTORY_BUDGET, STATE_NAME_MATCH_MIN, STATE_PROFILE_FILL_PER_ROUND, THREAD_NO_DEADLINE } from '../utils/constants.js';
export { renderRelevantThreadsForUpdate } from './state-thread-relevance.js';

const STORY_STATE_HINT = '以下是当前场景相关人物与事物的既定设定和现状。人物的身份、外貌、性格、说话方式必须与此一致；列出不代表必须登场。';
const THREAD_HINT = '在场人物相关的进行中事项，这轮可以推进一步或收束；用户这轮明确在做别的事时顺着用户，不要硬插。';
const NON_CHARACTER_TYPE_LABELS = { location: '地点', item: '物品', faction: '组织', other: '其他' };
const AFFILIATION_PREDICATES = ['成员', '持有者'];
const DEFAULT_STORY_STATE_BUDGET = 3000;

// ============================
// 相关实体选取
// ============================

/**
 * 按优先级选出与当前轮相关的实体（不含 player 与 retired）：
 * 1. 上一轮在场实体；2. 当前地点实体 + 位置指向该地点的角色；
 * 3. 用户消息与上一条 AI 回复中提到名字/别名的实体；4. 置顶实体；
 * 5. 与 1~4 中角色有关的进行中事项参与方，以及这些角色当前持有的物品。
 */
export function selectRelevantEntities(sessionId, { userMessage, lastAssistant } = {}) {
  const entities = listCurrentEntities(sessionId).filter((e) => e.status === 'active' && e.type !== 'player');
  const byId = new Map(entities.map((e) => [e.entity_id, e]));
  const selected = new Map();
  const add = (entityId, reason) => {
    if (!entityId || !byId.has(entityId) || selected.has(entityId)) return;
    selected.set(entityId, reason);
  };

  const presence = getLatestPresence(sessionId);
  (presence ? presence.entity_ids : []).forEach((id) => add(id, 'presence'));

  // 2. 当前地点实体，以及动态状态「位置」指向该地点的角色
  const worldProfile = getCurrentWorldProfile(sessionId);
  if (worldProfile.location_entity_id) add(worldProfile.location_entity_id, 'location');
  const characters = entities.filter((e) => e.type === 'character');
  const characterDetails = getEntityDetails(sessionId, characters.map((e) => e.entity_id));
  characters
    .filter((e) => characterDetails[e.entity_id]?.dynamic?.[DYNAMIC_LOCATION_KEY] === worldProfile.location)
    .forEach((e) => add(e.entity_id, 'location'));

  // 3. 用户消息与上一条 AI 回复中提到名字/别名的实体：候选按从长到短排序，命中后占用文本片段
  const mentionText = `${userMessage ?? ''}\n${lastAssistant ?? ''}`;
  const occupied = [];
  entities
    .flatMap((e) => [e.name, ...JSON.parse(e.aliases_json || '[]')]
      .filter((name) => name && name.length >= STATE_NAME_MATCH_MIN)
      .map((name) => ({ entityId: e.entity_id, text: name })))
    .sort((a, b) => b.text.length - a.text.length)
    .forEach((candidate) => matchMention(mentionText, candidate, occupied, add));

  // 4. 置顶实体
  entities.filter((e) => e.pinned).forEach((e) => add(e.entity_id, 'pinned'));

  // 5. 与 1~4 中角色有关的进行中事项参与方，以及这些角色当前持有的物品
  const characterIds = [...selected.keys()].filter((id) => byId.get(id)?.type === 'character');
  listCurrentRelations(sessionId, characterIds)
    .filter((r) => r.predicate === '持有者' && r.object_id && characterIds.includes(r.object_id))
    .forEach((r) => add(r.subject_id, 'held-item'));
  listActiveThreads(sessionId, characterIds).forEach((thread) => {
    JSON.parse(thread.participants_json || '[]').forEach((participantId) => add(participantId, 'thread'));
  });

  return [...selected.entries()].map(([entityId, reason]) => ({ entityId, reason }));
}

/** 按从长到短的候选顺序匹配一次：命中后占用该文本片段，不再被更短的名字重复匹配。 */
function matchMention(text, { entityId, text: name }, occupied, add) {
  let idx = text.indexOf(name);
  while (idx !== -1) {
    const end = idx + name.length;
    if (!occupied.some(([s, e]) => idx < e && end > s)) {
      occupied.push([idx, end]);
      add(entityId, 'mention');
      return;
    }
    idx = text.indexOf(name, idx + 1);
  }
}

// ============================
// 通用取值辅助
// ============================

function decodeProfileValue(field) {
  if (!field) return null;
  try {
    return JSON.parse(field.value_json);
  } catch {
    return field.value_json;
  }
}

function formatRuntimeValue(raw) {
  let value = raw;
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw); } catch { value = raw; }
  }
  if (Array.isArray(value)) return value.join('、');
  if (value && typeof value === 'object') return Object.entries(value).map(([k, v]) => `${k}:${v}`).join('，');
  return String(value);
}

/** 某世界（或未指定世界时全量）某实体类型当前启用的档案字段 key 集合。 */
function resolveActiveKeySet(worldId, type) {
  const keys = worldId ? resolveActiveProfileFields(worldId, type) : getProfileFieldDefinitions(type).map((f) => f.key);
  return new Set(keys);
}

/** 该世界 nearby_enabled=1 的角色字段；未指定世界时为空。 */
function resolveWorldCharacterFields(worldId) {
  return worldId ? getCharacterStateFieldsByWorldId(worldId).filter((f) => f.nearby_enabled) : [];
}

function activeProfileKeysFactory(worldId) {
  const cache = new Map();
  return (type) => {
    if (!cache.has(type)) cache.set(type, resolveActiveKeySet(worldId, type));
    return cache.get(type);
  };
}

// ============================
// 档案字段 → 展示片段
// ============================

/** 该档案字段停用时返回 null，否则解码出原始值（未必是数组）。 */
function pickActiveField(profile, activeKeys, key) {
  return activeKeys.has(key) ? decodeProfileValue(profile[key]) : null;
}

/** 同上，但只在值是非空数组时返回，否则 null（用于 list 类字段）。 */
function pickActiveList(profile, activeKeys, key) {
  const value = pickActiveField(profile, activeKeys, key);
  return Array.isArray(value) && value.length ? value : null;
}

function buildIdentityParts(profile, activeKeys, worldDate) {
  const gender = pickActiveField(profile, activeKeys, 'gender');
  const species = pickActiveField(profile, activeKeys, 'species');
  const occupation = pickActiveField(profile, activeKeys, 'occupation');
  const origin = pickActiveField(profile, activeKeys, 'origin');
  const socialIdentity = pickActiveList(profile, activeKeys, 'social_identity');
  const birthDate = pickActiveField(profile, activeKeys, 'birth_date');
  const ageRecorded = pickActiveField(profile, activeKeys, 'age_recorded');
  const ageResult = deriveAge({ birth_date: birthDate || undefined, age_recorded: ageRecorded || undefined }, worldDate);
  const core = [gender, ageResult ? ageResult.text : '', species, occupation].filter(Boolean).join('，');
  return {
    core,
    origin: origin ? `出身${origin}` : '',
    social: socialIdentity ? socialIdentity.join('、') : '',
  };
}

function buildAppearanceParts(profile, activeKeys) {
  const attractiveness = pickActiveField(profile, activeKeys, 'attractiveness');
  const bits = ['height', 'weight', 'hair', 'eyes']
    .map((key) => pickActiveField(profile, activeKeys, key))
    .filter(Boolean);
  const features = pickActiveList(profile, activeKeys, 'appearance_features');
  const body = pickActiveList(profile, activeKeys, 'body_features');
  return {
    attractiveness: attractiveness ? `颜值：${attractiveness}` : '',
    core: bits.join('，'),
    features: features ? `外貌特征：${features.join('、')}` : '',
    body: body ? `身材特征：${body.join('、')}` : '',
  };
}

function buildOutfitText(profile, activeKeys) {
  const outfit = pickActiveList(profile, activeKeys, 'outfit');
  return outfit ? outfit.join('、') : '';
}

function buildPersonalityParts(profile, activeKeys) {
  const traits = pickActiveList(profile, activeKeys, 'core_traits');
  const habits = pickActiveList(profile, activeKeys, 'behavioral_patterns');
  const speech = pickActiveList(profile, activeKeys, 'speech_style');
  return {
    traits: traits ? traits.join('、') : '',
    habits: habits ? habits.join('、') : '',
    speech: speech ? speech.join('、') : '',
  };
}

function buildBackgroundText(profile, activeKeys) {
  const background = pickActiveList(profile, activeKeys, 'background');
  return background ? background.join('；') : '';
}

/** relations 中 matchField===matchValue 且谓词命中的另一侧实体名字列表。 */
function buildAffiliationText(entityId, relations, nameOf) {
  const memberOf = relations
    .filter((r) => r.subject_id === entityId && r.predicate === '成员' && r.object_id)
    .map((r) => nameOf(r.object_id))
    .filter(Boolean);
  const held = relations
    .filter((r) => r.object_id === entityId && r.predicate === '持有者' && r.subject_id)
    .map((r) => nameOf(r.subject_id))
    .filter(Boolean);
  const parts = [];
  if (memberOf.length) parts.push(`所属：${memberOf.join('、')}（成员）`);
  if (held.length) parts.push(`持有：${held.join('、')}`);
  return parts.join('｜');
}

function buildStatusText(dynamic) {
  const entries = Object.entries(dynamic || {});
  if (entries.length === 0) return '';
  entries.sort((a, b) => {
    if (a[0] === DYNAMIC_LOCATION_KEY) return -1;
    if (b[0] === DYNAMIC_LOCATION_KEY) return 1;
    return 0;
  });
  return entries.map(([k, v]) => `${k}=${v}`).join('；');
}

function buildFieldsText(entityValues, userFields) {
  const bits = [];
  for (const field of userFields) {
    const source = entityValues[field.field_key] ?? field.default_value;
    if (source == null || source === '') continue;
    bits.push(`${field.label}=${formatRuntimeValue(source)}`);
  }
  return bits.join('；');
}

function buildSimpleEntityBlock(entity, details) {
  const activeKeys = new Set(getProfileFieldDefinitions(entity.type).map((f) => f.key));
  const profile = details.profile || {};
  const description = activeKeys.has('description') ? decodeProfileValue(profile.description) : null;
  const status = buildStatusText(details.dynamic);
  const label = NON_CHARACTER_TYPE_LABELS[entity.type] ?? entity.type;
  const bits = [];
  if (description) bits.push(`概述：${description}`);
  if (status) bits.push(`现状：${status}`);
  const header = `【${entity.name}】${label}`;
  return bits.length ? `${header}｜${bits.join('｜')}` : header;
}

function buildCharacterHeader(entity, presenceIds) {
  const aliases = JSON.parse(entity.aliases_json || '[]');
  const bits = [];
  if (aliases.length) bits.push(`别名：${aliases.join('、')}`);
  if (presenceIds.has(entity.entity_id)) bits.push('在场');
  return bits.length ? `【${entity.name}】${bits.join('｜')}` : `【${entity.name}】`;
}

// ============================
// story_state：角色区块（带预算裁剪）
// ============================

function makeFragment(bucket, state, rawText, applyFn) {
  return {
    bucket,
    costFn: () => (state._headerCharged ? 0 : countTokens(state.header)) + countTokens(rawText),
    apply: () => {
      state._headerCharged = true;
      applyFn();
    },
  };
}

/** 无 header 概念的简单片段（整块实体行、关系行、事项行）：按 text 自身 token 数计费。 */
function makeSimpleFragment(bucket, text, apply) {
  return { bucket, costFn: () => countTokens(text), apply };
}

/** text 非空时才生成片段，避免调用方逐个写 if 判断。 */
function addOptionalFragment(fragments, bucket, state, text, setter) {
  if (!text) return;
  fragments.push(makeFragment(bucket, state, text, setter));
}

/** 批量注册可选片段：entries 为 [text, state 字段名] 数组，命中时把 text 写进 state[key]。 */
function addOptionalFragments(fragments, bucket, state, entries) {
  for (const [text, key] of entries) {
    addOptionalFragment(fragments, bucket, state, text, () => { state[key] = text; });
  }
}

/** 档案相关片段：按身份/外貌/性格/经历拆成多条可裁剪片段。 */
function buildProfileFragments(entity, ctx, state, bucket, fragments) {
  const details = ctx.details[entity.entity_id] || { profile: {}, dynamic: {} };
  const activeKeys = ctx.activeProfileKeys(entity.type);
  const requiredParts = [];

  const identity = buildIdentityParts(details.profile, activeKeys, ctx.worldDate);
  state.identityCore = identity.core;
  if (identity.core) requiredParts.push(identity.core);
  addOptionalFragments(fragments, bucket, state, [
    [identity.origin, 'identityOrigin'],
    [identity.social, 'identitySocial'],
  ]);

  const appearance = buildAppearanceParts(details.profile, activeKeys);
  // 颜值锁定了角色的长相基调，和身份核心一样不随预算裁掉
  state.appearanceAttractiveness = appearance.attractiveness;
  if (appearance.attractiveness) requiredParts.push(appearance.attractiveness);
  addOptionalFragments(fragments, bucket, state, [
    [appearance.core, 'appearanceCore'],
    [appearance.features, 'appearanceFeatures'],
    [appearance.body, 'appearanceBody'],
  ]);

  const personality = buildPersonalityParts(details.profile, activeKeys);
  state.speechText = personality.speech;
  if (personality.speech) requiredParts.push(personality.speech);
  addOptionalFragments(fragments, bucket, state, [
    [personality.traits, 'traitsText'],
    [personality.habits, 'habitsText'],
  ]);

  const background = buildBackgroundText(details.profile, activeKeys);
  addOptionalFragment(fragments, bucket, state, background, () => { state.backgroundText = background; });

  return requiredParts;
}

/** 穿着、所属/持有、现状、用户字段。 */
function buildCommonFragments(entity, ctx, state, bucket, fragments) {
  const details = ctx.details[entity.entity_id] || { profile: {}, dynamic: {} };
  const activeKeys = ctx.activeProfileKeys(entity.type);

  const outfit = buildOutfitText(details.profile, activeKeys);
  addOptionalFragment(fragments, bucket, state, outfit, () => { state.outfitText = outfit; });

  const relationsForEntity = ctx.relations.filter((r) => r.subject_id === entity.entity_id || r.object_id === entity.entity_id);
  const affiliation = buildAffiliationText(entity.entity_id, relationsForEntity, ctx.nameOf);
  addOptionalFragment(fragments, bucket, state, affiliation, () => { state.affiliationText = affiliation; });

  const status = buildStatusText(details.dynamic);
  addOptionalFragment(fragments, 3, state, status, () => { state.statusText = status; });

  const fieldsText = buildFieldsText(ctx.fieldValues[entity.entity_id] || {}, ctx.userFields);
  addOptionalFragment(fragments, 3, state, fieldsText, () => { state.fieldsText = fieldsText; });
}

/** 角色区块的初始状态：所在优先级桶（在场→1，否则→2）与空白 state/fragments。 */
function initCharacterState(entity, ctx) {
  const bucket = ctx.presenceIds.has(entity.entity_id) ? 1 : 2;
  const state = { header: buildCharacterHeader(entity, ctx.presenceIds), _headerCharged: false };
  return { bucket, state, fragments: [] };
}

function buildCharacterState(entity, ctx) {
  const { bucket, state, fragments } = initCharacterState(entity, ctx);
  const requiredParts = buildProfileFragments(entity, ctx, state, bucket, fragments);
  buildCommonFragments(entity, ctx, state, bucket, fragments);
  return { state, requiredText: requiredParts.join('\n'), fragments };
}

function finalizeCharacterBlock(state) {
  const lines = [];

  const identityBits = [state.identityCore, state.identityOrigin].filter(Boolean);
  let identityLine = identityBits.length ? `身份：${identityBits.join('，')}` : '';
  if (state.identitySocial) {
    identityLine = identityLine ? `${identityLine}；社会身份：${state.identitySocial}` : `社会身份：${state.identitySocial}`;
  }
  if (identityLine) lines.push(identityLine);

  const appearanceBits = [
    state.appearanceAttractiveness, state.appearanceCore, state.appearanceFeatures, state.appearanceBody,
  ].filter(Boolean);
  if (appearanceBits.length) lines.push(`外貌：${appearanceBits.join('；')}`);
  if (state.outfitText) lines.push(`穿着：${state.outfitText}`);

  const personalityBits = [
    state.traitsText ? `性格：${state.traitsText}` : '',
    state.habitsText ? `习惯：${state.habitsText}` : '',
    state.speechText ? `说话：${state.speechText}` : '',
  ].filter(Boolean);
  if (personalityBits.length) lines.push(personalityBits.join('；'));

  if (state.backgroundText) lines.push(`经历：${state.backgroundText}`);
  if (state.affiliationText) lines.push(state.affiliationText);
  if (state.statusText) lines.push(`现状：${state.statusText}`);
  if (state.fieldsText) lines.push(`字段：${state.fieldsText}`);

  if (lines.length === 0) return '';
  return [state.header, ...lines].join('\n');
}

// ============================
// story_state：关系 / 事项 / 世界时间地点 / 玩家行
// ============================

function buildRelationLines(relations, nameOf) {
  return relations
    .filter((r) => !AFFILIATION_PREDICATES.includes(r.predicate))
    .map((r) => {
      const subject = nameOf(r.subject_id);
      const object = r.object_id ? nameOf(r.object_id) : (r.object_value ?? '');
      if (!subject || !object) return null;
      return `关系：${subject} —${r.predicate}→ ${object}`;
    })
    .filter(Boolean);
}

function buildThreadLines(threads, nameOf) {
  return threads.map((t) => {
    const participants = JSON.parse(t.participants_json || '[]').map(nameOf).filter(Boolean);
    const deadline = t.deadline && t.deadline !== THREAD_NO_DEADLINE ? `，期限 ${t.deadline}` : '';
    return `进行中：［${t.kind}］${t.content}（${participants.join('、')}，第 ${t.opened_round} 轮起${deadline}）`;
  });
}

function buildWorldHeaderText(worldProfile) {
  const bits = [];
  if (worldProfile.time) bits.push(`时间：${worldProfile.time}`);
  if (worldProfile.location) bits.push(`地点：${worldProfile.location}`);
  return bits.join('｜');
}

/** 当前全部实体（含 retired）及按 entityId 查名字的索引，供渲染函数共用。 */
function buildEntityIndex(sessionId) {
  const allEntities = listCurrentEntities(sessionId);
  const byId = new Map(allEntities.map((e) => [e.entity_id, e]));
  return { allEntities, byId, nameOf: (id) => byId.get(id)?.name ?? '' };
}

/**
 * 玩家行（位置、穿着）：不受选取规则影响、不参与预算裁剪，固定跟在世界时间地点之后。
 * 世界里有同义玩家字段（导致 outfit 停用）时不输出穿着。
 */
function buildPlayerLine(sessionId, worldId, player) {
  if (!player) return '';
  const detail = getEntityDetails(sessionId, [player.entity_id])[player.entity_id];
  const location = detail?.dynamic?.[DYNAMIC_LOCATION_KEY];
  const outfit = buildOutfitText(detail?.profile || {}, resolveActiveKeySet(worldId, 'player'));
  const bits = [location ? `位置：${location}` : '', outfit ? `穿着：${outfit}` : ''].filter(Boolean);
  return bits.length ? `【${player.name}】${bits.join('｜')}` : '';
}

function buildRenderContext(sessionId, { worldId, selectedIds, worldProfile, nameOf }) {
  const details = getEntityDetails(sessionId, selectedIds);
  const relations = listCurrentRelations(sessionId, selectedIds);
  const threads = listActiveThreads(sessionId, selectedIds);
  const presence = getLatestPresence(sessionId);
  const presenceIds = new Set(presence ? presence.entity_ids : []);
  const fieldValues = getEntityStateValues(sessionId, selectedIds);
  const userFields = resolveWorldCharacterFields(worldId);
  const worldDate = currentWorldDate(worldProfile.time);
  return {
    details, relations, threads, presenceIds, fieldValues, userFields, worldDate, nameOf,
    activeProfileKeys: activeProfileKeysFactory(worldId),
  };
}

/**
 * 渲染注入主模型的 `<story_state>` 段。世界时间/地点/玩家位置与穿着不受预算裁剪；
 * 其余内容按优先级放入 budget（token 数）以内，超出时从末尾裁掉；角色的身份组核心字段
 * （性别/年龄/种族/职业）和说话方式永远保留。无任何内容时返回空串。
 */
export function renderStoryState(sessionId, opts = {}) {
  const { worldId, userMessage, lastAssistant, budget = DEFAULT_STORY_STATE_BUDGET } = opts;
  const worldProfile = getCurrentWorldProfile(sessionId);
  const headerText = buildWorldHeaderText(worldProfile);

  const { allEntities, byId, nameOf } = buildEntityIndex(sessionId);
  const activePlayer = allEntities.find((e) => e.type === 'player' && e.status === 'active') ?? null;
  const playerLine = buildPlayerLine(sessionId, worldId, activePlayer);

  const selection = selectRelevantEntities(sessionId, { userMessage, lastAssistant });
  const selectedIds = selection.map((s) => s.entityId).filter((id) => byId.has(id) && byId.get(id).type !== 'player');
  const ctx = buildRenderContext(sessionId, { worldId, selectedIds, worldProfile, nameOf });

  const entityOutput = new Map();
  const characterStates = [];
  const fragments = [];
  const resultRelations = [];
  const resultThreads = [];
  let used = 0;

  selectedIds.forEach((entityId) => {
    const entity = byId.get(entityId);
    if (entity.type !== 'character') {
      const details = ctx.details[entityId] || { profile: {}, dynamic: {} };
      const block = buildSimpleEntityBlock(entity, details);
      fragments.push(makeSimpleFragment(2, block, () => entityOutput.set(entityId, block)));
      return;
    }
    const built = buildCharacterState(entity, ctx);
    characterStates.push({ entityId, built });
    if (built.requiredText) {
      used += countTokens(built.state.header) + countTokens(built.requiredText);
      built.state._headerCharged = true;
    }
    fragments.push(...built.fragments);
  });

  buildRelationLines(ctx.relations, nameOf)
    .forEach((line) => fragments.push(makeSimpleFragment(4, line, () => resultRelations.push(line))));
  buildThreadLines(ctx.threads, nameOf)
    .forEach((line) => fragments.push(makeSimpleFragment(5, line, () => resultThreads.push(line))));

  fragments.sort((a, b) => a.bucket - b.bucket);
  for (const fragment of fragments) {
    const cost = fragment.costFn();
    if (used + cost > budget) break;
    used += cost;
    fragment.apply();
  }

  characterStates.forEach(({ entityId, built }) => {
    const text = finalizeCharacterBlock(built.state);
    if (text) entityOutput.set(entityId, text);
  });

  const entityTexts = selectedIds.map((id) => entityOutput.get(id)).filter(Boolean);
  const body = [headerText, playerLine, ...entityTexts, ...resultRelations, ...resultThreads]
    .filter(Boolean).join('\n');
  const hint = resultThreads.length ? `${STORY_STATE_HINT}${THREAD_HINT}` : STORY_STATE_HINT;
  return body ? `<story_state hint="${hint}">\n${body}\n</story_state>` : '';
}

// ============================
// 状态更新调用辅助文本
// ============================

/** 实体目录：e<seq>｜类型｜名字｜别名，全部当前 active 实体（含 player），预算内从新到旧截取后按 seq 输出。 */
export function renderEntityDirectory(sessionId, budget = STATE_DIRECTORY_BUDGET) {
  const entities = listCurrentEntities(sessionId).filter((e) => e.status === 'active');
  const sortedNewFirst = [...entities].sort((a, b) => b.seq - a.seq);
  const kept = [];
  let used = 0;
  for (const e of sortedNewFirst) {
    const aliases = JSON.parse(e.aliases_json || '[]').join('、');
    const line = `e${e.seq}｜${e.type}｜${e.name}｜${aliases}`;
    const cost = countTokens(line);
    if (used + cost > budget) break;
    used += cost;
    kept.push({ seq: e.seq, line });
  }
  kept.sort((a, b) => a.seq - b.seq);
  return kept.map((k) => k.line).join('\n');
}

/** 存储的 JSON 取值是否为空：null / 空串 / 空数组 /「未知」「无」这类占位值；解析不了的原样按文本判断。 */
function isEmptyStoredValue(raw) {
  if (raw == null) return true;
  let value;
  try { value = JSON.parse(raw); } catch { value = raw; }
  return Array.isArray(value) ? value.length === 0 : isPlaceholderValue(value);
}

/** 关联角色卡的实体附上卡片简介，补档案时以卡为准 */
function cardNote(entity) {
  const description = entity.card_id ? getCharacterById(entity.card_id)?.description?.trim() : '';
  return description ? `角色卡：${description}` : null;
}

function isPerson(entity) {
  return entity.type === 'player' || entity.type === 'character';
}

/** 状态更新用的世界当前时间：故事时间未设置时按系统时间，并注明。 */
export function renderWorldTimeForUpdate(sessionId) {
  return getCurrentWorldProfile(sessionId).time || `${formatSystemWorldTime()}（故事时间未设置，暂按系统时间）`;
}

/**
 * 有空缺、本轮需要补全的实体：text 每行 e<seq>｜名字｜缺档案：key、…｜缺字段：key、…｜缺现状：位置｜角色卡：简介，
 * entityIds 供调用方把这些实体的详情一并交给 AI（未出场的实体也要按已有信息补）。
 * 不含已退场实体；与本轮相关的实体优先，其余按编号，人物与事物每轮各最多 STATE_PROFILE_FILL_PER_ROUND 个。
 */
export function renderProfileGapsForUpdate(sessionId, { worldId, priorityIds, mainCharacterEntityId } = {}) {
  const candidates = listCurrentEntities(sessionId).filter((e) => e.status === 'active');
  const ids = candidates.map((e) => e.entity_id);
  const details = getEntityDetails(sessionId, ids);
  const fieldValues = getEntityStateValues(sessionId, ids);
  const userFields = resolveWorldCharacterFields(worldId).filter((f) => f.update_mode === 'llm_auto');
  const activeKeys = activeProfileKeysFactory(worldId);
  const priority = priorityIds ?? new Set();
  const taken = { person: 0, thing: 0 };
  const gaps = candidates
    .map((entity) => {
      const { profile = {}, dynamic = {} } = details[entity.entity_id] ?? {};
      const values = fieldValues[entity.entity_id] ?? {};
      // 年龄按出生日期自动计算，不算缺
      const profileKeys = getProfileFieldDefinitions(entity.type)
        .filter((def) => def.kind !== 'age' && activeKeys(entity.type).has(def.key))
        .filter((def) => isEmptyStoredValue(profile[def.key]?.value_json))
        .map((def) => def.key);
      // 只查 NPC 角色：主角色的字段走 char_N
      const fieldKeys = entity.type === 'character' && entity.entity_id !== mainCharacterEntityId
        ? userFields.filter((field) => isEmptyStoredValue(values[field.field_key] ?? field.default_value)).map((field) => field.field_key)
        : [];
      // 玩家和角色都要有位置
      const dynamicKeys = isPerson(entity) && !dynamic[DYNAMIC_LOCATION_KEY] ? [DYNAMIC_LOCATION_KEY] : [];
      return { entity, profileKeys, fieldKeys, dynamicKeys };
    })
    .filter(({ profileKeys, fieldKeys, dynamicKeys }) => profileKeys.length + fieldKeys.length + dynamicKeys.length > 0)
    .sort((a, b) => Number(priority.has(b.entity.entity_id)) - Number(priority.has(a.entity.entity_id)) || a.entity.seq - b.entity.seq)
    // 人物（玩家 / 角色）与事物（地点 / 物品 / 势力 / 其他）各占一份名额，事物不会被角色挤掉
    .filter((gap) => {
      const kind = isPerson(gap.entity) ? 'person' : 'thing';
      taken[kind] += 1;
      return taken[kind] <= STATE_PROFILE_FILL_PER_ROUND;
    });
  return {
    entityIds: gaps.map(({ entity }) => entity.entity_id),
    text: gaps.map(({ entity, profileKeys, fieldKeys, dynamicKeys }) => [
      `e${entity.seq}｜${entity.name}`,
      profileKeys.length ? `缺档案：${profileKeys.join('、')}` : null,
      fieldKeys.length ? `缺字段：${fieldKeys.join('、')}` : null,
      dynamicKeys.length ? `缺现状：${dynamicKeys.join('、')}` : null,
      profileKeys.length ? cardNote(entity) : null,
    ].filter(Boolean).join('｜')).join('\n'),
  };
}

function formatProfileValueForModel(field, def) {
  const value = decodeProfileValue(field);
  if (def.kind === 'list') return Array.isArray(value) ? value.join('、') : String(value ?? '');
  if (def.kind === 'age') {
    if (!value) return '';
    const bits = [`${value.age}岁`];
    if (value.as_of_date) bits.push(`记于${value.as_of_date}`);
    else bits.push(`第${value.as_of_round}轮`);
    return bits.join('，');
  }
  return String(value ?? '');
}

function renderEntityDetailBlock(entity, ctx) {
  const aliases = JSON.parse(entity.aliases_json || '[]').join('、');
  const lines = [`e${entity.seq}｜${entity.type}｜${entity.name}｜${aliases}`];
  const detail = ctx.details[entity.entity_id] || { profile: {}, dynamic: {} };

  const activeKeys = ctx.activeKeysFn(entity.type);
  const profileLine = getProfileFieldDefinitions(entity.type)
    .filter((def) => activeKeys.has(def.key) && detail.profile[def.key])
    .map((def) => `${def.key}=${formatProfileValueForModel(detail.profile[def.key], def)}（${def.mutability}）`)
    .join('；');
  if (profileLine) lines.push(`档案：${profileLine}`);

  const status = buildStatusText(detail.dynamic);
  if (status) lines.push(`现状：${status}`);

  if (entity.type === 'character') {
    const fieldsText = buildFieldsText(ctx.fieldValues[entity.entity_id] || {}, ctx.userFields || []);
    if (fieldsText) lines.push(`字段：${fieldsText}`);
  }

  return lines.join('\n');
}

export function renderEntityDetailsForUpdate(sessionId, entityIds, { worldId, mainCharacterEntityId } = {}) {
  if (!entityIds || entityIds.length === 0) return '';
  const { byId, nameOf } = buildEntityIndex(sessionId);
  // guard-allow(duplication): 与 long-term-recall.js 的按 id 取值排序是不同领域的巧合同形，不是业务重复
  const targets = entityIds.map((id) => byId.get(id)).filter(Boolean).sort((a, b) => a.seq - b.seq);
  if (targets.length === 0) return '';
  const ids = targets.map((e) => e.entity_id);

  const ctx = {
    details: getEntityDetails(sessionId, ids),
    fieldValues: getEntityStateValues(sessionId, ids),
    userFields: resolveWorldCharacterFields(worldId),
    activeKeysFn: activeProfileKeysFactory(worldId),
    mainCharacterEntityId,
  };

  const blocks = targets.map((entity) => renderEntityDetailBlock(entity, ctx));

  const relations = listCurrentRelations(sessionId, ids);
  const relationLines = relations.map((r) => (
    `r${r.seq}｜${nameOf(r.subject_id)} —${r.predicate}→ ${r.object_id ? nameOf(r.object_id) : (r.object_value ?? '')}`
  ));

  return [...blocks, ...relationLines].filter(Boolean).join('\n');
}

/** 单实体档案纯文本（供制卡使用）：card_id 实体取卡片 description，其余按档案字段渲染（含穿着，不含现状/字段/关系）。 */
export function renderEntityProfileText(sessionId, entityId, { worldId } = {}) {
  const entity = listCurrentEntities(sessionId).find((e) => e.entity_id === entityId);
  if (!entity) return '';

  const details = getEntityDetails(sessionId, [entityId]);
  const detail = details[entityId] || { profile: {}, dynamic: {} };
  if (entity.type !== 'character') return buildSimpleEntityBlock(entity, detail);
  if (entity.card_id) {
    const card = getCharacterById(entity.card_id);
    return card?.description ? card.description.trim() : '';
  }

  const worldProfile = getCurrentWorldProfile(sessionId);
  const ctx = {
    details,
    worldDate: currentWorldDate(worldProfile.time),
    activeProfileKeys: activeProfileKeysFactory(worldId),
  };
  const state = { header: `【${entity.name}】`, _headerCharged: true };
  const fragments = [];
  buildProfileFragments(entity, ctx, state, 1, fragments);
  const outfit = buildOutfitText(detail.profile, ctx.activeProfileKeys(entity.type));
  addOptionalFragment(fragments, 1, state, outfit, () => { state.outfitText = outfit; });
  fragments.forEach((f) => f.apply());

  return finalizeCharacterBlock(state);
}
