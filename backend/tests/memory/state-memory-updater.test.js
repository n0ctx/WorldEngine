import test, { after } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import { STATE_TEXT_COMPRESS_TARGET } from '../../utils/constants.js';
import {
  insertCharacter,
  insertCharacterStateField,
  insertMessage,
  insertPersona,
  insertPersonaStateField,
  insertSession,
  insertWorld,
  insertWorldEntry,
  insertWorldStateField,
} from '../helpers/fixtures.js';

const sandbox = createTestSandbox('state-memory-updater');
sandbox.setEnv();
after(() => {
  resetMockEnv();
  sandbox.cleanup();
});

function countRows(table, sessionId) {
  return sandbox.db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE session_id = ?`).get(sessionId).c;
}

const STATE_MEMORY_TABLES = [
  'state_entities', 'state_profile_fields', 'state_dynamic',
  'state_relations', 'state_threads', 'state_world_profile',
];

function snapshotStateMemoryCounts(sessionId) {
  return Object.fromEntries(STATE_MEMORY_TABLES.map((table) => [table, countRows(table, sessionId)]));
}

test('一次调用同时写用户字段和状态记忆：create_entity 带证据、set_world time、present 在场名单', async () => {
  resetMockEnv();
  const world = insertWorld(sandbox.db, { name: '边境' });
  const character = insertCharacter(sandbox.db, world.id, { name: '诺亚' });
  const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '我们在森林边缘遇到了一位向导，他戴着斗笠。', created_at: 1 });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '向导向你行礼，说欢迎来到边境。', created_at: 2 });
  insertWorldStateField(sandbox.db, world.id, { field_key: 'weather', label: '天气', update_mode: 'llm_auto' });

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({
    world: { weather: '晴朗' },
    entity_fields: {},
    memory: [
      { op: 'create_entity', name: '向导', type: 'character', evidence: '我们在森林边缘遇到了一位向导' },
      { op: 'set_world', key: 'time', value: '1000-03-15T14:30' },
    ],
    present: ['e1', '向导'],
  });

  const { updateAllStates } = await freshImport('backend/memory/combined-state-updater.js');
  await updateAllStates(world.id, [character.id], session.id);

  const worldValue = sandbox.db.prepare(
    'SELECT runtime_value_json FROM session_world_state_values WHERE session_id = ? AND field_key = ?'
  ).get(session.id, 'weather');
  assert.equal(worldValue?.runtime_value_json, '"晴朗"');

  const { listCurrentEntities, getCurrentWorldProfile, getLatestPresence } = await freshImport('backend/db/queries/state-memory.js');
  const entities = listCurrentEntities(session.id);
  const guide = entities.find((e) => e.name === '向导');
  assert.ok(guide, '向导实体应已创建');
  assert.equal(guide.type, 'character');

  const worldProfile = getCurrentWorldProfile(session.id);
  assert.equal(worldProfile.time, '1000-03-15T14:30');

  const presence = getLatestPresence(session.id);
  const player = entities.find((e) => e.type === 'player');
  assert.deepEqual(presence.entity_ids, [player.entity_id, guide.entity_id]);
});

test('首次运行建好 player/主角色实体（对话模式）；写作模式只建 player', async () => {
  resetMockEnv();
  process.env.MOCK_LLM_COMPLETE = JSON.stringify({ entity_fields: {}, memory: [] });

  // 对话模式
  const chatWorld = insertWorld(sandbox.db, { name: '对话世界' });
  const character = insertCharacter(sandbox.db, chatWorld.id, { name: '露娜' });
  const chatSession = insertSession(sandbox.db, { character_id: character.id, world_id: chatWorld.id });
  insertMessage(sandbox.db, chatSession.id, { role: 'user', content: '你好', created_at: 1 });

  const { updateAllStates } = await freshImport('backend/memory/combined-state-updater.js');
  await updateAllStates(chatWorld.id, [character.id], chatSession.id);

  const { listCurrentEntities } = await freshImport('backend/db/queries/state-memory.js');
  const chatEntities = listCurrentEntities(chatSession.id);
  assert.equal(chatEntities.length, 2);
  assert.ok(chatEntities.some((e) => e.type === 'player'));
  const mainChar = chatEntities.find((e) => e.type === 'character');
  assert.equal(mainChar?.card_id, character.id);
  assert.equal(mainChar?.name, '露娜');

  // 写作模式
  const writingWorld = insertWorld(sandbox.db, { name: '写作世界' });
  const persona = insertPersona(sandbox.db, writingWorld.id, { name: '旅人' });
  const writingSession = insertSession(sandbox.db, { world_id: writingWorld.id, persona_id: persona.id, mode: 'writing' });
  insertMessage(sandbox.db, writingSession.id, { role: 'user', content: '继续写下去', created_at: 1 });

  await updateAllStates(writingWorld.id, [], writingSession.id);

  const writingEntities = listCurrentEntities(writingSession.id);
  assert.equal(writingEntities.length, 1);
  assert.equal(writingEntities[0].type, 'player');
  assert.equal(writingEntities[0].name, '旅人');
});

test('没有任何用户字段的世界也会调用模型并写状态记忆', async () => {
  resetMockEnv();
  const world = insertWorld(sandbox.db, { name: '无字段世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '空白' });
  const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '船长承诺归还账本。', created_at: 1 });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '船长答应明天归还。', created_at: 2 });

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({
    entity_fields: {},
    memory: [{ op: 'open_thread', kind: '承诺', content: '船长承诺归还账本', participants: [] }],
  });

  const { updateAllStates } = await freshImport('backend/memory/combined-state-updater.js');
  await updateAllStates(world.id, [character.id], session.id);

  const { listThreads } = await freshImport('backend/db/queries/state-memory.js');
  assert.equal(listThreads(session.id)[0].content, '船长承诺归还账本');
});

test('本轮明确完成的无参与者事项进入更新输入并可自动结案', async () => {
  resetMockEnv();
  const world = insertWorld(sandbox.db, { name: '港口' });
  const character = insertCharacter(sandbox.db, world.id, { name: '船长' });
  const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id });
  const { upsertThread, nextThreadSeq, listActiveThreads, listThreads } = await freshImport('backend/db/queries/state-memory.js');
  upsertThread(session.id, {
    threadId: 'return-book', seq: nextThreadSeq(session.id), kind: '任务', participantsJson: '[]',
    content: '归还账本', status: 'active', openedRound: 1,
  }, 1);
  insertMessage(sandbox.db, session.id, { role: 'user', content: '账本已经归还。', created_at: 1 });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '船长收下了账本。', created_at: 2 });
  const { buildRuntimeUserPrompt } = await freshImport('backend/memory/state-update-context.js');
  const prompt = buildRuntimeUserPrompt({
    sessionId: session.id, worldId: world.id, mainCharacterEntityId: null,
    valueSections: [], dialogue: '【本轮】账本已经归还。', turnText: '账本已经归还。',
    responseKeys: [], round: 2, relevantIds: new Set(),
  });
  assert.match(prompt, /【本轮相关的未了事项】\nt1｜［任务］归还账本/);

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({ entity_fields: {}, memory: [
    { op: 'resolve_thread', thread: 't1', outcome: 'resolved' },
  ] });
  const { updateAllStates } = await freshImport('backend/memory/combined-state-updater.js');
  await updateAllStates(world.id, [character.id], session.id);
  assert.equal(listActiveThreads(session.id).length, 0);
  assert.equal(listThreads(session.id)[0].status, 'resolved');
});

test('状态更新提示词收紧立案并按事实结案', () => {
  const prompt = readFileSync(new URL('../../prompts/templates/state-update.md', import.meta.url), 'utf8');
  assert.match(prompt, /本轮之后仍未完成/);
  assert.match(prompt, /不要求出现「完成了」/);
  assert.match(prompt, /期限到来本身不是结案/);
});

test('连续 50 轮全是占位值/空操作时，状态记忆各表无新增行（除首轮建的 player/主角色外）', async () => {
  resetMockEnv();
  const world = insertWorld(sandbox.db, { name: '空转世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '路人' });
  const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id });

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({
    entity_fields: {},
    memory: [{ op: 'set_state', entity: 'e1', key: '心情', value: '未知' }],
  });

  const { updateAllStates } = await freshImport('backend/memory/combined-state-updater.js');

  let ts = 1;
  insertMessage(sandbox.db, session.id, { role: 'user', content: '轮1', created_at: ts++ });
  await updateAllStates(world.id, [character.id], session.id);

  const baseline = snapshotStateMemoryCounts(session.id);
  assert.equal(baseline.state_entities, 2, '首轮应已建好 player + 主角色两个实体');

  for (let round = 2; round <= 50; round++) {
    insertMessage(sandbox.db, session.id, { role: 'user', content: `轮${round}`, created_at: ts++ });
    insertMessage(sandbox.db, session.id, { role: 'assistant', content: `回应${round}`, created_at: ts++ });
    await updateAllStates(world.id, [character.id], session.id);
  }

  assert.deepEqual(snapshotStateMemoryCounts(session.id), baseline);
});

test('世界里 nearby_enabled=1 的「职业」角色字段会让档案清单里的 occupation 停用', async () => {
  resetMockEnv();
  const world = insertWorld(sandbox.db, { name: '同义世界' });
  insertCharacterStateField(sandbox.db, world.id, { field_key: 'career', label: '职业', update_mode: 'llm_auto' });

  const { loadStateUpdateTargets, buildEntityStateSections } = await freshImport('backend/memory/state-update-context.js');
  const { __testables } = await freshImport('backend/memory/combined-state-updater.js');
  const { getWorldById } = await freshImport('backend/db/queries/worlds.js');
  const character = insertCharacter(sandbox.db, world.id, { name: '甲' });
  const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id });

  const w = getWorldById(world.id);
  const targets = loadStateUpdateTargets(world.id, [character.id], w);
  const sections = buildEntityStateSections(targets, { world: w, worldId: world.id, sessionId: session.id, session });
  const system = __testables.buildCacheableSystemPrompt(world.id, targets, sections);

  const characterBlock = system.slice(system.indexOf('【角色】'), system.indexOf('【地点】'));
  assert.ok(!characterBlock.includes('- occupation（'), 'occupation 档案字段应因同义用户字段停用');
  assert.ok(system.includes('career（职业'), 'NPC 适用字段清单应包含 career');
});

test('状态更新说明里写明 text 字段的字数上限', async () => {
  resetMockEnv();
  const world = insertWorld(sandbox.db, { name: '字数世界' });
  insertWorldStateField(sandbox.db, world.id, { field_key: 'mission', label: '任务', type: 'text', update_mode: 'llm_auto' });

  const { loadStateUpdateTargets, buildEntityStateSections } = await freshImport('backend/memory/state-update-context.js');
  const { __testables } = await freshImport('backend/memory/combined-state-updater.js');
  const { getWorldById } = await freshImport('backend/db/queries/worlds.js');
  const character = insertCharacter(sandbox.db, world.id, { name: '丁' });
  const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id });

  const w = getWorldById(world.id);
  const targets = loadStateUpdateTargets(world.id, [character.id], w);
  const sections = buildEntityStateSections(targets, { world: w, worldId: world.id, sessionId: session.id, session });
  const system = __testables.buildCacheableSystemPrompt(world.id, targets, sections);

  assert.ok(system.includes(`text 类型字段的值不超过 ${STATE_TEXT_COMPRESS_TARGET} 字`));
});

test('system 前缀带上本世界启用的常驻条目作为世界观，不带需触发的和已停用的条目', async () => {
  resetMockEnv();
  const world = insertWorld(sandbox.db, { name: '雾都' });
  insertWorldEntry(sandbox.db, world.id, { title: '地理', content: '{{world}}终年大雾，{{user}}住在河南岸。', trigger_type: 'always', token: 0 });
  insertWorldEntry(sandbox.db, world.id, { title: '规矩', content: '入夜后禁止上街。', trigger_type: 'always', token: 2 });
  insertWorldEntry(sandbox.db, world.id, { title: '秘闻', content: '钟楼下有密道。', trigger_type: 'keyword', keywords: ['钟楼'] });
  const disabled = insertWorldEntry(sandbox.db, world.id, { title: '旧设定', content: '已废弃的设定。', trigger_type: 'always' });
  sandbox.db.prepare('UPDATE world_prompt_entries SET enabled = 0 WHERE id = ?').run(disabled.id);

  const { loadStateUpdateTargets, buildEntityStateSections } = await freshImport('backend/memory/state-update-context.js');
  const { __testables, buildWorldSettingText } = await freshImport('backend/memory/combined-state-updater.js');
  const { getWorldById } = await freshImport('backend/db/queries/worlds.js');
  const character = insertCharacter(sandbox.db, world.id, { name: '丁' });
  const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id });

  const w = getWorldById(world.id);
  const targets = loadStateUpdateTargets(world.id, [character.id], w);
  const sections = buildEntityStateSections(targets, { world: w, worldId: world.id, sessionId: session.id, session });
  const worldSetting = buildWorldSettingText(w, '旅人');
  const system = __testables.buildCacheableSystemPrompt(world.id, targets, { ...sections, worldSetting });

  assert.ok(system.includes('雾都终年大雾，旅人住在河南岸。'));
  assert.ok(system.indexOf('【地理】') < system.indexOf('【规矩】'));
  assert.ok(!system.includes('钟楼下有密道'));
  assert.ok(!system.includes('已废弃的设定'));
});

test('system 前缀带上会话人设正文作为玩家人设', async () => {
  resetMockEnv();
  const world = insertWorld(sandbox.db, { name: '雾都' });
  const persona = insertPersona(sandbox.db, world.id, { name: '旅人', system_prompt: '{{user}}是来自{{world}}的邮差，左眼有疤。' });

  const { loadStateUpdateTargets, buildEntityStateSections, resolvePersona } = await freshImport('backend/memory/state-update-context.js');
  const { __testables, buildPersonaSettingText } = await freshImport('backend/memory/combined-state-updater.js');
  const { getWorldById } = await freshImport('backend/db/queries/worlds.js');
  const character = insertCharacter(sandbox.db, world.id, { name: '丁' });
  const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id, persona_id: persona.id });

  const w = getWorldById(world.id);
  const targets = loadStateUpdateTargets(world.id, [character.id], w);
  const sections = buildEntityStateSections(targets, { world: w, worldId: world.id, sessionId: session.id, session });
  const personaSetting = buildPersonaSettingText(w, resolvePersona(session, world.id));
  const system = __testables.buildCacheableSystemPrompt(world.id, targets, { ...sections, personaSetting });

  assert.ok(system.includes('### 玩家人设\n\n旅人是来自雾都的邮差，左眼有疤。'));
});

test('两轮调用之间 system 内容逐字节相同', async () => {
  resetMockEnv();
  const world = insertWorld(sandbox.db, { name: '稳定世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '丙' });
  const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id });
  insertWorldStateField(sandbox.db, world.id, { field_key: 'weather', label: '天气', update_mode: 'llm_auto' });

  const { loadStateUpdateTargets, buildEntityStateSections } = await freshImport('backend/memory/state-update-context.js');
  const { __testables, updateAllStates } = await freshImport('backend/memory/combined-state-updater.js');
  const { getWorldById } = await freshImport('backend/db/queries/worlds.js');

  function buildSystem() {
    const w = getWorldById(world.id);
    const targets = loadStateUpdateTargets(world.id, [character.id], w);
    const sections = buildEntityStateSections(targets, { world: w, worldId: world.id, sessionId: session.id, session });
    return __testables.buildCacheableSystemPrompt(world.id, targets, sections);
  }

  const system1 = buildSystem();

  insertMessage(sandbox.db, session.id, { role: 'user', content: '轮1', created_at: 1 });
  process.env.MOCK_LLM_COMPLETE = JSON.stringify({
    world: { weather: '晴朗' },
    entity_fields: {},
    memory: [],
  });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '本地货币是银币，请注意携带。', created_at: 2 });
  await updateAllStates(world.id, [character.id], session.id);

  const system2 = buildSystem();
  assert.equal(system2, system1);
});

test('真实日期模式写世界档案 time 且模型输出的 set_world time 被丢弃', async () => {
  resetMockEnv();
  const world = insertWorld(sandbox.db, { name: '真实日期世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '丁' });
  const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id, diary_date_mode: 'real' });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '现在几点了？', created_at: 1 });

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({
    entity_fields: {},
    memory: [{ op: 'set_world', key: 'time', value: '2999-01-01T00:00' }],
  });

  const { updateAllStates } = await freshImport('backend/memory/combined-state-updater.js');
  await updateAllStates(world.id, [character.id], session.id);

  const { getCurrentWorldProfile } = await freshImport('backend/db/queries/state-memory.js');
  const worldProfile = getCurrentWorldProfile(session.id);
  assert.notEqual(worldProfile.time, '2999-01-01T00:00');
  assert.match(worldProfile.time, /^\d+-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test('LLM 调用失败时状态记忆不变', async () => {
  resetMockEnv();
  const world = insertWorld(sandbox.db, { name: '失败世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '戊' });
  const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '第一轮', created_at: 1 });

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({ entity_fields: {}, memory: [] });
  const { updateAllStates } = await freshImport('backend/memory/combined-state-updater.js');
  await updateAllStates(world.id, [character.id], session.id);

  const beforeCounts = snapshotStateMemoryCounts(session.id);

  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '回应', created_at: 2 });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '第二轮', created_at: 3 });
  process.env.MOCK_LLM_COMPLETE_ERROR = 'boom';
  await assert.rejects(updateAllStates(world.id, [character.id], session.id), /boom/);

  assert.deepEqual(snapshotStateMemoryCounts(session.id), beforeCounts);
});

test('entity_fields 写入 NPC 的 llm_auto+nearby_enabled 字段', async () => {
  resetMockEnv();
  const world = insertWorld(sandbox.db, { name: '好感世界' });
  insertCharacterStateField(sandbox.db, world.id, { field_key: 'favor', label: '好感度', type: 'number', min_value: 0, max_value: 100, update_mode: 'llm_auto' });
  const character = insertCharacter(sandbox.db, world.id, { name: '己' });
  const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id });
  insertMessage(sandbox.db, session.id, { role: 'user', content: '我们遇到了一位向导，他自称阿吉。', created_at: 1 });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '阿吉笑着向你介绍这片区域。', created_at: 2 });

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({
    char_0: { favor: 10 },
    entity_fields: { e3: { favor: 60 } },
    memory: [{ op: 'create_entity', name: '阿吉', type: 'character', evidence: '我们遇到了一位向导，他自称阿吉' }],
  });

  const { updateAllStates } = await freshImport('backend/memory/combined-state-updater.js');
  await updateAllStates(world.id, [character.id], session.id);

  const { listCurrentEntities } = await freshImport('backend/db/queries/state-memory.js');
  const { getEntityStateValues } = await freshImport('backend/db/queries/session-entity-state-values.js');
  const entities = listCurrentEntities(session.id);
  const npc = entities.find((e) => e.name === '阿吉');
  assert.ok(npc, 'NPC 阿吉应已创建（对应 e3）');
  const values = getEntityStateValues(session.id, [npc.entity_id]);
  assert.equal(values[npc.entity_id]?.favor, JSON.stringify(60));
});

test('待补全的实体本轮没出场也带上详情，AI 才能按已有信息补', async () => {
  resetMockEnv();
  const world = insertWorld(sandbox.db, { name: '补全世界' });
  const character = insertCharacter(sandbox.db, world.id, { name: '甲' });
  const session = insertSession(sandbox.db, { character_id: character.id, world_id: world.id });
  const { buildRuntimeUserPrompt } = await freshImport('backend/memory/state-update-context.js');
  const { upsertEntity, upsertProfileField } = await freshImport('backend/db/queries/state-memory.js');
  upsertEntity(session.id, { entityId: 'far-away', seq: 1, type: 'character', name: '远方的人', aliasesJson: '[]' }, 1);
  upsertProfileField(session.id, 'far-away', 'occupation', '"铁匠"', '迁移', 1);

  const prompt = buildRuntimeUserPrompt({
    sessionId: session.id, worldId: world.id, mainCharacterEntityId: null, valueSections: [], dialogue: '', responseKeys: [], round: 2,
    relevantIds: new Set(),
  });
  const details = prompt.slice(prompt.indexOf('【相关实体详情】'), prompt.indexOf('【待补全】'));
  assert.match(details, /e1｜character｜远方的人/);
  assert.match(details, /occupation=铁匠/);
  assert.match(prompt.slice(prompt.indexOf('【待补全】')), /e1｜远方的人｜缺档案：gender/);
});
