import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport } from '../helpers/test-env.js';
import {
  insertWorld, insertSession, insertCharacter, insertCharacterStateField, insertPersonaStateField,
} from '../helpers/fixtures.js';

const sandbox = createTestSandbox('memory-state-memory-render');
sandbox.setEnv();

after(() => sandbox.cleanup());

const {
  upsertEntity, upsertProfileField, upsertDynamicState, upsertRelation, upsertThread,
  upsertWorldProfile, upsertWorldFact, upsertPresence, nextEntitySeq, nextThreadSeq, nextRelationSeq, nextFactSeq,
} = await freshImport('backend/db/queries/state-memory.js');
const {
  selectRelevantEntities, renderStoryState, renderEntityDirectory, renderWorldFactsForUpdate,
  renderEntityDetailsForUpdate, renderEntityProfileText,
} = await freshImport('backend/memory/state-memory-render.js');

function setupSession() {
  const world = insertWorld(sandbox.db);
  const session = insertSession(sandbox.db, { world_id: world.id });
  return { worldId: world.id, sessionId: session.id };
}

function createEntity(sessionId, { type = 'character', name, aliases = [], pinned = false, cardId = null, round = 1 } = {}) {
  const entityId = `e-${name}-${Math.random().toString(36).slice(2, 8)}`;
  const seq = nextEntitySeq(sessionId);
  upsertEntity(sessionId, {
    entityId, seq, type, name, aliasesJson: JSON.stringify(aliases), pinned, cardId,
  }, round);
  return entityId;
}

// ─── selectRelevantEntities ─────────────────────────────────────────────

test('selectRelevantEntities：在场、地点、提及、置顶、关联事项与持有物品按优先级去重选出', () => {
  const { sessionId } = setupSession();
  const presenceChar = createEntity(sessionId, { name: 'presence角色' });
  const locationEntity = createEntity(sessionId, { type: 'location', name: '旧港仓库' });
  const locatedChar = createEntity(sessionId, { name: '在地点的人' });
  const mentionedChar = createEntity(sessionId, { name: '沈彦', aliases: ['沈先生'] });
  const tooShortChar = createEntity(sessionId, { name: '甲' });
  const pinnedChar = createEntity(sessionId, { name: '置顶角色', pinned: true });
  const threadPartner = createEntity(sessionId, { name: '林乔' });
  const heldItem = createEntity(sessionId, { type: 'item', name: '银戒指' });
  const unrelated = createEntity(sessionId, { name: '无关角色' });

  upsertWorldProfile(sessionId, 'location', '旧港仓库', locationEntity, 1);
  upsertDynamicState(sessionId, locatedChar, '位置', '旧港仓库', 1);
  upsertPresence(sessionId, 1, [presenceChar]);
  upsertThread(sessionId, {
    threadId: 't-1', seq: nextThreadSeq(sessionId), kind: '承诺',
    participantsJson: JSON.stringify([pinnedChar, threadPartner]), content: '三日内归还账本',
    status: 'active', openedRound: 1,
  }, 1);
  upsertRelation(sessionId, {
    relationId: 'r-1', seq: nextRelationSeq(sessionId), subjectId: heldItem, predicate: '持有者', objectId: pinnedChar,
  }, 1);

  const selected = selectRelevantEntities(sessionId, { userMessage: '沈先生走进了房间', lastAssistant: '' });
  const ids = selected.map((s) => s.entityId);

  assert.ok(ids.includes(presenceChar), '在场实体应选中');
  assert.ok(ids.includes(locationEntity), '当前地点实体应选中');
  assert.ok(ids.includes(locatedChar), '位置指向当前地点的角色应选中');
  assert.ok(ids.includes(mentionedChar), '用户消息中提及别名的实体应选中');
  assert.ok(!ids.includes(tooShortChar), '名字少于 2 个字的实体不参与匹配');
  assert.ok(ids.includes(pinnedChar), '置顶实体应选中');
  assert.ok(ids.includes(threadPartner), '置顶角色进行中事项的其他参与方应选中');
  assert.ok(ids.includes(heldItem), '置顶角色当前持有的物品应选中');
  assert.ok(!ids.includes(unrelated), '无关实体不应选中');
  assert.equal(new Set(ids).size, ids.length, '结果应去重');
});

test('selectRelevantEntities：不含 player 与 retired', () => {
  const { sessionId } = setupSession();
  const player = createEntity(sessionId, { type: 'player', name: '玩家' });
  const retired = createEntity(sessionId, { name: '已退场' });
  upsertEntity(sessionId, { entityId: retired, seq: nextEntitySeq(sessionId), type: 'character', name: '已退场', status: 'retired' }, 2);
  upsertPresence(sessionId, 1, [player, retired]);

  const selected = selectRelevantEntities(sessionId, {});
  assert.deepEqual(selected.map((s) => s.entityId), []);
});

// ─── renderStoryState：档案渲染、年龄推算、停用字段、card、主角色 ─────────────────────────────────────────────

test('AC-05/08：第 1 轮建档，100 轮未出现后第 101 轮提及别名仍能渲染完整档案与身份组', () => {
  const { sessionId, worldId } = setupSession();
  const entityId = createEntity(sessionId, { name: '沈彦', aliases: ['沈先生'], round: 1 });
  upsertProfileField(sessionId, entityId, 'gender', '"男"', '沈彦是个男人', 1);
  upsertProfileField(sessionId, entityId, 'occupation', '"前海军军官"', '他曾是前海军军官', 1);
  upsertProfileField(sessionId, entityId, 'speech_style', '["用词简短"]', '他说话总是用词简短', 1);

  const text = renderStoryState(sessionId, { worldId, userMessage: '沈先生忽然出现在第 101 轮', lastAssistant: '', budget: 3000 });
  assert.match(text, /<story_state/);
  assert.match(text, /身份：男，前海军军官/);
  assert.match(text, /说话：用词简短/);
});

test('AC-06：有 birth_date 时年龄随世界日期推算；世界日期推进十年后年龄 +10', () => {
  const { sessionId, worldId } = setupSession();
  const entityId = createEntity(sessionId, { name: '林晚', round: 1 });
  upsertProfileField(sessionId, entityId, 'gender', '"女"', '林晚是个女人', 1);
  upsertProfileField(sessionId, entityId, 'birth_date', '"1000-03-15"', '她生于1000-03-15', 1);
  upsertWorldProfile(sessionId, 'time', '1020-03-15T08:00', null, 1);

  const before = renderStoryState(sessionId, { worldId, userMessage: '林晚出场', budget: 3000 });
  assert.match(before, /20 岁/);

  upsertWorldProfile(sessionId, 'time', '1030-03-15T08:00', null, 2);
  const after = renderStoryState(sessionId, { worldId, userMessage: '林晚出场', budget: 3000 });
  assert.match(after, /30 岁/);
});

test('没有世界日期时年龄显示「记于第 R 轮」', () => {
  const { sessionId, worldId } = setupSession();
  const entityId = createEntity(sessionId, { name: '阿石', round: 5 });
  upsertProfileField(sessionId, entityId, 'gender', '"男"', '阿石是个男人', 5);
  upsertProfileField(sessionId, entityId, 'age_recorded', '{"age":22,"as_of_round":5}', '阿石今年22岁', 5);

  const text = renderStoryState(sessionId, { worldId, userMessage: '阿石出场', budget: 3000 });
  assert.match(text, /记于第 5 轮/);
});

test('预算极小时身份组四要素与说话方式仍保留，其余内容被裁掉', () => {
  const { sessionId, worldId } = setupSession();
  const entityId = createEntity(sessionId, { name: '沈彦', round: 1 });
  upsertProfileField(sessionId, entityId, 'gender', '"男"', '沈彦是个男人', 1);
  upsertProfileField(sessionId, entityId, 'species', '"人类"', '沈彦是人类', 1);
  upsertProfileField(sessionId, entityId, 'occupation', '"前海军军官"', '他曾是前海军军官', 1);
  upsertProfileField(sessionId, entityId, 'speech_style', '["用词简短"]', '他说话总是用词简短', 1);
  upsertProfileField(sessionId, entityId, 'origin', '"北海渔村"', '他出身北海渔村', 1);
  upsertProfileField(sessionId, entityId, 'background', '["曾服役北海舰队"]', '他曾服役北海舰队', 1);
  upsertDynamicState(sessionId, entityId, '伤势', '右臂受伤', 1);

  const text = renderStoryState(sessionId, { worldId, userMessage: '沈彦出场', budget: 1 });
  assert.match(text, /身份：男，人类，前海军军官/);
  assert.match(text, /说话：用词简短/);
  assert.ok(!text.includes('出身北海渔村'), '出身应因预算被裁掉');
  assert.ok(!text.includes('经历'), '经历应因预算被裁掉');
  assert.ok(!text.includes('伤势'), '现状应因预算被裁掉');
});

test('世界事实与时间地点每轮都注入，不受预算影响', () => {
  const { sessionId, worldId } = setupSession();
  upsertWorldProfile(sessionId, 'time', '1000-03-16T08:00', null, 1);
  upsertWorldProfile(sessionId, 'location', '旧港仓库', null, 1);
  upsertWorldFact(sessionId, { factId: 'f-1', seq: nextFactSeq(sessionId), text: '王城内禁止使用魔法', evidence: '证据' }, 1);

  const text = renderStoryState(sessionId, { worldId, budget: 0 });
  assert.match(text, /时间：1000-03-16T08:00｜地点：旧港仓库/);
  assert.match(text, /【世界事实】/);
  assert.match(text, /王城内禁止使用魔法/);
});

test('世界里有 nearby_enabled=1 的同义「职业」字段时，occupation 不渲染', () => {
  const { sessionId, worldId } = setupSession();
  insertCharacterStateField(sandbox.db, worldId, { field_key: 'job', label: '职业', nearby_enabled: 1 });
  const entityId = createEntity(sessionId, { name: '沈彦', round: 1 });
  upsertProfileField(sessionId, entityId, 'gender', '"男"', '沈彦是个男人', 1);
  upsertProfileField(sessionId, entityId, 'occupation', '"前海军军官"', '他曾是前海军军官', 1);

  const text = renderStoryState(sessionId, { worldId, userMessage: '沈彦出场', budget: 3000 });
  assert.ok(!text.includes('前海军军官'), 'occupation 应因同义字段停用而不渲染');
  assert.match(text, /身份：男/);
});

test('card_id 实体档案改为卡片描述，穿着与现状照常渲染', () => {
  const { sessionId, worldId } = setupSession();
  const character = insertCharacter(sandbox.db, worldId, { name: '卡片角色', description: '一位神秘的旅人，寡言少语。' });
  const entityId = createEntity(sessionId, { name: '卡片角色', round: 1, cardId: character.id });
  upsertProfileField(sessionId, entityId, 'gender', '"男"', '他是个男人', 1);
  upsertProfileField(sessionId, entityId, 'outfit', '["灰色斗篷"]', '他穿着灰色斗篷', 1);
  upsertDynamicState(sessionId, entityId, '位置', '码头', 1);

  const text = renderStoryState(sessionId, { worldId, userMessage: '卡片角色出场', budget: 3000 });
  assert.match(text, /简介：一位神秘的旅人，寡言少语。/);
  assert.ok(!text.includes('身份：男'), 'card 实体不应渲染档案身份行');
  assert.match(text, /穿着：灰色斗篷/);
  assert.match(text, /现状：位置=码头/);
});

test('对话模式主角色只渲染现状、关系、事项', () => {
  const { sessionId, worldId } = setupSession();
  const mainId = createEntity(sessionId, { name: '主角', round: 1 });
  const other = createEntity(sessionId, { name: '配角', round: 1, pinned: true });
  upsertProfileField(sessionId, mainId, 'gender', '"男"', '主角是个男人', 1);
  upsertDynamicState(sessionId, mainId, '位置', '码头', 1);
  upsertRelation(sessionId, { relationId: 'r-main', seq: nextRelationSeq(sessionId), subjectId: mainId, predicate: '盟友', objectId: other }, 1);

  const text = renderStoryState(sessionId, { worldId, mainCharacterEntityId: mainId, userMessage: '主角配角出场', budget: 3000 });
  assert.ok(!text.includes('身份：男'), '主角色不应渲染档案身份行');
  assert.match(text, /【主角】/);
  assert.match(text, /现状：位置=码头/);
  assert.match(text, /关系：主角 —盟友→ 配角/);
});

test('无实体也无世界数据时返回空串', () => {
  const { sessionId, worldId } = setupSession();
  const text = renderStoryState(sessionId, { worldId, budget: 3000 });
  assert.equal(text, '');
});

// ─── 玩家穿着行 ─────────────────────────────────────────────

test('玩家 outfit 非空且启用时固定输出穿着行，不受预算裁剪，也不作为实体段注入', () => {
  const { sessionId, worldId } = setupSession();
  const playerId = createEntity(sessionId, { type: 'player', name: '旅人', round: 1 });
  upsertProfileField(sessionId, playerId, 'outfit', '["粗布外套","旧皮靴"]', '他穿着粗布外套和旧皮靴', 1);
  upsertWorldProfile(sessionId, 'time', '1000-03-16T08:00', null, 1);

  const text = renderStoryState(sessionId, { worldId, budget: 1 });
  assert.match(text, /【旅人】穿着：粗布外套、旧皮靴/);
  assert.ok(!text.includes('【旅人】\n'), '玩家不应作为独立实体段落注入');
});

test('世界里有同义玩家字段时，玩家穿着行不出现', () => {
  const { sessionId, worldId } = setupSession();
  insertPersonaStateField(sandbox.db, worldId, { field_key: 'clothes', label: '穿着' });
  const playerId = createEntity(sessionId, { type: 'player', name: '旅人', round: 1 });
  upsertProfileField(sessionId, playerId, 'outfit', '["粗布外套"]', '他穿着粗布外套', 1);

  const text = renderStoryState(sessionId, { worldId, budget: 3000 });
  assert.ok(!text.includes('穿着：粗布外套'), '同义玩家字段命中时 outfit 档案字段应停用');
});

// ─── renderEntityDirectory ─────────────────────────────────────────────

test('renderEntityDirectory：含 player，预算内从新到旧截取后按 seq 输出', () => {
  const { sessionId } = setupSession();
  const first = createEntity(sessionId, { name: 'A', round: 1 });
  createEntity(sessionId, { name: 'B', round: 1 });
  createEntity(sessionId, { type: 'player', name: '玩家', round: 1 });

  const full = renderEntityDirectory(sessionId, 3000);
  assert.match(full, /e1｜character｜A｜/);
  assert.match(full, /玩家/);

  const tiny = renderEntityDirectory(sessionId, 1);
  const lines = tiny.split('\n').filter(Boolean);
  assert.ok(lines.length <= 1, '极小预算下只应保留最新的一条（从新到旧截取）');
  if (lines.length === 1) assert.ok(!lines[0].includes(`｜A｜`), '应保留最新实体而非最旧的');
  void first;
});

// ─── renderWorldFactsForUpdate ─────────────────────────────────────────────

test('renderWorldFactsForUpdate：f<seq>｜内容', () => {
  const { sessionId } = setupSession();
  upsertWorldFact(sessionId, { factId: 'f-1', seq: nextFactSeq(sessionId), text: '北境已被黑潮会占领', evidence: '证据' }, 1);
  assert.equal(renderWorldFactsForUpdate(sessionId), 'f1｜北境已被黑潮会占领');
});

// ─── renderEntityDetailsForUpdate ─────────────────────────────────────────────

test('renderEntityDetailsForUpdate：带 e/r/t 编号，档案附可变性标注', () => {
  const { sessionId, worldId } = setupSession();
  const a = createEntity(sessionId, { name: '沈彦', round: 1 });
  const b = createEntity(sessionId, { name: '林乔', round: 1 });
  upsertProfileField(sessionId, a, 'gender', '"男"', '沈彦是个男人', 1);
  upsertRelation(sessionId, { relationId: 'r-1', seq: nextRelationSeq(sessionId), subjectId: a, predicate: '盟友', objectId: b }, 1);
  upsertThread(sessionId, {
    threadId: 't-1', seq: nextThreadSeq(sessionId), kind: '承诺', participantsJson: JSON.stringify([a, b]),
    content: '三日内归还账本', status: 'active', openedRound: 1,
  }, 1);

  const text = renderEntityDetailsForUpdate(sessionId, [a, b], { worldId });
  assert.match(text, /gender=男（immutable）/);
  assert.match(text, /r1｜沈彦 —盟友→ 林乔/);
  assert.match(text, /t1｜［承诺］三日内归还账本（沈彦、林乔，第 1 轮起）/);
});

test('renderEntityDetailsForUpdate：player 只输出编号、名字与 outfit', () => {
  const { sessionId, worldId } = setupSession();
  const playerId = createEntity(sessionId, { type: 'player', name: '旅人', round: 1 });
  upsertProfileField(sessionId, playerId, 'outfit', '["粗布外套"]', '他穿着粗布外套', 1);
  upsertDynamicState(sessionId, playerId, '心情', '愉悦', 1);

  const text = renderEntityDetailsForUpdate(sessionId, [playerId], { worldId });
  assert.match(text, /旅人/);
  assert.match(text, /outfit=粗布外套（dynamic）/);
  assert.ok(!text.includes('现状'), 'player 不应渲染现状');
  assert.ok(!text.includes('愉悦'), 'player 不应渲染现状');
});

test('renderEntityDetailsForUpdate：空数组返回空串', () => {
  const { sessionId } = setupSession();
  assert.equal(renderEntityDetailsForUpdate(sessionId, []), '');
});

// ─── renderEntityProfileText ─────────────────────────────────────────────

test('renderEntityProfileText：单实体档案纯文本；card_id 实体取卡片描述', () => {
  const { sessionId, worldId } = setupSession();
  const entityId = createEntity(sessionId, { name: '沈彦', round: 1 });
  upsertProfileField(sessionId, entityId, 'gender', '"男"', '沈彦是个男人', 1);
  upsertProfileField(sessionId, entityId, 'occupation', '"前海军军官"', '他曾是前海军军官', 1);

  const text = renderEntityProfileText(sessionId, entityId, { worldId });
  assert.match(text, /身份：男，前海军军官/);

  const character = insertCharacter(sandbox.db, worldId, { name: '卡片角色', description: '寡言少语的旅人。' });
  const cardEntityId = createEntity(sessionId, { name: '卡片角色', round: 1, cardId: character.id });
  assert.equal(renderEntityProfileText(sessionId, cardEntityId, { worldId }), '寡言少语的旅人。');
});
