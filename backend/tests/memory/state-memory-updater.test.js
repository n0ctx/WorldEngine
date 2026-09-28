import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { createTestSandbox, freshImport, resetMockEnv } from '../helpers/test-env.js';
import {
  insertCharacter,
  insertCharacterStateField,
  insertMessage,
  insertPersona,
  insertPersonaStateField,
  insertSession,
  insertWorld,
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
  'state_relations', 'state_threads', 'state_world_profile', 'state_world_facts',
];

function snapshotStateMemoryCounts(sessionId) {
  return Object.fromEntries(STATE_MEMORY_TABLES.map((table) => [table, countRows(table, sessionId)]));
}

test('一次调用同时写用户字段和状态记忆：create_entity 带证据、set_present、set_world time', async () => {
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
      { op: 'set_present', entities: ['e1'] },
      { op: 'set_world', key: 'time', value: '1000-03-15T14:30' },
    ],
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
  assert.ok(presence.entity_ids.includes(player.entity_id));
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
  insertMessage(sandbox.db, session.id, { role: 'user', content: '这座城市禁止携带武器进入。', created_at: 1 });
  insertMessage(sandbox.db, session.id, { role: 'assistant', content: '守卫检查了你的行李。', created_at: 2 });

  process.env.MOCK_LLM_COMPLETE = JSON.stringify({
    entity_fields: {},
    memory: [
      { op: 'add_fact', text: '城市禁止携带武器进入', evidence: '这座城市禁止携带武器进入' },
    ],
  });

  const { updateAllStates } = await freshImport('backend/memory/combined-state-updater.js');
  await updateAllStates(world.id, [character.id], session.id);

  const { listCurrentWorldFacts } = await freshImport('backend/db/queries/state-memory.js');
  const facts = listCurrentWorldFacts(session.id);
  assert.equal(facts.length, 1);
  assert.equal(facts[0].text, '城市禁止携带武器进入');
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

  assert.ok(!system.includes('- occupation（'), 'occupation 档案字段应因同义用户字段停用');
  assert.ok(system.includes('career（职业'), 'NPC 适用字段清单应包含 career');
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
    memory: [{ op: 'add_fact', text: '本地货币是银币', evidence: '本地货币是银币' }],
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
